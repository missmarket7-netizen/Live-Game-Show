import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const dependencyDir = path.join(repoDir, 'world-challenges-live', 'node_modules');
const projectRequire = createRequire(path.join(repoDir, 'world-challenges-live', 'package.json'));
const { build } = projectRequire('esbuild');

await build({
  entryPoints: [path.join(repoDir, 'maroo-poc', 'app.js')],
  outfile: path.join(repoDir, 'maroo-poc', 'app.bundle.js'),
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
console.log('تم بناء maroo-poc/app.bundle.js اعتمادًا على الحزم المحلية فقط.');
