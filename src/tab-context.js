export function isWebTab(tab) {
  return Number.isSafeInteger(tab?.id) && tab.id >= 0 && /^https?:\/\//i.test(tab.url ?? '');
}

export function isWorkspaceReady(tab) {
  return isWebTab(tab) && tab.status === 'complete';
}
