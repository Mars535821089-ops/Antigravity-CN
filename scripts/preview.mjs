import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2];
if (!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(version ?? '')) {
  throw new Error('Usage: npm run preview -- 2.27.0');
}
const previewRoot = join(root, 'build', 'previews');
const candidates = (await readdir(previewRoot, { withFileTypes: true }).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
})).filter(entry => entry.isDirectory() && entry.name.startsWith(`${version}-`));
if (candidates.length !== 1) {
  throw new Error(`Expected one preview for ${version}; found ${candidates.length}`);
}
const output = join(previewRoot, candidates[0].name);
const manifest = JSON.parse(await readFile(join(output, 'bundle-manifest.json'), 'utf8'));
if (manifest.appVersion !== version || manifest.approved !== false || manifest.previewOnly !== true) {
  throw new Error('Refusing to display an artifact that is not a preview-only build');
}
const changes = JSON.parse(await readFile(join(output, 'source-translations.json'), 'utf8'));
const unmapped = JSON.parse(await readFile(join(output, 'unmapped.json'), 'utf8'));
console.log(`Preview only: Antigravity ${version}`);
console.log(`Original SHA-256: ${manifest.originalSHA256}`);
console.log(`Localized resource SHA-256: ${manifest.localizedSHA256}`);
console.log(`Candidate UI changes: ${changes.length}; unmapped strings: ${unmapped.length}`);
for (const change of changes) {
  console.log(`- ${change.original}\n+ ${change.translated}`);
}
if (unmapped.length) {
  console.log('\nUnmapped UI strings (must be reviewed before approval):');
  for (const text of unmapped) console.log(`! ${text}`);
}
