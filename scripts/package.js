import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const dist = path.join(root, 'dist');
const unpacked = path.resolve(dist, 'chrome-unpacked');

if (!unpacked.startsWith(path.resolve(dist) + path.sep)) {
  throw new Error('Chrome output must stay inside dist.');
}

fs.rmSync(unpacked, {recursive: true, force: true});
fs.mkdirSync(unpacked, {recursive: true});

const files = [
  'manifest.json', 'devtools.html', 'panel.html', 'popup.html', 'sidebar.html', 'viewer.html',
  'src', 'styles', 'assets', 'LICENSE', 'THIRD_PARTY_NOTICES.md'
];
for (const file of files) {
  fs.cpSync(path.join(root, file), path.join(unpacked, file), {recursive: true});
}

if (process.platform !== 'win32') {
  throw new Error('Packaging currently requires PowerShell on Windows.');
}

const output = path.join(dist, `hack-devtools-${manifest.version}.zip`);
const entries = fs.readdirSync(unpacked).map(name => path.join(unpacked, name));
const result = spawnSync('powershell.exe', [
  '-NoProfile', '-Command',
  '$items = $env:HACK_DEVTOOLS_PACKAGE_INPUTS | ConvertFrom-Json; Compress-Archive -LiteralPath $items -DestinationPath $env:HACK_DEVTOOLS_PACKAGE_OUTPUT -Force'
], {
  cwd: unpacked,
  env: {
    ...process.env,
    HACK_DEVTOOLS_PACKAGE_INPUTS: JSON.stringify(entries),
    HACK_DEVTOOLS_PACKAGE_OUTPUT: output
  },
  encoding: 'utf8',
  windowsHide: true
});
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
console.log(unpacked);
console.log(output);
