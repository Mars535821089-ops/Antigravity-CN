import { execFileSync } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isOwnedMonitor } from '../src/runtime/process-control.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2];
if (!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(version ?? '')) {
  throw new Error('Usage: npm run rollback -- 2.26.0');
}
const buildDir = join(root, 'build', version);
const expected = new Map([
  ['monitor', resolve(buildDir, 'monitor.mjs')],
  ['permission-monitor', resolve(buildDir, 'monitor-permission.mjs')],
]);
const markers = (await readdir(buildDir).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
})).filter(name => [...expected.keys()].some(kind =>
  new RegExp(`^${kind}-[0-9]+\\.pid$`).test(name)));
const outcomes = [];

for (const name of markers) {
  const path = join(buildDir, name);
  const record = JSON.parse(await readFile(path, 'utf8'));
  if (!Number.isSafeInteger(record.pid) || record.pid < 1) {
    throw new Error(`Invalid monitor PID record: ${name}`);
  }
  const kind = [...expected.keys()].find(value => name.startsWith(`${value}-`));
  const entry = expected.get(kind);
  let processInfo;
  try {
    processInfo = execFileSync('/bin/ps', ['-p', String(record.pid), '-o', 'uid=,command='], {
      encoding: 'utf8', timeout: 3000,
    }).trim();
  } catch (error) {
    if (error.status !== 1) throw error;
    await rm(path, { force: true });
    outcomes.push({ pid: record.pid, result: 'stale-marker-removed' });
    continue;
  }
  const match = processInfo.match(/^(\d+)\s+([\s\S]+)$/);
  if (!match || !isOwnedMonitor(record, entry, process.getuid(), match[2]) ||
      Number(match[1]) !== process.getuid()) {
    throw new Error(`Refusing to stop PID ${record.pid}: it is not the expected ${kind} process`);
  }
  process.kill(record.pid, 'SIGTERM');
  outcomes.push({ pid: record.pid, result: 'stop-requested', kind });
}

console.log(JSON.stringify({
  version,
  processes: outcomes,
  appFilesModified: false,
  note: 'Close and reopen Antigravity to clear translations already rendered in open windows.',
}, null, 2));
