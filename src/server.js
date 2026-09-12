import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {createPlan} from './planner.js';
import {createTask, addEvent, transition} from './state.js';
import {researchWithWebcmd, createWebcmdAdapter} from './webcmd.js';
import {runAgentLoop} from './agent-loop.js';
import {extractFindings, renderAnswer, linkLabel} from './extractor.js';
import {extractStructuredEvidence} from './structured.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tasks = new Map();

function json(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let value = '';
    req.on('data', (chunk) => {
      value += chunk;
      if (value.length > 1_000_000) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(value || '{}')); } catch { reject(new Error('Request body must be valid JSON.')); }
    });
  });
}

function emit(task, message, status = 'info') {
  addEvent(task, message, status);
}

function actionAnswer(task) {
  const verified = task.actions.filter((action) => action.status === 'verified').map((action) => action.label);
  const unresolved = task.actions.filter((action) => !['verified', 'completed'].includes(action.status)).map((action) => action.label);
  const lines = [
    task.status === 'completed'
      ? 'The agent completed the permitted workflow and verified the resulting browser state.'
      : `The agent stopped before completing the workflow: ${task.error || task.confirmationReason || 'additional user input is required.'}`,
  ];
  if (verified.length) lines.push(`Verified actions: ${verified.join(', ')}.`);
  if (unresolved.length) lines.push(`Remaining work: ${unresolved.join(', ')}.`);
  if (task.currentUrl) lines.push(`Current page: [[LINK:${linkLabel('', task.currentUrl, task.pageState?.title)}]].`);
  return lines.join('\n\n');
}

async function executeResearch(task) {
  transition(task, 'browse', 'running');
  emit(task, task.execution === 'extension-tab' ? 'Reading the active webpage' : 'Starting WebCMD live browser research', 'running');
  const result = task.execution === 'extension-tab'
    ? await task.extensionEvidencePromise
    : await researchWithWebcmd({objective: task.objective, taskId: task.id, emit: (message) => emit(task, message)});
  transition(task, 'browse', 'done');
  transition(task, 'extract', 'running');
  emit(task, 'Selecting only information related to your request');
  task.findings = extractFindings(result.text, result.url, task.objective);
  task.structuredEvidence = extractStructuredEvidence(result, task.objective);
  task.sources = [...new Set(task.findings.map((finding) => finding.url))];
  task.pageTitle = result.title || 'Current webpage';
  task.links = (result.links || []).map((link) => ({...link, label: linkLabel(link.label, link.url, task.pageTitle)}));
  if (result.url && !task.links.some((link) => link.url === result.url)) {
    task.links.unshift({label: linkLabel('', result.url, task.pageTitle), url: result.url});
  }
  transition(task, 'extract', 'done');
  transition(task, 'validate', 'done');
  transition(task, 'synthesize', 'running');
  task.answer = renderAnswer(task.findings, task.objective, {
    ...result,
    url: result.url,
    text: result.text,
    links: task.links,
    pageType: result.pageType,
    repository: result.repository,
    jsonLd: result.jsonLd,
    eventLines: result.eventLines,
    structuredEvidence: task.structuredEvidence,
  });
  transition(task, 'synthesize', 'done');
  task.status = 'completed';
  emit(task, `Completed with ${task.findings.length} relevant evidence item(s)`, 'success');
}

async function executeAction(task) {
  transition(task, 'browse', 'running');
  emit(task, 'Preparing a WebCMD browser session for the action workflow', 'running');
  const adapter = task.browserAdapter || await createWebcmdAdapter({
    taskId: task.id,
    emit: (message, status = 'info') => emit(task, message, status),
  });
  task.browserAdapter = adapter;
  task.browserSession = adapter.session;
  try {
    const memoryUrl = task.currentUrl || task.actions.find((action) => action.target?.url)?.target.url || 'https://www.google.com/';
    emit(task, 'Loading WebCMD site memory context before live browser work');
    await adapter.context(memoryUrl);
    transition(task, 'memory', 'done');
    transition(task, 'act', 'running');
    await runAgentLoop(task, adapter, {
      confirmed: task.confirmed === true,
      emit: (message, status) => emit(task, message, status),
    });
    if (task.status === 'awaiting_confirmation') {
      transition(task, 'act', 'waiting');
      return;
    }
    if (task.status === 'failed') return;
    transition(task, 'act', 'done');
    transition(task, 'verify', 'done');
    task.answer = actionAnswer(task);
    task.finalResult = {actions: task.actionHistory, verificationStatus: task.verificationStatus};
  } finally {
    if (task.status !== 'awaiting_confirmation') {
      await adapter.close();
      task.browserAdapter = null;
    }
  }
}

