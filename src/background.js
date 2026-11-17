import {validateRequest, parseForm, normalizeUrl, editableHeaders, parseHeaders} from './core.js';

const tabQueues = new Map();
let fetchQueue = Promise.resolve();
let activeFetchCapture = null;
let activeRedirectCapture = null;
const FETCH_RULE_ID = 2147483647;
const sessionKey = (kind, tabId) => `${kind}:${tabId}`;
const extensionOrigin = chrome.runtime.getURL('/').replace(/\/$/, '');
const extensionInitiatorDomain = new URL(chrome.runtime.getURL('/')).hostname;
const isFirefox = typeof chrome.runtime.getBrowserInfo === 'function';
const extraHeaderSpec = isFirefox ? [] : ['extraHeaders'];

function serial(queue, key, action) {
  const previous = queue.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  queue.set(key, next);
  next.finally(() => { if (queue.get(key) === next) queue.delete(key); }).catch(() => {});
  return next;
}

async function recordRequest(details) {
  if (details.tabId < 0) return;
  const key = sessionKey('capture', details.tabId);
  let body = '';
  if (details.requestBody?.formData) {
    const fields = new URLSearchParams();
    for (const [name, values] of Object.entries(details.requestBody.formData)) for (const value of values) fields.append(name, value);
    body = fields.toString();
  } else if (details.requestBody?.raw) {
    const decoder = new TextDecoder();
    for (const chunk of details.requestBody.raw) if (chunk.bytes) body += decoder.decode(chunk.bytes, {stream: true});
    body += decoder.decode();
  }
  await chrome.storage.session.set({[key]: {url: details.url, method: details.method, body: body.slice(0, 1048576)}});
}

function submitForm(url, fields) {
  const form = document.createElement('form');
  form.method = 'POST'; form.action = url; form.acceptCharset = 'UTF-8';
  for (const {name, value} of fields) {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = value;
    form.appendChild(input);
  }
  (document.body || document.documentElement).appendChild(form);
  HTMLFormElement.prototype.submit.call(form);
}

function headerRule(id, headers, condition) {
  return {id, priority: 1, action: {type: 'modifyHeaders', requestHeaders: headers.map(({name, value}) => ({header: name, operation: 'set', value}))}, condition};
}

async function navigate(request) {
  const id = request.tabId + 1;
  const addRules = request.headers.length ? [headerRule(id, request.headers, {tabIds: [request.tabId], resourceTypes: ['main_frame'], requestDomains: [new URL(request.url).hostname]})] : [];
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [id], addRules});
  if (request.method === 'GET') await chrome.tabs.update(request.tabId, {url: request.url});
  else await chrome.scripting.executeScript({target: {tabId: request.tabId}, func: submitForm, args: [request.url, parseForm(request.body)]});
  return {mode: 'navigate', message: 'Request sent to the inspected tab.'};
}

async function readPreview(response) {
  const reader = response.body?.getReader();
  if (!reader) return {body: '', truncated: false};
  const decoder = new TextDecoder();
  let body = '', total = 0, truncated = false;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      const remaining = 1048576 - total;
      body += decoder.decode(value.subarray(0, remaining), {stream: true});
      total += value.byteLength;
      if (total > 1048576) {truncated = true; await reader.cancel(); break;}
    }
    body += decoder.decode();
  } finally { reader.releaseLock(); }
  return {body, truncated};
}

