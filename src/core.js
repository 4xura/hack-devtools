export function normalizeUrl(value) {
  const text = value.trim().replace(/[\r\n]/g, '');
  if (!text) throw new Error('Enter a request URL.');
  const hostWithPort = /^[^/?#]+:\d+(?:[/?#]|$)/.test(text);
  const url = new URL(!hostWithPort && /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Requests require an HTTP or HTTPS URL.');
  if (url.username || url.password) throw new Error('Use an Authorization header instead of credentials in the URL.');
  return url.href;
}

export function parseHeaders(text) {
  const headers = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon < 1) throw new Error('Each header needs a name followed by a colon.');
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!/^[!#$%&'*+.^_`|~\da-z-]+$/i.test(name) || /[\r\n\0]/.test(value)) throw new Error(`Invalid header: ${name}`);
    if (['host', 'content-length', 'connection', 'transfer-encoding', 'upgrade'].includes(name.toLowerCase())) throw new Error(`${name} is managed by Chrome.`);
    if (seen.has(name.toLowerCase())) throw new Error(`Duplicate header: ${name}`);
    seen.add(name.toLowerCase());
    headers.push({name, value});
  }
  return headers;
}

export function parseForm(text) {
  return Array.from(new URLSearchParams(text), ([name, value]) => ({name, value}));
}

export function interpolate(template, values) {
  const options = new Set(['column_count','number_columns','null_columns','seconds','database','table','columns','file','relative_file','host','port','selected','origin','path']);
  return template.replace(/\{\{([a-z_]+)\}\}/g, (literal, key) => {
    if (!options.has(key)) return literal;
    if (values[key] === undefined || String(values[key]).trim() === '') throw new Error(`Set the ${key.replaceAll('_', ' ')} option first.`);
    return String(values[key]);
  });
}

export function editableHeaders(headers) {
  const result = new Map();
  for (const {name, value} of headers || []) {
    if (!name || value === undefined || /^(?:host|content-length|connection|transfer-encoding|upgrade|accept-encoding|priority|sec-.*)$/i.test(name)) continue;
    try {
      const [header] = parseHeaders(`${name}: ${value}`);
      result.set(name.toLowerCase(), header);
    } catch { /* Pseudo-headers and binary values cannot be edited as text. */ }
  }
  return [...result.values()].map(({name, value}) => `${name}: ${value}`).join('\n');
}

export function mergeHeaders(current, additions) {
  const merged = new Map(parseHeaders(current).map(header => [header.name.toLowerCase(), header]));
  for (const header of parseHeaders(additions)) merged.set(header.name.toLowerCase(), header);
  return [...merged.values()].map(({name, value}) => `${name}: ${value}`).join('\n');
}

export function resolveFollowUp(template, response) {
  if (!response?.url || !response?.body) throw new Error('Send a request with a JSON response first.');
  let json;
  try { json = JSON.parse(response.body); } catch { throw new Error('The latest response is not JSON.'); }
  const source = template.trim();
  const replaced = source.replace(/\{\{response\.([a-zA-Z][a-zA-Z0-9_.]*)\}\}/g, (token, path) => {
    const value = path.split('.').reduce((item, key) => item?.[key], json);
    if (value === null || value === undefined || typeof value === 'object') throw new Error(`Response field ${path} is missing or not a scalar.`);
    return source === token ? String(value) : encodeURIComponent(String(value));
  });
  if (!replaced || /\{\{response\./.test(replaced)) throw new Error('Enter a valid follow-up URL template.');
  const url = new URL(replaced, response.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Follow-up requests require HTTP or HTTPS.');
  if (url.origin !== new URL(response.url).origin) throw new Error('Follow-up URL must use the response origin.');
  return url.href;
}

export function readResponseField(body, path) {
  const key = path.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(key)) throw new Error('Enter a JSON field name such as receipt_text or data.result.');
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('The follow-up response is not JSON.'); }
  const value = key.split('.').reduce((item, part) => item?.[part], data);
  if (value === null || value === undefined) throw new Error(`Response field ${key} was not found.`);
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function columnList(count, style = 'number') {
  const size = Number(count);
  if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error('Column count must be between 1 and 100.');
  return Array.from({length: size}, (_, index) => style === 'null' ? 'NULL' : String(index + 1)).join(',');
}

export function replaceSelection(text, start, end, replacement) {
  return {text: text.slice(0, start) + replacement + text.slice(end), start, end: start + replacement.length};
}

export function validateRequest(request) {
  const url = normalizeUrl(request.url);
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(request.method)) throw new Error('Unsupported HTTP method.');
  if (!['navigate', 'fetch'].includes(request.mode)) throw new Error('Unknown request mode.');
  if (!['form', 'json', 'xml', 'text'].includes(request.bodyType)) throw new Error('Unknown body type.');
  if (request.mode === 'navigate' && (request.method !== 'GET' && (request.method !== 'POST' || request.bodyType !== 'form'))) throw new Error('Navigate supports GET and form POST. Select Fetch for raw bodies and other methods.');
  if (request.bodyType === 'json' && !['GET', 'HEAD'].includes(request.method)) JSON.parse(request.body || '');
  if (!Number.isInteger(request.tabId) || request.tabId < 0) throw new Error('Open HackTab from the inspected page’s DevTools.');
  return {...request, url, headers: parseHeaders(request.headersText || '')};
}
