import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureOfficialUI } from '../src/runtime/capture-ui.mjs';
import { isApprovedSource } from '../src/runtime/source-fingerprint.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const capture = await captureOfficialUI();
const knownFingerprints = JSON.parse(await readFile(
  join(root, 'src', 'dictionaries', 'source-fingerprints.json'), 'utf8',
));
const approvedFingerprint = isApprovedSource(capture.version, capture.sha256, knownFingerprints);
let matchingBuild = false;
try {
  const manifest = JSON.parse(await readFile(
    join(root, 'build', capture.version, 'bundle-manifest.json'), 'utf8',
  ));
  matchingBuild = approvedFingerprint &&
    manifest.approved === true &&
    manifest.appVersion === capture.version &&
    manifest.originalSHA256 === capture.sha256;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const result = matchingBuild
  ? 'ready'
  : approvedFingerprint ? 'approved-source-needs-build' : 'unknown-fingerprint';
console.log(JSON.stringify({
  result,
  installedVersion: capture.version,
  sourceSHA256: capture.sha256,
  approvedFingerprint,
  matchingBuild,
  sourceBytes: capture.bytes,
  sourceSaved: false,
  appModified: false,
  noRestart: true,
  noReload: true,
}, null, 2));
if (result !== 'ready') process.exitCode = 2;
