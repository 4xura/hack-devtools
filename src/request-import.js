import JSON5 from './vendor/json5.mjs';
import {normalizeUrl, parseHeaders} from './core.js';

const managedHeaders = /^(?:host|content-length|connection|transfer-encoding|upgrade|accept-encoding|priority|sec-.*)$/i;
const unescapeCopiedText = text => text.replace(/\\([:.*/])/g, '$1');

function shellWords(source) {
  const words = [];
  let word = '';
  let quote = null;
  let started = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
    } else if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === '\\' && index + 1 < source.length) {
        const next = source[index + 1];
        if ('"\\$`'.includes(next)) {word += next; index++;}
        else if (next === '\n') index++;
        else word += char;
      } else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === '\\') {
      const next = source[++index];
      if (next === '\r' && source[index + 1] === '\n') index++;
      else if (next !== '\n' && next !== undefined) word += next;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) {words.push(word); word = ''; started = false;}
    } else {
      word += char;
      started = true;
    }
  }
  if (quote) throw new Error('The copied cURL command has an unclosed quote.');
  if (started) words.push(word);
  return words;
}

function powerShellString(source, start) {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") throw new Error('PowerShell values must be quoted literals.');
  let value = '';
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (char === quote) {
      if (quote === "'" && source[index + 1] === "'") {value += "'"; index++; continue;}
      return value;
    }
    if (quote === '"' && char === '`' && index + 1 < source.length) {
      const escaped = source[++index];
      value += {n:'\n',r:'\r',t:'\t'}[escaped] ?? escaped;
    } else value += char;
  }
  throw new Error('The copied PowerShell command has an unclosed string.');
}

function powerShellOption(source, name) {
  const match = new RegExp(`(?:^|\\s)-${name}\\s+`, 'i').exec(source);
  return match ? powerShellString(source, match.index + match[0].length) : null;
}

function inferBodyType(headers, body) {
  const contentType = headers.find(header => header.name.toLowerCase() === 'content-type')?.value.toLowerCase() || '';
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('x-www-form-urlencoded')) return 'form';
  if (contentType.includes('xml')) return 'xml';
  return body && /^[^=&\n]+=[^\n]*$/.test(body) ? 'form' : 'text';
}

