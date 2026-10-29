import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { isOwnedMonitor } from '../src/runtime/process-control.mjs';

test('rollback ownership requires matching user, recorded entry, and process argument', () => {
  const entry = resolve('build/2.26.0/monitor.mjs');
  const record = { uid: 501, entry };
  assert.equal(isOwnedMonitor(record, entry, 501, `node ${entry}`), true);
  assert.equal(isOwnedMonitor(record, entry, 502, `node ${entry}`), false);
  assert.equal(isOwnedMonitor(record, `${entry}.other`, 501, `node ${entry}`), false);
  assert.equal(isOwnedMonitor(record, entry, 501, 'node unrelated.mjs'), false);
});
