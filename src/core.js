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
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => {
    if (values[key] === undefined || String(values[key]).trim() === '') throw new Error(`Set the ${key.replaceAll('_', ' ')} option first.`);
    return String(values[key]);
  });
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
