// Builds the bridge extension for Chromium and Firefox.
// Run from the repo root: node bridge/build.mjs
// Output: bridge/build/chrome and bridge/build/firefox (each self-contained).
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ext = join(here, 'extension');
const out = join(here, 'build');

const baseManifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));

const targets = {
  chrome: (m) => m,
  firefox: (m) => {
    const { service_worker, ...background } = m.background;
    return {
      ...m,
      // Firefox MV3 uses event pages (background.scripts), not service workers.
      background: { ...background, scripts: [service_worker] },
      browser_specific_settings: {
        gecko: {
          id: 'ds-bridge@ds-ide-to-web.invalid',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    };
  },
};

rmSync(out, { recursive: true, force: true });

for (const [name, transform] of Object.entries(targets)) {
  const dir = join(out, name);
  mkdirSync(join(dir, 'deepseek'), { recursive: true });

  await build({
    entryPoints: { content: join(ext, 'src/content.ts') },
    outdir: dir,
    bundle: true,
    format: 'iife',
    target: name === 'firefox' ? 'firefox128' : 'chrome120',
    logLevel: 'warning',
  });
  await build({
    entryPoints: { background: join(ext, 'src/background.js') },
    outdir: dir,
    bundle: true,
    format: 'esm',
    target: name === 'firefox' ? 'firefox128' : 'chrome120',
    logLevel: 'warning',
  });
  for (const file of ['options.html', 'options.js']) cpSync(join(ext, file), join(dir, file));
  cpSync(join(here, '..', 'public', 'deepseek', 'sha3_wasm_bg.wasm'), join(dir, 'deepseek', 'sha3_wasm_bg.wasm'));
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(transform(structuredClone(baseManifest)), null, 2)}\n`);
  console.log(`Built ${name} -> ${dir}`);
}
