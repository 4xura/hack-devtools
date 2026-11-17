import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
fs.mkdirSync(path.join(root,'dist'), {recursive:true});
const output = path.join(root,'dist',`hacktab-${manifest.version}.zip`);
const files = ['manifest.json','devtools.html','panel.html','src','styles','assets'];
// PowerShell accepts paths through the process environment, without interpolation.
if (process.platform !== 'win32') throw new Error('Packaging currently requires PowerShell on Windows. Load source directly on other platforms.');
const result = spawnSync('powershell.exe', ['-NoProfile','-Command', '$items = $env:HACKTAB_PACKAGE_INPUTS | ConvertFrom-Json; Compress-Archive -LiteralPath $items -DestinationPath $env:HACKTAB_PACKAGE_OUTPUT -Force'], {cwd:root, env:{...process.env,HACKTAB_PACKAGE_INPUTS:JSON.stringify(files.map(file=>path.join(root,file))),HACKTAB_PACKAGE_OUTPUT:output}, encoding:'utf8',windowsHide:true});
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
console.log(output);
