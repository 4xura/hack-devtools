export function openSidebar(windowId) {
  if (typeof chrome.sidePanel?.open !== 'function' || !chrome.runtime.getManifest().side_panel?.default_path) {
    throw new Error('Reload Hack-DevTools at chrome://extensions to enable the side panel.');
  }
  return chrome.sidePanel.open({windowId});
}
