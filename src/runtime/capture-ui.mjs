import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CDP, discoverApp, isAppPage } from './cdp.mjs';

const app = '/Applications/Antigravity.app';
const dataDir = `${process.env.HOME}/Library/Application Support/Antigravity`;

function installedVersion() {
  return execFileSync('/usr/bin/plutil', [
    '-extract', 'CFBundleShortVersionString', 'raw', `${app}/Contents/Info.plist`,
  ], { encoding: 'utf8', timeout: 3000 }).trim();
}

function verifyListener(port) {
  const output = execFileSync('/usr/sbin/lsof', [
    '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp',
  ], { encoding: 'utf8', timeout: 3000 });
  const pids = [...new Set(output.split('\n').filter(line => /^p\d+$/.test(line))
    .map(line => line.slice(1)))];
  if (pids.length !== 1) throw new Error('Unexpected debugging listener ownership');
  const command = execFileSync('/bin/ps', ['-p', pids[0], '-o', 'command='], {
    encoding: 'utf8', timeout: 3000,
  }).trim();
  if (command !== `${app}/Contents/MacOS/Antigravity` &&
      !command.startsWith(`${app}/Contents/MacOS/Antigravity `)) {
    throw new Error('The debugging listener is not the official Antigravity application');
  }
}

export async function captureOfficialUI() {
  const version = installedVersion();
  if (!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(version)) {
    throw new Error(`Unexpected Antigravity version: ${version}`);
  }
  const { port, targets } = await discoverApp(dataDir);
  verifyListener(port);
  const target = targets.find(isAppPage);
  if (!target) throw new Error('No active Antigravity UI window');

  const client = await CDP.connect(target.webSocketDebuggerUrl);
  try {
    const componentFlag = '__marsComponentChinese' + version.split('.').slice(0, 2).join('');
    if (await client.evaluate(`Boolean(globalThis[${JSON.stringify(componentFlag)}])`)) {
      throw new Error('The active page is localized; capture an unmodified official response');
    }
    const before = await client.evaluate('({href:location.href,timeOrigin:performance.timeOrigin})');
    const source = await client.evaluate(
      '(async()=>{const r=await fetch("/main.js",{cache:"no-store"});' +
      'if(!r.ok)throw Error("UI bundle unavailable");return r.text()})()',
    );
    const after = await client.evaluate('({href:location.href,timeOrigin:performance.timeOrigin})');
    if (before.href !== after.href || before.timeOrigin !== after.timeOrigin) {
      throw new Error('The application navigated naturally during capture; retry later');
    }
    if (typeof source !== 'string' || source.length < 1_000_000) {
      throw new Error('The response was not an expected UI bundle');
    }
    if (source.includes(componentFlag + '=')) {
      throw new Error('Captured a localized response; use an original official UI bundle');
    }
    if (installedVersion() !== version) {
      throw new Error('Antigravity updated during capture; retry the update check');
    }
    return {
      version,
      source,
      bytes: Buffer.byteLength(source),
      sha256: createHash('sha256').update(source).digest('hex'),
    };
  } finally {
    client.close();
  }
}
