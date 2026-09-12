import {spawn} from 'node:child_process';
import {withRecovery} from './recovery.js';
function run(args, input, timeoutMs=45000){return new Promise((resolve,reject)=>{const p=spawn('webcmd',args,{env:{...process.env}});let out='',err='',done=false;const timer=setTimeout(()=>{p.kill('SIGTERM');reject(new Error('WebCMD command timed out'));},timeoutMs);p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',e=>{clearTimeout(timer);reject(new Error(`WebCMD unavailable: ${e.message}`));});p.on('close',code=>{if(done)return;done=true;clearTimeout(timer);if(code!==0)reject(new Error(err.trim()||`WebCMD exited with ${code}`));else resolve(out);});if(input)p.stdin.end(input);});}
function parseRun(output, fallback = {}) { try { const parsed=JSON.parse(output); return parsed.result&&typeof parsed.result==='object'?parsed.result:parsed; } catch { return {...fallback,text:output}; } }
async function createSession(profile, taskId) {
  try { await run(['profile','create',profile]); } catch(e) { if(!/already exists|PROFILE_EXISTS/i.test(e.message)) throw e; }
  const sessionOut=await run(['--profile',profile,'session','create',`Nexus ${taskId}`]);
  const session=(sessionOut.match(/id:\s*([^\s]+)/)||[])[1];
  if(!session) throw new Error('WebCMD did not return a session id.');
  return session;
}

function actionScript(action, task) {
  const target = action.target || {};
  const targetJson = JSON.stringify(target);
  const valueJson = JSON.stringify(action.value ?? '');
  return `
    const target = ${targetJson};
    const value = ${valueJson};
    const locate = () => target.role
      ? page.getByRole(target.role, { name: target.name || undefined })
      : target.label
        ? page.getByLabel(target.label)
        : target.text
          ? page.getByText(target.text, { exact: target.exact !== false })
          : target.selector
            ? page.locator(target.selector)
            : null;
    const locator = locate();
    if (${JSON.stringify(action.type)} === 'NAVIGATE') {
      await page.goto(target.url || ${JSON.stringify(task.currentUrl || 'https://www.google.com/')}, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } else if (${JSON.stringify(action.type)} === 'CLICK' || ['ADD_TO_CART', 'BOOK', 'SUBMIT', 'PURCHASE'].includes(${JSON.stringify(action.type)})) {
      if (!locator) throw new Error('The action needs a verified semantic target before it can click.');
      await locator.click();
    } else if (${JSON.stringify(action.type)} === 'TYPE' || ${JSON.stringify(action.type)} === 'FILL_FORM') {
      if (!locator) throw new Error('The form field target could not be identified.');
      await locator.fill(value);
    } else if (${JSON.stringify(action.type)} === 'SELECT') {
      if (!locator) throw new Error('The select control target could not be identified.');
      await locator.selectOption(value);
    } else if (${JSON.stringify(action.type)} === 'SCROLL') {
      await page.mouse.wheel(0, Number(value) || 700);
    } else if (${JSON.stringify(action.type)} === 'WAIT') {
      await page.waitForTimeout(Number(value) || 500);
    }
    return { url: page.url(), title: await page.title(), text: (await page.locator('body').innerText()).slice(0, 12000) };
  `;
}

export async function createWebcmdAdapter({taskId, emit, profile=process.env.WEB_CMD_PROFILE||'nexus'}) {
  const session=await createSession(profile, taskId);
  let closed=false;
  return {
    session,
    async context(url) { await run(['site','memory','context',url,'--task-id',taskId,'-f','json']); },
    async execute(action, task) {
      const output=await run(['--profile',profile,'--session',session,'browser','run','--stdin'], actionScript(action, task));
      emit(`WebCMD observed ${action.type.toLowerCase()} state`);
      return parseRun(output, {url:task.currentUrl || '',title:'WebCMD page'});
    },
    async close() { if (!closed) { closed=true; await run(['--profile',profile,'session','close',session]).catch(()=>{}); } },
  };
}

export async function researchWithWebcmd({objective, taskId, emit, profile=process.env.WEB_CMD_PROFILE||'nexus'}) { let session; try { await run(['profile','create',profile]); } catch(e) { if(!/already exists|PROFILE_EXISTS/i.test(e.message)) throw e; }
  const sessionOut=await run(['--profile',profile,'session','create',`Nexus ${taskId}`]); session=(sessionOut.match(/id:\s*([^\s]+)/)||[])[1]; if(!session) throw new Error('WebCMD did not return a session id.');
  try { const url='https://www.google.com/search?q='+encodeURIComponent(objective); emit('Loading WebCMD memory context for a trusted research surface'); await run(['site','memory','context',url,'--task-id',taskId,'-f','json']); emit('Opening a live browser session'); const script=`await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.locator('body').waitFor({ state: 'attached', timeout: 10000 }); return {url:page.url(), title:await page.title(), text:(await page.locator('body').innerText()).slice(0,12000)};`; const output=await withRecovery(()=>run(['--profile',profile,'--session',session,'browser','run','--stdin','--no-snapshot-diff'],script),{maxAttempts:3,onRetry:async(a)=>emit(`Recovery attempt ${a+1}: refreshing live page`)}); let parsed; try{parsed=JSON.parse(output)}catch{parsed={text:output,url,title:'WebCMD result'};} const data=parsed.result&&typeof parsed.result==='object'?parsed.result:parsed; return {url:data.url||url,title:data.title||'Live page',text:data.text||data.body||data.content||output,session}; } finally { await run(['--profile',profile,'session','close',session]).catch(()=>{}); }
}
