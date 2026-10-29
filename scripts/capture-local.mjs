import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureOfficialUI } from '../src/runtime/capture-ui.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { version, source, bytes, sha256 } = await captureOfficialUI();
const directory = join(root, 'inputs', version);
await mkdir(directory, { recursive: true, mode: 0o700 });
const output = join(directory, 'main.js');
await writeFile(output, source, { mode: 0o600 });
console.log(JSON.stringify({ version, output, bytes, sha256, noRestart: true, noReload: true }));
