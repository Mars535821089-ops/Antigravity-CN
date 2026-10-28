import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../../third_party/upstream/localize.js', import.meta.url), 'utf8');
const base=process.env.ANTIGRAVITY_CN_BUILD_DIR;
const version=process.env.ANTIGRAVITY_CN_VERSION;
if(!base||!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(version))throw Error('Build directory and version required');
const marker = 'const DOM_TRANSLATOR_INJECTION = ';
const start = source.indexOf(marker) + marker.length;
const end = source.indexOf('\n// Helper to replace text in file cleanly', start);
if (start < marker.length || end < 0) throw new Error('Upstream payload boundaries changed');
const literal = source.slice(start, end).trim().replace(/;$/, '');
let payload = vm.runInNewContext(literal, Object.create(null), { timeout: 1000 });
if (typeof payload !== 'string' || !payload.includes('function shouldSkipNode(node)')) {
  throw new Error('Unexpected upstream translation payload');
}

const originalPayloadHash = crypto.createHash('sha256').update(payload).digest('hex');
if (!process.argv.includes('--upstream-only')) {
  // Guard current 2.26.0 message containers before upstream's UI-label exceptions.
  const original = '    if (!element) return false;';
  if (payload.split(original).length !== 2) throw new Error('Unexpected upstream protection guard');
  payload = payload.replace(original, `${original}
    if (element.closest && element.closest(
      '[data-testid="user-input-step"], [data-ag-localization-skip], input, textarea, ' +
      '[contenteditable]:not([contenteditable="false"]), [role="textbox"], pre, code, ' +
      '.monaco-editor, .terminal, .xterm'
    )) return true;`);
}

payload = `(() => {
  if (globalThis.__marsAntigravityChinese226) return;
  globalThis.__marsAntigravityChinese226 = true;
  ${payload}
})();\n`;
payload=payload.replaceAll('__marsAntigravityChinese226','__marsAntigravityChinese'+version.split('.').slice(0,2).join(''));
new vm.Script(payload);
const output = 'payload.base.js';
fs.writeFileSync(`${base}/payload.base.js`, payload);
console.log(JSON.stringify({
  output, bytes: Buffer.byteLength(payload), upstreamPayloadSHA256: originalPayloadHash,
  payloadSHA256: crypto.createHash('sha256').update(payload).digest('hex'),
}));
