const API = 'http://localhost:4173';

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'START_TASK') return false;
  startInActiveTab(message.objective, message.tabId)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});

async function startInActiveTab(objective) {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabId = activeTab?.id;
  if (!tabId) throw new Error('No active browser tab is available. Open a normal web page and try again.');
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:/.test(tab.url || '')) {
    throw new Error(`Nexus cannot search this tab (${tab.url || 'unknown URL'}). Open an http:// or https:// page and try again.`);
  }
  const response = await fetch(`${API}/api/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ objective, execution: 'extension-tab', tabId }),
  });
  if (!response.ok) throw new Error(`Nexus server returned ${response.status}`);
  const task = await response.json();
  if (task.classification?.taskType === 'ACTION') return task;
  await new Promise((resolve) => setTimeout(resolve, 500));
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      url: location.href,
      title: document.title,
      pageType: /github\.com\/[^/]+\/[^/]+/.test(location.hostname + location.pathname) ? 'github-repository' : 'webpage',
      description: document.querySelector('meta[name="description"]')?.content || '',
      headings: [...document.querySelectorAll('h1, h2, h3')].map((node) => node.innerText.trim()).filter(Boolean).slice(0, 8),
      repository: (() => {
        const name = document.querySelector('[itemprop="name"], [data-testid="repository-name"]')?.innerText?.trim();
        const description = document.querySelector('[data-testid="about-description"], [itemprop="description"]')?.innerText?.trim();
        const readme = document.querySelector('#readme article, [data-testid="readme-container"]')?.innerText?.trim();
        return { name: name || '', description: description || '', readme: readme?.slice(0, 12000) || '' };
      })(),
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => {
        try { return JSON.parse(node.textContent || ''); } catch { return null; }
      }).filter(Boolean),
      eventLines: [...document.querySelectorAll('time, [datetime], [aria-label*="date" i], [aria-label*="time" i], [class*="date" i], [class*="time" i], [class*="location" i], [class*="venue" i]')]
        .map((node) => `${node.innerText?.trim() || ''} ${node.getAttribute('aria-label') || ''} ${node.getAttribute('datetime') || ''}`.trim())
        .filter(Boolean).slice(0, 80),
      links: [...document.querySelectorAll('a[href]')].map((link) => ({
        label: link.innerText.trim() || link.getAttribute('aria-label')?.trim() || '',
        url: link.href,
      })).filter((link) => link.label && /^https?:/.test(link.url)).slice(0, 12),
      text: document.querySelector('main')?.innerText?.slice(0, 12000) || document.body?.innerText?.slice(0, 12000) || '',
    }),
  });
  const evidence = await fetch(`${API}/api/tasks/${task.id}/evidence`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(result),
  });
  if (!evidence.ok) throw new Error(`Could not submit active-tab evidence (${evidence.status})`);
  return task;
}
