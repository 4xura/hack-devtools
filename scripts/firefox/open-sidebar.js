export function openSidebar() {
  if (typeof browser.sidebarAction?.open !== 'function' || !browser.runtime.getManifest().sidebar_action?.default_panel) {
    throw new Error('Reload the Firefox build of Hack-DevTools to enable the sidebar.');
  }
  return browser.sidebarAction.open();
}
