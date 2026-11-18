import JSON5 from './vendor/json5.mjs';

export function formatBody(type, text) {
  if (type === 'json') {
    const value = JSON5.parse(text);
    return JSON.stringify(value, (key, item) => {
      if (typeof item === 'number' && !Number.isFinite(item)) {
        throw new Error('NaN and Infinity cannot be represented in JSON.');
      }
      return item;
    }, 2);
  }

  if (type === 'form') {
    const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const listedFields = lines.every(line => /^[^:=]+\s*[:=]/.test(line));
    if (!listedFields || (lines.length === 1 && !/^[^:=]+\s*:/.test(lines[0]))) {
      return new URLSearchParams(text.trim()).toString();
    }
    const fields = new URLSearchParams();
    for (const line of lines) {
      const colon = line.match(/^([^:=]+)\s*:\s*(.*)$/);
      if (colon) fields.append(colon[1].trim(), colon[2]);
      else for (const [name, value] of new URLSearchParams(line)) fields.append(name, value);
    }
    return fields.toString();
  }

  throw new Error('Choose JSON or Form encoded to format the body.');
}