async function fetchRequest(request, captureHeaders = false) {
  if (isFirefox && request.pauseRedirects) throw new Error('Firefox cannot inspect intermediate redirects from extension Fetch requests. Turn off Pause on redirects.');
  // Chrome-managed headers are applied through a temporary network rule.
  const headers = [...request.headers];
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  if (hasBody && !headers.some(header => header.name.toLowerCase() === 'content-type')) {
    headers.push({name: 'Content-Type', value: {form: 'application/x-www-form-urlencoded;charset=UTF-8', json: 'application/json', xml: 'application/xml', text: 'text/plain;charset=UTF-8'}[request.bodyType]});
  }
  const rule = headerRule(FETCH_RULE_ID, headers, {tabIds: [-1], initiatorDomains: [extensionInitiatorDomain], requestDomains: [new URL(request.url).hostname], resourceTypes: ['xmlhttprequest']});
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [FETCH_RULE_ID], addRules: headers.length ? [rule] : []});
  const started = performance.now();
  if (captureHeaders) activeFetchCapture = {headers: []};
  if (request.pauseRedirects) {
    const networkUrl = new URL(request.url);
    networkUrl.hash = '';
    activeRedirectCapture = {url: networkUrl.href, hop: null};
  }
  try {
    const response = await fetch(request.url, {
      method: request.method,
      ...(hasBody ? {body: request.body || ''} : {}),
      credentials: 'include', cache: 'no-store', redirect: request.pauseRedirects ? 'manual' : 'follow', signal: AbortSignal.timeout(30000)
    });
    if (response.type === 'opaqueredirect') {
      const hop = activeRedirectCapture?.hop;
      if (!hop?.location) throw new Error('Chrome detected a redirect but did not expose its Location.');
      return {mode:'fetch', manualRedirect:true, url:request.url, status:hop.statusCode, statusText:hop.statusText, location:hop.location, headers:hop.headers, contentType:'', redirected:false, duration:Math.round(performance.now()-started), body:'', truncated:false};
    }
    if (captureHeaders) {
      await response.body?.cancel();
      const headersText = editableHeaders(activeFetchCapture.headers);
      if (!headersText) throw new Error('Chrome did not expose request headers for this page.');
      return {url: response.url, headersText};
    }
    const preview = await readPreview(response);
    return {mode: 'fetch', url: response.url, status: response.status, statusText: response.statusText, contentType: response.headers.get('content-type') || '', redirected: response.redirected, headers: [...response.headers].map(([name, value]) => `${name}: ${value}`).join('\n'), duration: Math.round(performance.now() - started), ...preview};
  } finally {
    activeFetchCapture = null;
    activeRedirectCapture = null;
    await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [FETCH_RULE_ID]});
  }
}

async function fetchPageHeaders(tabId) {
  return serial(tabQueues, tabId, async () => {
    const tab = await chrome.tabs.get(tabId);
    const pageUrl = new URL(normalizeUrl(tab.url));
    pageUrl.hash = '';
    const url = pageUrl.href;
    const key = sessionKey('page-headers', tabId);
    const captured = (await chrome.storage.session.get(key))[key];
    if (isFirefox) {
      const headersText = captured?.url === url ? editableHeaders(captured.headers) : '';
      if (!headersText) throw new Error('Reload the inspected page to capture its request headers in Firefox.');
      return {url, headersText};
    }
    // Preserve the page's authentication and normal content negotiation.
    const headers = captured?.url === url ? parseHeaders(editableHeaders(captured.headers)).filter(header => /^(?:accept|accept-language|authorization|cookie|origin|referer|user-agent)$/i.test(header.name)) : [];
    const job = fetchQueue.catch(() => {}).then(() => fetchRequest({url, method:'GET', headers}, true));
    fetchQueue = job;
    return job;
  });
}

async function execute(data) {
  const request = validateRequest(data);
  return serial(tabQueues, request.tabId, async () => {
    let result;
    if (request.mode === 'navigate') result = await navigate(request);
    else {
      const job = fetchQueue.catch(() => {}).then(() => fetchRequest(request));
      fetchQueue = job;
      result = await job;
    }
    const key = sessionKey('history', request.tabId);
    const stored = await chrome.storage.session.get(key);
    const {headers, ...draft} = request;
    const history = [{...draft, time: Date.now()}, ...(stored[key] || [])].slice(0, 30);
    await chrome.storage.session.set({[key]: history});
    return result;
  });
}

async function followUp(data) {
  const request = validateRequest(data);
  if (request.method !== 'GET' || request.mode !== 'fetch') throw new Error('Follow-up requests must be Fetch GET requests.');
  return serial(tabQueues, request.tabId, async () => {
    const job = fetchQueue.catch(() => {}).then(() => fetchRequest(request));
    fetchQueue = job;
    return job;
  });
}

