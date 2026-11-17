import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'HackTab');
for (const key of ['key','update_url','homepage_url']) assert(!(key in manifest), `Unexpected manifest identity field: ${key}`);
for (const file of [manifest.devtools_page, manifest.background.service_worker, ...Object.values(manifest.icons)]) assert(fs.existsSync(path.join(root, file)), `Missing: ${file}`);
function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => entry.isDirectory() && !['.git','work','dist','node_modules'].includes(entry.name) ? walk(path.join(dir,entry.name)) : entry.isFile() ? [path.join(dir,entry.name)] : []);
}
const files = walk(root);
for (const file of files.filter(file => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check',file], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
}
for (const file of files.filter(file => /\.(js|html|css|json|md)$/.test(file))) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) assert(text.includes('HackTab'), `Missing project title in ${file}`);
  if (file.endsWith('.html')) {
    assert(!/\son\w+=|<script[^>]+src=["']https?:/i.test(text), `Unexpected executable markup in ${file}`);
    for (const match of text.matchAll(/(?:src|href)="([^"#]+)"/g)) assert(fs.existsSync(path.join(root, match[1])), `Missing page asset: ${match[1]}`);
  }
}
console.log(`PASS: ${files.length} files checked; manifest, assets, scripts, branding, and local resources valid.`);