function finish(url, method, body, rawHeaders, warnings, credentials = 'include') {
  const filtered = [];
  for (const line of rawHeaders) {
    const colon = line.indexOf(':');
    if (colon < 1) throw new Error(`Invalid copied header: ${line}`);
    const name = line.slice(0, colon).trim();
    if (managedHeaders.test(name)) {warnings.push(`Skipped browser-managed header ${name}`); continue;}
    filtered.push(`${name}: ${unescapeCopiedText(line.slice(colon + 1).trim())}`);
  }
  const headers = parseHeaders(filtered.join('\n'));
  const normalizedMethod = method.toUpperCase();
  if (!['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(normalizedMethod)) throw new Error(`Unsupported request method ${method}.`);
  return {
    request: {
      url: normalizeUrl(unescapeCopiedText(url)),
      method: normalizedMethod,
      mode: 'fetch',
      bodyType: inferBodyType(headers, body),
      body,
      headersText: headers.map(header => `${header.name}: ${header.value}`).join('\n'),
      credentials,
      pauseRedirects: false
    },
    warnings
  };
}

function parseCurl(source) {
  const words = shellWords(source.replace(/\\\r?\n\s*/g, ' '));
  if (!/^curl(?:\.exe)?$/i.test(words.shift() || '')) throw new Error('Paste a cURL command.');
  let url = '', method = '', body = '';
  const headers = [], warnings = [];
  let queryMode = false;
  for (let index = 0; index < words.length; index++) {
    const option = words[index];
    const value = () => {
      if (index + 1 >= words.length) throw new Error(`${option} needs a value.`);
      return words[++index];
    };
    if (option === '--url') url = value();
    else if (option === '-X' || option === '--request') method = value();
    else if (option === '-H' || option === '--header') headers.push(value());
    else if (['-d','--data','--data-raw','--data-binary','--data-urlencode','--json'].includes(option)) {
      const part = value();
      if (['-d','--data','--data-binary'].includes(option) && part.startsWith('@')) {
        throw new Error('File-backed cURL bodies cannot be loaded into the text editor.');
      }
      body += part;
      if (option === '--json') headers.push('Content-Type: application/json');
    } else if (option === '-A' || option === '--user-agent') headers.push(`User-Agent: ${value()}`);
    else if (option === '-e' || option === '--referer') headers.push(`Referer: ${value()}`);
    else if (option === '-b' || option === '--cookie') {
      const cookie = value();
      if (!cookie.includes('=')) throw new Error('Cookie files cannot be loaded into the text editor.');
      headers.push(`Cookie: ${cookie}`);
    }
    else if (option === '-G' || option === '--get') queryMode = true;
    else if (['-k','--insecure','--path-as-is'].includes(option)) warnings.push(`${option} cannot be applied by the browser`);
    else if (['-L','--location','--compressed','--globoff','-s','-sS','-S','-i','--include'].includes(option)) continue;
    else if (option.startsWith('-')) throw new Error(`Unsupported cURL option ${option}.`);
    else if (!url) url = option;
    else throw new Error('The cURL command contains more than one URL.');
  }
  if (!url) throw new Error('The cURL command has no URL.');
  if (queryMode && body) {
    url += (url.includes('?') ? '&' : '?') + body;
    body = '';
  }
  return finish(url, method || (body ? 'POST' : 'GET'), body, headers, warnings, 'omit');
}

function parsePowerShell(source) {
  const compact = source.replace(/`\r?\n\s*/g, ' ');
  if (!/\bInvoke-WebRequest\b/i.test(compact)) throw new Error('Paste an Invoke-WebRequest command.');
  const url = powerShellOption(compact, 'Uri');
  if (!url) throw new Error('The PowerShell command needs a literal -Uri.');
  const method = powerShellOption(compact, 'Method') || 'GET';
  const body = powerShellOption(compact, 'Body') || '';
  const headers = [], warnings = [];
  const block = /-Headers\s+@\{([\s\S]*?)\}/i.exec(compact)?.[1];
  if (block) {
    const pairs = [...block.matchAll(/(["'])(.*?)\1\s*=\s*(["'])(.*?)\3/g)];
    if (!pairs.length) throw new Error('Could not read the PowerShell header map.');
    for (const pair of pairs) headers.push(`${pair[2]}: ${pair[4]}`);
  }
  const contentType = powerShellOption(compact, 'ContentType');
  if (contentType) headers.push(`Content-Type: ${contentType}`);
  const userAgentMatch = /\$session\.UserAgent\s*=\s*/i.exec(compact);
  if (userAgentMatch) headers.push(`User-Agent: ${powerShellString(compact, userAgentMatch.index + userAgentMatch[0].length)}`);
  if (/-WebSession\b/i.test(compact)) warnings.push('WebSession cookies are not included in the copied text');
  return finish(url, method, body, headers, warnings, 'omit');
}

function parseFetch(source) {
  const match = /^\s*fetch\s*\(\s*((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))\s*,\s*([\s\S]*)\)\s*;?\s*$/.exec(source);
  if (!match) throw new Error('Paste a Fetch call with a literal URL and options object.');
  let url, options;
  try {
    url = JSON5.parse(match[1]);
    options = JSON5.parse(match[2]);
  } catch {
    url = JSON5.parse(unescapeCopiedText(match[1]));
    options = JSON5.parse(unescapeCopiedText(match[2]));
  }
  if (typeof url !== 'string' || !options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Fetch needs a URL string and options object.');
  if (options.body !== undefined && typeof options.body !== 'string') throw new Error('Fetch body must be a literal string.');
  const headers = Object.entries(options.headers || {}).map(([name, value]) => `${name}: ${value}`);
  if (options.referrer && !headers.some(line => /^referer:/i.test(line))) headers.push(`Referer: ${options.referrer}`);
  const credentials = options.credentials || 'same-origin';
  if (!['include','omit','same-origin'].includes(credentials)) throw new Error('Unsupported Fetch credentials setting.');
  const warnings = [];
  if (options.redirect === 'manual') warnings.push('Review Pause on redirects after import');
  return finish(url, options.method || 'GET', options.body || '', headers, warnings, credentials);
}

export function importRequest(source) {
  const text = source.trim();
  if (/^curl(?:\.exe)?\s/i.test(text)) return parseCurl(text);
  if (/\bInvoke-WebRequest\b/i.test(text)) return parsePowerShell(text);
  if (/^fetch\s*\(/.test(text)) return parseFetch(text);
  throw new Error('Paste a Chrome Copy as cURL, PowerShell, or Fetch command.');
}
