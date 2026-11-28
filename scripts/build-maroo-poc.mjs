import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const dependencyDir = path.join(repoDir, 'world-challenges-live', 'node_modules');
const projectRequire = createRequire(path.join(repoDir, 'world-challenges-live', 'package.json'));
const { build } = projectRequire('esbuild');
const bundlePath = path.join(repoDir, 'maroo-poc', 'app.bundle.js');

await build({
  entryPoints: [path.join(repoDir, 'maroo-poc', 'app.js')],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  nodePaths: [dependencyDir],
  sourcemap: false,
  minify: true,
  legalComments: 'eof',
  logLevel: 'info'
});

// Normalize embedded third-party shader whitespace without changing the source application.
const bundle = await readFile(bundlePath, 'utf8');
const normalizedBundle = bundle
  .replace(/^ +(?=\t)/gm, '')
  .replace(/[\t ]+$/gm, '');
await writeFile(bundlePath, normalizedBundle);
console.log('تم بناء maroo-poc/app.bundle.js اعتمادًا على الحزم المحلية فقط.');
