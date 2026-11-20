import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const target = path.resolve(dist, 'firefox-unpacked');
if (!target.startsWith(path.resolve(dist) + path.sep)) throw new Error('Firefox output must stay inside dist.');
fs.rmSync(target, {recursive: true, force: true});
fs.mkdirSync(target, {recursive: true});
const files = ['devtools.html','panel.html','viewer.html','src','styles','assets','LICENSE','THIRD_PARTY_NOTICES.md'];
for (const file of files) fs.cpSync(path.join(root, file), path.join(target, file), {recursive: true});
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
delete manifest.minimum_chrome_version;
manifest.background = {scripts: ['src/background.js'], type: 'module'};
manifest.browser_specific_settings = {gecko: {
  id: 'hack-devtools@axura.dev',
  strict_min_version: '142.0',
  data_collection_permissions: {required: ['none']}
}};
fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const file of fs.readdirSync(path.join(target, 'src'))) {
  if (!file.endsWith('.js')) continue;
  const source = path.join(target, 'src', file);
  fs.writeFileSync(source, fs.readFileSync(source, 'utf8').replace(/\bchrome\./g, 'browser.'));
}
const packagePath = path.join(dist, `hack-devtools-firefox-${manifest.version}.zip`);
if (process.platform !== 'win32') throw new Error('Firefox packaging currently requires PowerShell on Windows.');
const entries = fs.readdirSync(target).map(name => path.join(target, name));
const result = spawnSync('powershell.exe', ['-NoProfile','-Command', '$items = $env:HACK_DEVTOOLS_PACKAGE_INPUTS | ConvertFrom-Json; Compress-Archive -LiteralPath $items -DestinationPath $env:HACK_DEVTOOLS_PACKAGE_OUTPUT -Force'], {
  cwd: target, env: {...process.env, HACK_DEVTOOLS_PACKAGE_INPUTS: JSON.stringify(entries), HACK_DEVTOOLS_PACKAGE_OUTPUT: packagePath}, encoding: 'utf8', windowsHide: true
});
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
console.log(target);
console.log(packagePath);
