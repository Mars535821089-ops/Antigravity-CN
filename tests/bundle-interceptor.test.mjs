import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadBundle, interceptBundle } from '../src/runtime/bundle-interceptor.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

test('only a matching official UI response can be substituted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'antigravity-cn-test-'));
  const official = 'const label="English";';
  const localized = 'const label="中文";';
  try {
    await writeFile(join(root, 'main.zh-CN.js'), localized);
    await writeFile(join(root, 'bundle-manifest.json'), JSON.stringify({
      appVersion: '2.26.0', originalSHA256: hash(official), localizedSHA256: hash(localized),
    }));
    const bundle = await loadBundle(root);
    async function run(body, url = 'https://127.0.0.1:60123/main.js') {
      const calls = [];
      const client = { send: async (method, params) => {
        calls.push({ method, params });
        if (method === 'Fetch.getResponseBody') return { body, base64Encoded: false };
      } };
      const notices = [];
      await interceptBundle(client, { params: {
        requestId: '1', request: { url }, responseStatusCode: 200, responseHeaders: [],
      } }, bundle, (...args) => notices.push(args));
      return { calls, notices };
    }
    const matched = await run(official);
    assert.equal(matched.calls.at(-1).method, 'Fetch.fulfillRequest');
    assert.equal(Buffer.from(matched.calls.at(-1).params.body, 'base64').toString(), localized);
    const changed = await run('const label="Changed";');
    assert.equal(changed.calls.at(-1).method, 'Fetch.continueRequest');
    assert.equal(changed.notices[0][0], false);
    const unrelated = await run(official, 'https://127.0.0.1:60123/other.js');
    assert.equal(unrelated.calls.at(-1).method, 'Fetch.continueRequest');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