async function execute(task) {
  task.status = 'running';
  emit(task, 'Understanding the objective', 'running');
  transition(task, 'scope', 'done');
  emit(task, `${task.classification.taskType} mode: ${task.classification.capabilities.join(', ')}`);
  transition(task, 'memory', 'running');
  try {
    if (task.classification.taskType === 'ACTION') await executeAction(task);
    else await executeResearch(task);
  } catch (error) {
    task.status = 'failed';
    task.error = error.message;
    emit(task, `Stopped safely: ${error.message}`, 'error');
  }
}

function taskIdFromPath(pathname) {
  return pathname.split('/')[3];
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'OPTIONS' && requestUrl.pathname.startsWith('/api/')) {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      return res.end();
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
      return json(res, 200, {ok: true, webcmd: 'configured', agent: 'general-purpose'});
    }
    if (req.method === 'POST' && requestUrl.pathname === '/api/tasks') {
      const {objective, execution = 'webcmd', tabId} = await body(req);
      const plan = createPlan(objective);
      const task = createTask(objective, plan);
      task.execution = execution;
      task.tabId = tabId;
      if (execution === 'extension-tab' && task.classification.taskType === 'RESEARCH') {
        task.extensionEvidencePromise = new Promise((resolve, reject) => {
          task.resolveEvidence = resolve;
          task.rejectEvidence = reject;
        });
      }
      tasks.set(task.id, task);
      execute(task);
      return json(res, 202, task);
    }
    if (req.method === 'POST' && requestUrl.pathname.match(/^\/api\/tasks\/[^/]+\/evidence$/)) {
      const task = tasks.get(taskIdFromPath(requestUrl.pathname));
      if (!task) return json(res, 404, {error: 'Task not found'});
      if (task.classification.taskType !== 'RESEARCH') return json(res, 409, {error: 'Action tasks use the WebCMD execution path.'});
      const evidence = await body(req);
      task.resolveEvidence?.({
        text: evidence.text || '',
        url: evidence.url || 'about:blank',
        title: evidence.title || 'Active tab',
        description: evidence.description || '',
        headings: evidence.headings || [],
        links: evidence.links || [],
        pageType: evidence.pageType,
        repository: evidence.repository,
        jsonLd: evidence.jsonLd || [],
        eventLines: evidence.eventLines || [],
      });
      return json(res, 202, {ok: true});
    }
    if (req.method === 'POST' && requestUrl.pathname.match(/^\/api\/tasks\/[^/]+\/confirm$/)) {
      const task = tasks.get(taskIdFromPath(requestUrl.pathname));
      if (!task) return json(res, 404, {error: 'Task not found'});
      if (task.status !== 'awaiting_confirmation') return json(res, 409, {error: 'This task is not waiting for confirmation.'});
      task.confirmed = true;
      task.confirmationRequired = false;
      task.status = 'queued';
      emit(task, 'User confirmation received; resuming the workflow', 'info');
      execute(task);
      return json(res, 202, task);
    }
    if (req.method === 'POST' && requestUrl.pathname.match(/^\/api\/tasks\/[^/]+\/cancel$/)) {
      const task = tasks.get(taskIdFromPath(requestUrl.pathname));
      if (!task) return json(res, 404, {error: 'Task not found'});
      task.status = 'cancelled';
      task.error = 'The user cancelled the workflow.';
      emit(task, task.error, 'info');
      return json(res, 202, task);
    }
    if (req.method === 'GET' && requestUrl.pathname.startsWith('/api/tasks/')) {
      const task = tasks.get(requestUrl.pathname.split('/').pop());
      return task ? json(res, 200, task) : json(res, 404, {error: 'Task not found'});
    }
    if (req.method === 'GET') {
      const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
      const publicRoot = join(root, 'public');
      const filePath = join(publicRoot, pathname);
      if (!filePath.startsWith(`${publicRoot}/`)) return json(res, 400, {error: 'Invalid asset path'});
      const content = await readFile(filePath);
      const types = {'.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html'};
      res.writeHead(200, {'content-type': types[pathname.slice(pathname.lastIndexOf('.'))] || 'application/octet-stream'});
      res.end(content);
      return;
    }
    return json(res, 404, {error: 'Not found'});
  } catch (error) {
    return json(res, error.code === 'ENOENT' ? 404 : 500, {error: error.code === 'ENOENT' ? 'Not found' : error.message});
  }
});

server.listen(Number(process.env.PORT || 4173), () => {
  console.log(`Nexus listening on http://localhost:${process.env.PORT || 4173}`);
});
