// Bundles src/app.js (the question bank is compiled in from data/) and copies site/ into dist/.
import { build } from 'esbuild';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(root, 'src/app.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: false,
  target: ['es2022'],
  outdir: dist,
  logLevel: 'info',
});
for (const f of readdirSync(join(root, 'site'))) writeFileSync(join(dist, f), readFileSync(join(root, 'site', f)));
writeFileSync(join(dist, '.nojekyll'), '');
console.log('bundled → dist/');
