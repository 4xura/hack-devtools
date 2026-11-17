const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
function base64Encode(text) {
  const bytes = encoder.encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function base64Decode(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return decoder.decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

// RFC 1321 rounds over UTF-8 bytes; MD5 is provided as a text utility.
export function md5(text) {
  const bytes = encoder.encode(text);
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setBigUint64(padded.length - 8, BigInt(bytes.length) * 8n, true);
  const shifts = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  const constants = Array.from({length: 64}, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let offset = 0; offset < padded.length; offset += 64) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      const round = Math.floor(i / 16);
      const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const sum = (a + f + constants[i] + view.getInt32(offset + g * 4, true)) | 0;
      const shift = shifts[round * 4 + i % 4];
      [a, b, c, d] = [d, (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0, b, c];
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  const result = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((value, index) => result.setInt32(index * 4, value, true));
  return toHex(new Uint8Array(result.buffer));
}

export const TRANSFORMS = [
  ['url-encode', 'URL encode'], ['url-decode', 'URL decode'],
  ['url-double', 'Double URL encode'], ['base64-encode', 'Base64 encode'],
  ['base64-decode', 'Base64 decode'], ['base64url-encode', 'Base64url encode'],
  ['hex-encode', 'Hex encode'], ['hex-decode', 'Hex decode'],
  ['html-encode', 'HTML entities'], ['html-decode', 'Decode HTML entities'],
  ['unicode-escape', 'Unicode escape'], ['unicode-unescape', 'Decode Unicode escapes'],
  ['json-format', 'Format JSON'], ['json-minify', 'Minify JSON'], ['jwt-decode', 'Decode JWT (unverified)'],
  ['uppercase', 'Uppercase'], ['lowercase', 'Lowercase'], ['rot13', 'ROT13'],
  ['md5', 'MD5'], ['sha1', 'SHA-1'], ['sha256', 'SHA-256'], ['sha512', 'SHA-512'],
  ['mysql-char', 'MySQL CHAR()'], ['mssql-char', 'MSSQL NCHAR()'], ['oracle-char', 'Oracle CHR()'],
  ['js-char', 'JavaScript fromCodePoint()'], ['sql-comments', 'SQL spaces → comments'],
  ['addslashes', 'Add slashes'], ['trim', 'Trim whitespace']
];

export async function transform(action, text) {
  switch (action) {
    case 'url-encode': return encodeURIComponent(text);
    case 'url-decode': return decodeURIComponent(text.replace(/\+/g, ' '));
    case 'url-double': return encodeURIComponent(encodeURIComponent(text));
    case 'base64-encode': return base64Encode(text);
    case 'base64url-encode': return base64Encode(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    case 'base64-decode': return base64Decode(text);
    case 'hex-encode': return toHex(encoder.encode(text));
    case 'hex-decode': {
      const hex = text.replace(/^0x/i, '').replace(/\s/g, '');
      if (!/^(?:[\da-f]{2})*$/i.test(hex)) throw new Error('Hex requires pairs of hexadecimal digits.');
      return decoder.decode(Uint8Array.from(hex.match(/../g) || [], byte => parseInt(byte, 16)));
    }
    case 'html-encode': return Array.from(text, char => `&#${char.codePointAt(0)};`).join('');
    case 'html-decode': return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
      if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(/^#x/i.test(code) ? 2 : 1), /^#x/i.test(code) ? 16 : 10));
      return {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"}[code.toLowerCase()] ?? entity;
    });
    case 'unicode-escape': return text.split('').map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    case 'unicode-unescape': return text.replace(/\\u([\da-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
    case 'json-format': return JSON.stringify(JSON.parse(text), null, 2);
    case 'json-minify': return JSON.stringify(JSON.parse(text));
    case 'jwt-decode': {
      const parts = text.trim().split('.');
      if (parts.length !== 3) throw new Error('A JWT must have three dot-separated sections.');
      return JSON.stringify({header: JSON.parse(base64Decode(parts[0])), payload: JSON.parse(base64Decode(parts[1])), signature: parts[2], verified: false}, null, 2);
    }
    case 'uppercase': return text.toUpperCase();
    case 'lowercase': return text.toLowerCase();
    case 'rot13': return text.replace(/[a-z]/gi, char => String.fromCharCode(char.charCodeAt(0) + (char.toLowerCase() <= 'm' ? 13 : -13)));
    case 'md5': return md5(text);
    case 'sha1': case 'sha256': case 'sha512': return toHex(new Uint8Array(await crypto.subtle.digest({sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512'}[action], encoder.encode(text))));
    case 'mysql-char': return `CHAR(${Array.from(encoder.encode(text)).join(',')})`;
    case 'mssql-char': return text.split('').map(char => `NCHAR(${char.charCodeAt(0)})`).join('+');
    case 'oracle-char': return Array.from(text, char => `CHR(${char.codePointAt(0)})`).join('||');
    case 'js-char': return `String.fromCodePoint(${Array.from(text, char => char.codePointAt(0)).join(',')})`;
    case 'sql-comments': return text.replace(/\s+/g, '/**/');
    case 'addslashes': return text.replace(/[\\'"\0]/g, char => char === '\0' ? '\\0' : '\\' + char);
    case 'trim': return text.trim();
    default: throw new Error('Unknown transformation.');
  }
}
