import {TRANSFORMS, transform} from './transforms.js';
import {openSidebar} from './open-sidebar.js';

const openWorkspace = document.getElementById('open-workspace');
const workspaceStatus = document.getElementById('workspace-status');
const text = document.getElementById('quick-text');
const format = document.getElementById('quick-transform');
const apply = document.getElementById('quick-apply');
const copy = document.getElementById('quick-copy');
const scratchpadStatus = document.getElementById('scratchpad-status');
const quickFormats = new Set();
const draftKey = 'quickScratchpad';
let windowId;
let saveTimer;
let lastSavedText;

const groups = new Map();
for (const [value, label, category] of TRANSFORMS) {
  if (!category) continue;
  if (!groups.has(category)) {
    const group = document.createElement('optgroup');
    group.label = category;
    format.append(group);
    groups.set(category, group);
  }
  groups.get(category).append(new Option(label, value));
  quickFormats.add(value);
}

function showStatus(element, message = '') {
  element.textContent = message;
  element.hidden = !message;
}

chrome.windows.getCurrent().then(({id}) => {
  if (!Number.isSafeInteger(id) || id < 0) throw new Error('No browser window is available.');
  windowId = id;
  openWorkspace.disabled = false;
}).catch(() => showStatus(workspaceStatus, 'Could not find the browser window.'));

openWorkspace.addEventListener('click', async () => {
  if (windowId === undefined) return;
  try {
    // Call from the click handler so the browser keeps the user's activation.
    await openSidebar(windowId);
    window.close();
  } catch (error) {
    showStatus(workspaceStatus, error?.message || 'The browser could not open the sidebar.');
  }
});

function updateControls() {
  apply.disabled = text.disabled || !text.value;
  copy.disabled = apply.disabled;
}

function saveText() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistText, 150);
}

function persistText() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (text.disabled) return;
  if (text.value === lastSavedText) return;
  const value = text.value;
  lastSavedText = value;
  chrome.storage.session.set({[draftKey]: value}).catch(() => {
    lastSavedText = undefined;
    showStatus(scratchpadStatus, 'This text could not be saved for the session.');
  });
}

window.addEventListener('pagehide', persistText);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistText();
});

text.addEventListener('input', () => {
  showStatus(scratchpadStatus);
  updateControls();
  saveText();
});

apply.addEventListener('click', async () => {
  const source = text.value;
  const selected = text.selectionStart !== text.selectionEnd;
  const start = selected ? text.selectionStart : 0;
  const end = selected ? text.selectionEnd : source.length;
  const action = format.value;
  if (!source || !quickFormats.has(action)) return;
  try {
    const result = await transform(action, source.slice(start, end));
    if (text.value !== source) return;
    text.setRangeText(result, start, end, 'select');
    text.focus();
    showStatus(scratchpadStatus);
    updateControls();
    saveText();
  } catch {
    showStatus(scratchpadStatus, 'The text does not match the selected format.');
  }
});

copy.addEventListener('click', async () => {
  if (!text.value) return;
  try {
    await navigator.clipboard.writeText(text.value);
    showStatus(scratchpadStatus, 'Copied.');
  } catch {
    text.focus();
    text.select();
    showStatus(scratchpadStatus, 'Text selected. Use your copy shortcut.');
  }
});

chrome.storage.local.get('theme').then(({theme}) => {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
}).catch(() => {});

chrome.storage.session.get(draftKey).then(stored => {
  if (typeof stored[draftKey] === 'string') text.value = stored[draftKey];
  lastSavedText = text.value;
}).catch(() => {
  showStatus(scratchpadStatus, 'Scratchpad text could not be restored.');
}).finally(() => {
  text.disabled = false;
  format.disabled = false;
  updateControls();
});
