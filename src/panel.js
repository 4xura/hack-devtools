import {columnList, interpolate, validateRequest, normalizeUrl, mergeHeaders, resolveFollowUp, readResponseField, nextRedirectRequest} from './core.js';
import {TRANSFORMS, transform} from './transforms.js';
import {PAYLOADS, CATEGORIES, searchPayloads} from './payloads.js';

const $ = id => document.getElementById(id);
const tabId = chrome.devtools?.inspectedWindow?.tabId ?? -1;
const draftKey = `draft:${tabId}`;
const editors = ['url', 'body', 'headers', 'scratch'];
const labels = {url: 'URL', body: 'request body', headers: 'headers', scratch: 'scratchpad'};
let target = $('url'), category = 'All';
let rootResponse = null, displayedResponse = null, polling = false;
let pendingRedirect = null;
const undoStacks = new WeakMap();
let draftTimer, settingsTimer;

function status(message, error = false, pending = false) {
  $('status').textContent = message;
  $('status').title = message;
  $('status').dataset.error = String(error);
  $('status').hidden = !error && !pending;
}
async function message(action, extra = {}) {
  const response = await chrome.runtime.sendMessage({action, tabId, ...extra});
  if (!response?.ok) throw new Error(response?.error || 'The request worker did not respond.');
  return response.result;
}
function readRequest() {
  return {tabId, url: $('url').value, method: $('method').value, mode: $('mode').value, bodyType: $('body-type').value, body: $('body').value, headersText: $('headers').value, pauseRedirects: $('pause-redirects').checked};
}
function writeRequest(request) {
  for (const [field, key] of [['url', 'url'], ['method', 'method'], ['mode', 'mode'], ['body-type', 'bodyType'], ['body', 'body'], ['headers', 'headersText']]) {
    if (request[key] !== undefined) $(field).value = request[key];
  }
  $('pause-redirects').checked = !!request.pauseRedirects;
  updateMode(); saveDraft();
}
function saveDraft() {
  $('body-count').textContent = `${$('body').value.length.toLocaleString()} characters`;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    chrome.storage.session.set({[draftKey]: {...readRequest(), scratch: $('scratch').value}}).catch(error => status(error.message, true));
  }, 200);
}
function updateMode() {
  const navigation = $('mode').value === 'navigate';
  $('pause-redirects').disabled = navigation;
  if (navigation) $('pause-redirects').checked = false;
  const method = $('method').value;
  $('body').disabled = method === 'GET' || method === 'HEAD';
  $('mode-hint').textContent = navigation ? 'GET or form POST in the inspected page' : 'Raw request with a text response preview · 30s timeout';
}
function remember(field) {
  const stack = undoStacks.get(field) || [];
  stack.push({value: field.value, start: field.selectionStart, end: field.selectionEnd});
  undoStacks.set(field, stack.slice(-30));
}
function insert(text) {
  remember(target);
  target.setRangeText(text, target.selectionStart, target.selectionEnd, 'select');
  target.focus(); saveDraft();
}
function templateValues(entry) {
  const values = {};
  for (const key of ['column_count', 'seconds', 'database', 'table', 'columns', 'file', 'host', 'port', 'path']) values[key] = $(`opt-${key.replaceAll('_', '-')}`).value;
  if (entry.template.includes('{{origin}}')) values.origin = new URL(normalizeUrl($('url').value)).origin;
  if (entry.template.includes('{{path}}') && (!values.path.startsWith('/') || /[?#\r\n]/.test(values.path))) throw new Error('Target path must start with / and have no query or fragment.');
  if (/\{\{(?:column_count|number_columns|null_columns)\}\}/.test(entry.template)) {
    values.number_columns = columnList(values.column_count);
    values.null_columns = columnList(values.column_count, 'null');
  }
  if (entry.template.includes('{{seconds}}')) {
    const delay = Number(values.seconds);
    if (!Number.isInteger(delay) || delay < 1 || delay > 59) throw new Error('Delay must be between 1 and 59 seconds.');
    if (entry.section === 'MSSQL') values.seconds = String(delay).padStart(2, '0');
  }
  if (entry.template.includes('{{port}}')) {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
  }
  if (entry.template.includes('{{host}}') && !/^[a-z\d][a-z\d.-]*$/i.test(values.host)) throw new Error('Host must be an IPv4 address or hostname.');
  values.relative_file = values.file.replace(/^\/+/, '');
  values.selected = target.value.slice(target.selectionStart, target.selectionEnd) || 'probe';
  return values;
}
function renderPayloads() {
  const results = searchPayloads($('search').value, category);
  $('payload-count').textContent = `${results.length} / ${PAYLOADS.length}`;
  const fragment = document.createDocumentFragment();
  let previousGroup = '';
  for (const entry of results) {
    const heading = `${entry.category} / ${entry.section}`;
    if (heading !== previousGroup) {
      const title = document.createElement('div'); title.className = 'payload-group'; title.textContent = heading;
      fragment.append(title); previousGroup = heading;
    }
    const button = document.createElement('button'); button.className = 'payload'; button.type = 'button';
    const label = document.createElement('span'); label.textContent = entry.label;
    const code = document.createElement('code'); code.textContent = entry.template;
    button.append(label, code); button.title = entry.template;
    button.addEventListener('click', () => {
      try {
        const text = interpolate(entry.template, templateValues(entry));
        if (entry.target === 'headers') {
          remember($('headers')); $('headers').value = mergeHeaders($('headers').value, text); $('headers').focus(); saveDraft();
        } else if (entry.target === 'url') {
          remember($('url')); $('url').value = text; $('url').focus(); saveDraft();
        } else insert($('encode-insert').checked ? encodeURIComponent(text) : text);
        status(`Inserted ${entry.label} into ${labels[target.id]}.`);
      } catch (error) { status(error.message, true); }
    });
    fragment.append(button);
  }
  if (!results.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No matching payloads. Try another search.'; fragment.append(empty);
  }
  $('payload-list').replaceChildren(fragment);
}
async function renderHistory() {
  const history = await message('history');
  const fragment = document.createDocumentFragment();
  for (const entry of history) {
    const button = document.createElement('button'); button.className = 'history-entry';
    const method = document.createElement('strong'); method.textContent = entry.method;
    const url = document.createElement('span'); url.textContent = entry.url;
    const time = document.createElement('time'); time.textContent = new Date(entry.time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    button.append(method, url, time); button.title = `${entry.mode}: ${entry.url}`;
    button.addEventListener('click', () => {writeRequest(entry); status('History restored. Review it, then Send.');});
    fragment.append(button);
  }
  if (!history.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Requests from this tab appear here for the current browser session.'; fragment.append(empty);
  }
  $('history-list').replaceChildren(fragment);
}
async function send() {
  if ($('send').disabled) return;
  try {
    const request = validateRequest(readRequest());
    pendingRedirect = null;
    $('follow-pane').open = false;
    $('follow-url').value = '';
    $('send').disabled = true; status('Sending request…', false, true);
    const result = await message('execute', {request});
    if (result.mode === 'fetch') {
      rootResponse = result;
      pendingRedirect = result.manualRedirect ? {request, result} : null;
      showResponse(result);
      suggestFollowUp(result);
      $('response-pane').scrollIntoView({block: 'nearest'});
      status(`Response ${result.status} received.`);
    } else status(result.message);
    if (!$('history-pane').hidden) await renderHistory();
  } catch (error) { status(error.message, true); }
  finally { $('send').disabled = false; }
}

function showResponse(result, extracted = null) {
  displayedResponse = extracted === null ? result : {...result, body: extracted, contentType: 'text/plain; charset=utf-8'};
  $('response-pane').hidden = false;
  $('response-meta').textContent = `${result.status} ${result.statusText} · ${result.duration} ms${result.truncated ? ' · preview limited to 1 MiB' : ''}${result.redirected ? ' · redirected' : ''}`;
  $('open-destination').hidden = !result.redirected;
  $('open-result').hidden = !!result.manualRedirect;
  $('redirect-pane').hidden = !result.manualRedirect;
  $('follow-pane').hidden = !!result.manualRedirect;
  $('response-body').hidden = !!result.manualRedirect;
  if (result.manualRedirect) {
    const next = nextRedirectRequest(pendingRedirect.request, result);
    $('redirect-status').textContent = `${result.status} ${result.statusText}`;
    $('redirect-method').textContent = next.method;
    $('redirect-url').textContent = next.url;
    $('redirect-tab').disabled = next.method !== 'GET';
    $('redirect-tab').title = next.method === 'GET' ? 'Continue this hop in the inspected tab' : 'Navigation cannot preserve this method and body. Follow with Fetch.';
  }
  $('response-url').textContent = result.url;
  $('response-headers').textContent = result.headers;
  $('response-body').value = result.body;
  $('result-pane').hidden = extracted === null;
  $('result-text').textContent = extracted ?? '';
}

async function continueRedirect(delivery) {
  if (!pendingRedirect) return;
  const button = delivery === 'fetch' ? $('redirect-fetch') : $('redirect-tab');
  try {
    const next = nextRedirectRequest(pendingRedirect.request, pendingRedirect.result);
    if (delivery === 'navigate' && next.method !== 'GET') throw new Error(`${next.status || 'This'} redirect preserves ${next.method}; continue with Fetch.`);
    button.disabled = true;
    status(`Following redirect with ${delivery === 'fetch' ? 'Fetch' : 'tab navigation'}…`, false, true);
    const request = {...next, mode: delivery, pauseRedirects: delivery === 'fetch'};
    const result = await message('execute', {request});
    pendingRedirect = result.manualRedirect ? {request, result} : null;
    if (delivery === 'fetch') {
      rootResponse = result;
      showResponse(result);
      suggestFollowUp(result);
      status(result.manualRedirect ? `Paused at ${result.status}.` : `Response ${result.status} received.`);
    } else {
      $('redirect-pane').hidden = true;
      status('Redirect opened in the inspected tab.');
    }
    if (!$('history-pane').hidden) await renderHistory();
  } catch (error) { status(error.message, true); }
  finally { button.disabled = false; }
}

function suggestFollowUp(result) {
  try {
    const data = JSON.parse(result.body);
    if (typeof data.status_url === 'string') $('follow-url').value = '{{response.status_url}}';
    else if (typeof data.job_url === 'string') $('follow-url').value = '{{response.job_url}}';
    else if (data.job_id && new URL(result.url).pathname === '/api/check-in') $('follow-url').value = '/api/print-jobs/{{response.job_id}}';
    if ($('follow-url').value) $('follow-pane').open = true;
  } catch { /* Non-JSON responses have no suggested follow-up. */ }
}

async function followRequest(repeat) {
  if (polling) return;
  try {
    const url = resolveFollowUp($('follow-url').value, rootResponse);
    const stateField = $('follow-state').value.trim();
    const readyValue = $('follow-ready').value.trim();
    const resultField = $('follow-field').value.trim();
    if (repeat && (!stateField || !readyValue)) throw new Error('Set the state field and ready value before polling.');
    polling = true;
    $('follow-once').disabled = true;
    $('follow-poll').disabled = true;
    $('follow-stop').hidden = !repeat;
    for (let attempt = 1; attempt <= (repeat ? 30 : 1) && polling; attempt++) {
      status(`Follow-up GET ${attempt}${repeat ? ' / 30' : ''}…`, false, true);
      const result = await message('follow-up', {request: {tabId, url, method: 'GET', mode: 'fetch', bodyType: 'text', body: '', headersText: $('headers').value}});
      if (!polling) break;
      showResponse(result);
      if (result.status >= 400) throw new Error(`Follow-up returned HTTP ${result.status}.`);
      if (!repeat) {
        try {showResponse(result, readResponseField(result.body, resultField));} catch { /* The raw response remains available. */ }
        status(`Follow-up returned ${result.status}.`);
        break;
      }
      let data;
      try { data = JSON.parse(result.body); } catch { throw new Error('Polling requires JSON responses.'); }
      const state = stateField.split('.').reduce((item, key) => item?.[key], data);
      if (state === undefined || state === null) throw new Error(`State field ${stateField} was not found.`);
      if (String(state) === readyValue) {
        showResponse(result, readResponseField(result.body, resultField));
        $('result-pane').scrollIntoView({block: 'nearest'});
        status('Follow-up result is ready.');
        break;
      }
      if (['failed', 'error', 'cancelled'].includes(String(state).toLowerCase())) throw new Error(`Follow-up job ${state}.`);
      if (attempt === 30) throw new Error('Follow-up did not reach the ready state after 30 checks.');
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  } catch (error) { status(error.message, true); }
  finally {
    polling = false;
    $('follow-once').disabled = false;
    $('follow-poll').disabled = false;
    $('follow-stop').hidden = true;
  }
}
async function loadPage() {
  try {
    const result = await message('load');
    writeRequest({url: result.url, method: result.method, body: result.body, bodyType: 'form'});
    status('');
  } catch (error) { status(error.message, true); }
}

for (const id of editors) {
  $(id).addEventListener('focus', () => {target = $(id);});
  $(id).addEventListener('input', saveDraft);
}
for (const id of ['method', 'mode', 'body-type']) $(id).addEventListener('change', () => {updateMode(); saveDraft();});
$('pause-redirects').addEventListener('change', saveDraft);
$('send').addEventListener('click', send);
$('load').addEventListener('click', loadPage);
$('clear').addEventListener('click', async () => {
  try {
    await message('reset-headers');
    editors.forEach(id => {remember($(id)); $(id).value = '';});
    $('response-pane').hidden = true; rootResponse = null; displayedResponse = null; pendingRedirect = null; saveDraft(); status('Workspace cleared and header overrides reset.');
  } catch (error) { status(error.message, true); }
});
$('reset-headers').addEventListener('click', async () => {
  try {await message('reset-headers'); remember($('headers')); $('headers').value = ''; saveDraft(); status('Header overrides removed.');}
  catch (error) {status(error.message, true);}
});
$('fetch-headers').addEventListener('click', async () => {
  const button = $('fetch-headers'), before = $('headers').value;
  try {
    button.disabled = true; status('Fetching page headers…', false, true);
    const result = await message('fetch-headers');
    if ($('headers').value !== before) throw new Error('Headers changed while fetching. Fetch again to replace them.');
    remember($('headers')); $('headers').value = result.headersText; $('headers').focus(); saveDraft(); status('');
  } catch (error) {status(error.message, true);}
  finally {button.disabled = false;}
});
$('header-preset').addEventListener('change', event => {
  const presets = {referer: 'Referer: https://example.com/', 'user-agent': 'User-Agent: HackTab/0.1', cookie: 'Cookie: name=value', authorization: 'Authorization: Bearer TOKEN', 'content-type': 'Content-Type: application/json', forwarded: 'X-Forwarded-For: 127.0.0.1'};
  const preset = presets[event.target.value];
  if (preset) {
    remember($('headers'));
    try {$('headers').value = mergeHeaders($('headers').value, preset);} catch (error) {status(error.message, true); event.target.value = ''; return;}
    $('headers').focus(); saveDraft();
  }
  event.target.value = '';
});
for (const [value, label] of TRANSFORMS) $('transform').add(new Option(label, value));
$('apply-transform').title = 'Transforms selected text, or the whole active field when nothing is selected.';
$('apply-transform').addEventListener('click', async () => {
  const field = target, before = field.value;
  const start = field.selectionStart === field.selectionEnd ? 0 : field.selectionStart;
  const end = field.selectionStart === field.selectionEnd ? before.length : field.selectionEnd;
  try {
    const replacement = await transform($('transform').value, before.slice(start, end));
    if (field.value !== before) throw new Error('The field changed during transformation. Try again.');
    remember(field); field.setSelectionRange(start, end); field.setRangeText(replacement, start, end, 'select'); field.focus(); saveDraft();
    status(`Transformed ${labels[field.id]}.`);
  } catch (error) {status(error.message, true);}
});
$('undo').addEventListener('click', () => {
  const previous = undoStacks.get(target)?.pop();
  if (!previous) {status('No insertion or transformation to undo in this field.'); return;}
  target.value = previous.value; target.focus(); target.setSelectionRange(previous.start, previous.end); saveDraft(); status('Restored previous text.');
});
for (const name of CATEGORIES) {
  const button = document.createElement('button'); button.textContent = name; button.setAttribute('aria-pressed', String(name === 'All'));
  button.addEventListener('click', () => {
    category = name;
    for (const sibling of $('categories').children) sibling.setAttribute('aria-pressed', String(sibling === button));
    renderPayloads();
  });
  $('categories').append(button);
}
$('search').addEventListener('input', renderPayloads);
$('theme').addEventListener('change', () => {
  document.documentElement.dataset.theme = $('theme').value;
  chrome.storage.local.set({theme: $('theme').value}).catch(error => status(error.message, true));
});
for (const field of document.querySelectorAll('.template-options input')) field.addEventListener('input', () => {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    const templateOptions = {};
    for (const input of document.querySelectorAll('.template-options input')) templateOptions[input.id] = input.type === 'checkbox' ? input.checked : input.value;
    chrome.storage.local.set({templateOptions}).catch(error => status(error.message, true));
  }, 200);
});
$('history-toggle').addEventListener('click', async () => {
  const open = $('history-pane').hidden; $('history-pane').hidden = !open; $('history-toggle').setAttribute('aria-expanded', String(open));
  if (open) {try {await renderHistory();} catch (error) {status(error.message, true);}}
});
$('clear-history').addEventListener('click', async () => {
  try {await message('clear-history'); await renderHistory(); status('Session history cleared.');}
  catch (error) {status(error.message, true);}
});
$('response-close').addEventListener('click', () => {$('response-pane').hidden = true;});
$('redirect-fetch').addEventListener('click', () => continueRedirect('fetch'));
$('redirect-tab').addEventListener('click', () => continueRedirect('navigate'));
$('follow-once').addEventListener('click', () => followRequest(false));
$('follow-poll').addEventListener('click', () => followRequest(true));
$('follow-stop').addEventListener('click', () => {polling = false; status('Polling stopped.');});
$('open-result').addEventListener('click', async () => {
  try {
    if (!displayedResponse) throw new Error('Send a request first.');
    await message('open-result', {result: displayedResponse});
    status('Result opened in a new tab.');
  } catch (error) {status(error.message, true);}
});
$('open-destination').addEventListener('click', async () => {
  try {
    if (!displayedResponse?.redirected) throw new Error('No redirected destination is available.');
    await chrome.tabs.create({url: normalizeUrl(displayedResponse.url), active: true});
    status('Destination opened in a new tab.');
  } catch (error) {status(error.message, true);}
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {event.preventDefault(); send();}
});

async function initialize() {
  const [{theme = 'system', templateOptions = {}}, stored] = await Promise.all([chrome.storage.local.get(['theme', 'templateOptions']), chrome.storage.session.get(draftKey)]);
  const appearance = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
  $('theme').value = appearance; document.documentElement.dataset.theme = appearance;
  for (const [id, value] of Object.entries(templateOptions)) {
    const input = $(id);
    if (input?.closest('.template-options')) {if (input.type === 'checkbox') input.checked = !!value; else input.value = value;}
  }
  if (stored[draftKey]) {writeRequest(stored[draftKey]); $('scratch').value = stored[draftKey].scratch || '';}
  else if (tabId >= 0) await loadPage();
  if (tabId < 0) status('Open a page’s DevTools and select the HackTab panel.', true);
  updateMode(); renderPayloads(); document.documentElement.dataset.ready = 'true';
}
initialize().catch(error => status(error.message, true));
