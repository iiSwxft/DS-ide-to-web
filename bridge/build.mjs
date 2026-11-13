// Bundles the bridge extension. Run from the repo root: node bridge/build.mjs
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ext = join(here, 'extension');
const dist = join(ext, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'deepseek'), { recursive: true });

await build({
  entryPoints: { content: join(ext, 'src/content.ts') },
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: false,
  logLevel: 'info',
});
await build({
  entryPoints: { background: join(ext, 'src/background.js') },
  outdir: dist,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  logLevel: 'info',
});
cpSync(join(here, '..', 'public', 'deepseek', 'sha3_wasm_bg.wasm'), join(dist, 'deepseek', 'sha3_wasm_bg.wasm'));
console.log('Built bridge extension ->', dist);
