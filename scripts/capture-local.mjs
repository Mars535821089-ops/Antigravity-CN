import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CDP, discoverApp, isAppPage } from '../src/runtime/cdp.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = '/Applications/Antigravity.app';
const version = execFileSync('/usr/bin/plutil', [
  '-extract', 'CFBundleShortVersionString', 'raw', app + '/Contents/Info.plist',
], { encoding: 'utf8' }).trim();
const { port, targets } = await discoverApp(process.env.HOME + '/Library/Application Support/Antigravity');
const owners = execFileSync('/usr/sbin/lsof', [
  '-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-Fp',
], { encoding: 'utf8' }).split(String.fromCharCode(10)).filter(line => /^p[0-9]+$/.test(line));
if (owners.length !== 1) throw new Error('Unexpected debugging listener ownership');
const command = execFileSync('/bin/ps', ['-p', owners[0].slice(1), '-o', 'command='], {
  encoding: 'utf8',
}).trim();
if (command !== app + '/Contents/MacOS/Antigravity' &&
    !command.startsWith(app + '/Contents/MacOS/Antigravity ')) {
  throw new Error('The debugging listener is not the official Antigravity application');
}
const target = targets.find(isAppPage);
if (!target) throw new Error('No active Antigravity UI window; this script does not launch the app');
const client = await CDP.connect(target.webSocketDebuggerUrl);
try {
  const componentFlag = '__marsComponentChinese' + version.split('.').slice(0,2).join('');
  if (await client.evaluate('Boolean(globalThis[' + JSON.stringify(componentFlag) + '])')) {
    throw new Error('Current page already has a localized component bundle; use an official unmodified source');
  }
  const before = await client.evaluate('({href:location.href,timeOrigin:performance.timeOrigin})');
  const source = await client.evaluate('(async()=>{const r=await fetch("/main.js",{cache:"no-store"});if(!r.ok)throw Error("UI bundle unavailable");return r.text()})()');
  const after = await client.evaluate('({href:location.href,timeOrigin:performance.timeOrigin})');
  if (before.href !== after.href || before.timeOrigin !== after.timeOrigin) {
    throw new Error('The application navigated naturally during capture; retry later');
  }
  if (typeof source !== 'string' || source.length < 1000000) {
    throw new Error('The response was not an expected UI bundle');
  }
  if (source.includes(componentFlag + '=')) {
    throw new Error('Captured a localized response; use an original official UI bundle');
  }
  const directory = join(root, 'inputs', version);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const output = join(directory, 'main.js');
  await writeFile(output, source, { mode: 0o600 });
  console.log(JSON.stringify({ version, output, bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'), noRestart: true, noReload: true }));
} finally {
  client.close();
}
