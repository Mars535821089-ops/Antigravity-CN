import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isApprovedSource } from '../src/runtime/source-fingerprint.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fingerprints = JSON.parse(await readFile(
  new URL('../src/dictionaries/source-fingerprints.json', import.meta.url), 'utf8',
));

test('only an explicitly reviewed version and exact UI bundle fingerprint are approved', () => {
  const approved = fingerprints['2.26.0'][0];
  assert.equal(isApprovedSource('2.26.0', approved, fingerprints), true);
  assert.equal(isApprovedSource('2.26.0', '0'.repeat(64), fingerprints), false);
  assert.equal(isApprovedSource('2.27.0', approved, fingerprints), false);
  assert.equal(isApprovedSource('../2.26.0', approved, fingerprints), false);
});

test('build refuses an unapproved source before creating a runtime package', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'antigravity-cn-build-'));
  try {
    const source = join(temp, 'main.js');
    await writeFile(source, 'const label = "Unreviewed";');
    const result = spawnSync(process.execPath, [
      join(root, 'scripts', 'build.mjs'), source, '99.98.97',
    ], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown official UI fingerprint/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
