import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export async function registerMonitor(root, name) {
  const entry = resolve(process.argv[1]);
  const path = join(root, `${name}-${process.pid}.pid`);
  await writeFile(path, JSON.stringify({
    pid: process.pid,
    uid: process.getuid(),
    entry,
  }), { mode: 0o600, flag: 'wx' });
  return path;
}

export function isOwnedMonitor(record, expectedEntry, uid, command) {
  return record.uid === uid &&
    record.entry === expectedEntry &&
    command.split(/\s+/).some(argument => resolve(argument) === expectedEntry);
}
