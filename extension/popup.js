const API = 'http://localhost:4173';
const $ = (selector) => document.querySelector(selector);
const form = $('#form');
const objective = $('#objective');
let activeTaskId = null;

document.querySelectorAll('[data-value]').forEach((button) => {
  button.addEventListener('click', () => { objective.value = button.dataset.value; });
});

chrome.tabs?.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
  if (tab?.url && /^https?:/.test(tab.url)) {
    $('#page-context').textContent = `Reading current page: ${tab.title || tab.url}`;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const task = await chrome.runtime.sendMessage({
      type: 'START_TASK',
      objective: objective.value,
    });
    if (task?.error) throw new Error(task.error);
    $('#workspace').classList.remove('hidden');
    $('#task-id').textContent = task.id;
    activeTaskId = task.id;
    render(task);
    const poll = setInterval(async () => {
      try {
        const result = await fetch(`${API}/api/tasks/${task.id}`);
        const current = await result.json();
        render(current);
        if (['completed', 'failed', 'awaiting_confirmation'].includes(current.status)) {
          clearInterval(poll);
          button.disabled = false;
        }
      } catch (error) {
        clearInterval(poll);
        $('#result').textContent = error.message;
        button.disabled = false;
      }
    }, 600);
  } catch (error) {
    $('#workspace').classList.remove('hidden');
    $('#status').textContent = 'Connection failed';
    $('#result').textContent = `Start the Nexus companion first with “npm start”. ${error.message}`;
    button.disabled = false;
  }
});

function render(task) {
  $('#status').textContent = {
    running: 'Working in the live browser…',
    completed: 'Research complete',
    failed: 'Research stopped safely',
    awaiting_confirmation: 'Confirmation required',
  }[task.status] || 'Preparing…';
  $('#events').replaceChildren(...task.events.map((event) => {
    const item = document.createElement('div');
    item.className = `event ${event.status}`;
    item.textContent = event.message;
    return item;
  }));
  if (task.answer) renderAnswer(task.answer, task.links || []);
  if (task.error) $('#result').textContent = task.error;
  const confirmation = $('#confirmation');
  if (task.status === 'awaiting_confirmation' && task.confirmation) {
    confirmation.classList.remove('hidden');
    $('#confirmation-details').textContent = `${task.confirmation.label} on ${task.confirmation.website}. ${task.confirmation.details} ${task.confirmation.consequence}`;
  } else {
    confirmation.classList.add('hidden');
  }
}

$('#confirm-action').addEventListener('click', async () => {
  if (!activeTaskId) return;
  await fetch(`${API}/api/tasks/${activeTaskId}/confirm`, {method: 'POST'});
});

$('#cancel-action').addEventListener('click', async () => {
  if (!activeTaskId) return;
  await fetch(`${API}/api/tasks/${activeTaskId}/cancel`, {method: 'POST'});
});

function renderAnswer(answer, links) {
  const linkMap = new Map(links.map((link) => [link.label, link.url]));
  const result = $('#result');
  result.replaceChildren();
  answer.split(/\n\n+/).forEach((paragraph) => {
    if (paragraph.startsWith('### ')) {
      const heading = document.createElement('h4');
      heading.textContent = paragraph.slice(4).trim();
      result.append(heading);
      return;
    }
    if (paragraph.startsWith('## ')) {
      const heading = document.createElement('h3');
      heading.textContent = paragraph.slice(3).trim();
      result.append(heading);
      return;
    }
    if (paragraph.split('\n').every((line) => line.startsWith('- '))) {
      const list = document.createElement('ul');
      paragraph.split('\n').forEach((line) => {
        const item = document.createElement('li');
        item.textContent = line.slice(2).trim();
        list.append(item);
      });
      result.append(list);
      return;
    }
    const element = document.createElement('p');
    let cursor = 0;
    const marker = /\[\[LINK:(.*?)\]\]|https?:\/\/[^\s<>)\]]+/g;
    let match;
    while ((match = marker.exec(paragraph))) {
      element.append(document.createTextNode(paragraph.slice(cursor, match.index)));
      const anchor = document.createElement('a');
      const rawUrl = match[0].startsWith('[[LINK:')
        ? linkMap.get(match[1]) || ''
        : match[0].replace(/[.,!?;:]+$/, '');
      anchor.href = rawUrl || '#';
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.textContent = match[0].startsWith('[[LINK:')
        ? match[1]
        : shortUrlLabel(rawUrl);
      element.append(anchor);
      cursor = marker.lastIndex;
    }
    element.append(document.createTextNode(paragraph.slice(cursor)));
    result.append(element);
  });
}

function shortUrlLabel(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const filename = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    if (filename && /\.[a-z0-9]{1,8}$/i.test(filename)) return filename;
    if (parsed.hostname.includes('github.com')) return 'GitHub';
    if (/docs?|documentation|readme/i.test(parsed.pathname)) return 'Documentation';
    if (/demo|video/i.test(parsed.pathname)) return 'Demo';
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}
