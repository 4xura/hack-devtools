const key = location.hash.slice(1);
const {theme = 'system'} = await chrome.storage.local.get('theme');
document.documentElement.dataset.theme = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
const data = key.startsWith('result:') ? (await chrome.storage.session.get(key))[key] : null;
if (!data || Date.now() - data.created > 24 * 60 * 60 * 1000) {
  document.getElementById('content').textContent = 'This result is no longer available.';
} else {
  document.getElementById('status').textContent = `${data.status ?? ''} · ${data.contentType || 'text/plain'}`;
  document.getElementById('source').textContent = data.source;
  document.getElementById('content').textContent = data.body;
}
