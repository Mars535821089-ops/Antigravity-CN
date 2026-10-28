import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = process.argv[2];
const version = process.argv[3];
if (!sourcePath || !/^[0-9]+[.][0-9]+[.][0-9]+$/.test(version)) {
  throw new Error('Usage: npm run build -- /absolute/path/to/official/main.js 2.26.0');
}
const output = join(root, 'build', version);
await mkdir(output, { recursive: true });
await copyFile(sourcePath, join(output, 'main.js'));
for (const name of ['overrides.json', 'local-translations.json']) {
  await copyFile(join(root, 'src', 'dictionaries', name), join(output, name));
}
const env = { ...process.env, ANTIGRAVITY_CN_BUILD_DIR: output, ANTIGRAVITY_CN_VERSION: version };
for (const script of ['src/dom/prepare-payload.mjs', 'src/component/extract-ui.cjs', 'src/component/build.cjs']) {
  execFileSync(process.execPath, [join(root, script)], { env, stdio: 'inherit' });
}
const coverage = JSON.parse(await readFile(join(output, 'coverage.json'), 'utf8'));
if (coverage.unmappedUnique !== 0 || coverage.functionalAttributesPatched !== 0) {
  throw new Error('UI audit is incomplete; review coverage.json and unmapped.json before using this build');
}
for (const name of ['cdp.mjs', 'bundle-interceptor.mjs', 'monitor.mjs', 'monitor-permission.mjs']) {
  await copyFile(join(root, 'src', 'runtime', name), join(output, name));
}
await copyFile(join(root, 'src', 'permission', 'permission-ui.js'), join(output, 'permission-ui.js'));
const manifest = JSON.parse(await readFile(join(output, 'bundle-manifest.json'), 'utf8'));
console.log(JSON.stringify({ output, version, originalSHA256: manifest.originalSHA256,
  localizedSHA256: manifest.localizedSHA256, revision: manifest.localizedRevision }));
