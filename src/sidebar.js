import {isWebTab, isWorkspaceReady} from './tab-context.js';

const workspace = document.getElementById('workspace-frame');
const notice = document.getElementById('workspace-notice');
let workspaceTabId;
let updateId = 0;

function showNotice(message) {
  workspace.hidden = true;
  notice.textContent = message;
  notice.hidden = false;
}

function displayTab(tab) {
  const nextTabId = isWorkspaceReady(tab) ? tab.id : null;
  // Keep an existing editor alive during navigation in the same web tab.
  if (nextTabId === null && isWebTab(tab) && tab.id === workspaceTabId) {
    showNotice('Waiting for this page to load…');
    return;
  }
  if (workspaceTabId !== nextTabId) {
    workspace.src = nextTabId === null ? 'panel.html?blank' : `panel.html?tabId=${nextTabId}`;
    workspaceTabId = nextTabId;
  }
  notice.hidden = true;
  workspace.hidden = false;
}

async function trackActiveTab() {
  const {id: windowId} = await chrome.windows.getCurrent();

  async function refresh() {
    const requestId = ++updateId;
    try {
      const [tab] = await chrome.tabs.query({windowId, active: true});
      if (requestId === updateId) displayTab(tab);
    } catch {
      if (requestId === updateId) showNotice('Could not load the active tab.');
    }
  }

  chrome.tabs.onActivated.addListener(event => {
    if (event.windowId !== windowId) return;
    if (event.tabId !== workspaceTabId) showNotice('Loading workspace…');
    refresh();
  });
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (tab.windowId === windowId && tab.active && (change.status || change.url)) {
      ++updateId;
      displayTab(tab);
    }
  });
  await refresh();
}

trackActiveTab().catch(() => showNotice('Could not load the active tab.'));