async function openResult(data) {
  if (!data || typeof data.body !== 'string' || data.body.length > 1048576 || typeof data.url !== 'string') throw new Error('No response is available to open.');
  const source = normalizeUrl(data.url);
  const key = `result:${crypto.randomUUID()}`;
  await chrome.storage.session.set({[key]: {source, body: data.body, contentType: String(data.contentType || ''), status: data.status, created: Date.now()}});
  const tab = await chrome.tabs.create({url: chrome.runtime.getURL(`viewer.html#${key}`), active: true});
  await chrome.storage.session.set({[`viewer:${tab.id}`]: key});
  return {tabId: tab.id};
}

async function handle(message) {
  const tabId = message.tabId ?? message.request?.tabId;
  if (!Number.isInteger(tabId) || tabId < 0) throw new Error('No inspected tab is available.');
  switch (message.action) {
    case 'fetch-headers': return fetchPageHeaders(tabId);
    case 'follow-up': return followUp(message.request);
    case 'open-result': return openResult(message.result);
    case 'execute': return execute(message.request);
    case 'load': {
      const tab = await chrome.tabs.get(tabId);
      const key = sessionKey('capture', tabId);
      const stored = await chrome.storage.session.get(key);
      const capture = stored[key];
      return {url: tab.url, method: capture?.url === tab.url ? capture.method : 'GET', body: capture?.url === tab.url ? capture.body : ''};
    }
    case 'history': {
      const key = sessionKey('history', tabId);
      return (await chrome.storage.session.get(key))[key] || [];
    }
    case 'clear-history':
      await chrome.storage.session.remove(sessionKey('history', tabId)); return {};
    case 'reset-headers':
      return serial(tabQueues, tabId, async () => {
        await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [tabId + 1]});
        return {};
      });
    default: throw new Error('Unknown request action.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('panel.html')) return;
  handle(message).then(result => respond({ok: true, result}), error => respond({ok: false, error: error.message}));
  return true;
});
chrome.webRequest.onBeforeRequest.addListener(details => {
  serial(tabQueues, `capture:${details.tabId}`, () => recordRequest(details)).catch(() => {});
}, {urls: ['http://*/*', 'https://*/*'], types: ['main_frame']}, ['requestBody']);

chrome.webRequest.onSendHeaders.addListener(details => {
  if (activeFetchCapture && details.tabId === -1 && details.initiator === extensionOrigin) {
    activeFetchCapture.headers = details.requestHeaders || [];
  }
  if (details.type === 'main_frame' && details.tabId >= 0) {
    serial(tabQueues, `capture:${details.tabId}`, () => chrome.storage.session.set({
      [sessionKey('page-headers', details.tabId)]: {url: details.url, headers: details.requestHeaders || []}
    })).catch(() => {});
  }
}, {urls: ['http://*/*', 'https://*/*'], types: ['main_frame', 'xmlhttprequest']}, ['requestHeaders', ...extraHeaderSpec]);

chrome.webRequest.onHeadersReceived.addListener(details => {
  if (!activeRedirectCapture || details.tabId !== -1 || details.initiator !== extensionOrigin) return;
  const observedUrl = new URL(details.url);
  observedUrl.hash = '';
  if (observedUrl.href !== activeRedirectCapture.url) return;
  if (![301,302,303,307,308].includes(details.statusCode)) return;
  const location = details.responseHeaders?.find(header => header.name.toLowerCase() === 'location')?.value;
  activeRedirectCapture.hop = {statusCode: details.statusCode, statusText: details.statusLine?.replace(/^HTTP\/\S+\s+\d+\s*/, '') || '', location, headers: (details.responseHeaders || []).map(({name,value}) => `${name}: ${value ?? ''}`).join('\n')};
}, {urls: ['http://*/*','https://*/*'], types: ['xmlhttprequest']}, ['responseHeaders', ...extraHeaderSpec]);

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.declarativeNetRequest.updateSessionRules({removeRuleIds: [tabId + 1]}).catch(() => {});
  chrome.storage.session.get(`viewer:${tabId}`).then(async stored => {
    const key = stored[`viewer:${tabId}`];
    if (key) await chrome.storage.session.remove([`viewer:${tabId}`, key]);
  }).catch(() => {});
  serial(tabQueues, `capture:${tabId}`, () => chrome.storage.session.remove(['capture', 'page-headers', 'history', 'draft'].map(kind => sessionKey(kind, tabId)))).catch(() => {});
});
