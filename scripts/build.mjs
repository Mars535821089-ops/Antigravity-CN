import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isApprovedSource } from '../src/runtime/source-fingerprint.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const preview = args.includes('--preview');
const positional = args.filter(arg => arg !== '--preview');
if (args.some(arg => arg.startsWith('--') && arg !== '--preview')) {
  throw new Error('Unknown option; only --preview is supported');
}
const sourcePath = positional[0];
const version = positional[1];
if (!sourcePath || !/^[0-9]+[.][0-9]+[.][0-9]+$/.test(version)) {
  throw new Error('Usage: npm run build -- /absolute/path/to/official/main.js 2.26.0 [--preview]');
}
const source = await readFile(sourcePath);
const originalSHA256 = crypto.createHash('sha256').update(source).digest('hex');
const fingerprints = JSON.parse(await readFile(
  join(root, 'src', 'dictionaries', 'source-fingerprints.json'), 'utf8',
));
const approved = isApprovedSource(version, originalSHA256, fingerprints);
if (!preview && !approved) {
  throw new Error(
    `Unknown official UI fingerprint for ${version} (${originalSHA256}). ` +
    'Review it with --preview; never build a runtime package from an unapproved source.',
  );
}
const output = preview
  ? join(root, 'build', 'previews', `${version}-${originalSHA256.slice(0, 12)}`)
  : join(root, 'build', version);
await mkdir(output, { recursive: true });
await writeFile(join(output, 'main.js'), source, { mode: 0o600 });
for (const name of ['overrides.json', 'local-translations.json']) {
  await copyFile(join(root, 'src', 'dictionaries', name), join(output, name));
}
const env = { ...process.env, ANTIGRAVITY_CN_BUILD_DIR: output, ANTIGRAVITY_CN_VERSION: version };
for (const script of ['src/dom/prepare-payload.mjs', 'src/component/extract-ui.cjs', 'src/component/build.cjs']) {
  execFileSync(process.execPath, [join(root, script)], { env, stdio: 'inherit' });
}
const coverage = JSON.parse(await readFile(join(output, 'coverage.json'), 'utf8'));
if (coverage.functionalAttributesPatched !== 0 ||
    (!preview && coverage.unmappedUnique !== 0)) {
  throw new Error('UI audit is incomplete; review coverage.json and unmapped.json before using this build');
}
const manifestPath = join(output, 'bundle-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.approved = approved && !preview;
manifest.previewOnly = preview;
manifest.fingerprintSchemaVersion = 1;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
if (!preview) {
  for (const name of [
    'cdp.mjs', 'bundle-interceptor.mjs', 'capture-ui.mjs', 'process-control.mjs',
    'source-fingerprint.mjs', 'monitor.mjs',
    'monitor-permission.mjs',
  ]) {
    await copyFile(join(root, 'src', 'runtime', name), join(output, name));
  }
  await copyFile(join(root, 'src', 'dictionaries', 'source-fingerprints.json'), output);
  await copyFile(join(root, 'src', 'permission', 'permission-ui.js'), join(output, 'permission-ui.js'));
}
console.log(JSON.stringify({
  output, version, approved: manifest.approved, previewOnly: preview,
  originalSHA256: manifest.originalSHA256, localizedSHA256: manifest.localizedSHA256,
  revision: manifest.localizedRevision, unmappedUnique: coverage.unmappedUnique,
}));
