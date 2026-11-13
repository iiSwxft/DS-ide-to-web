// Bundles the MCP server and the bridge app into ONE self-contained file, dist/ds-ide-to-web.mjs,
// so it can run with no npm install (npx from GitHub, or as a Claude Code plugin).
// Usage: node bridge/tools/bundle.mjs   (also: npm run bundle)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outfile = join(root, 'dist/ds-ide-to-web.mjs');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

await build({
  entryPoints: [join(root, 'bridge/server/cli.mjs')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // ws loads these optional native speedups inside try/catch; they are not needed.
  external: ['bufferutil', 'utf-8-validate'],
  // Some bundled dependencies are CommonJS and call require() on Node built-ins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  define: { __BRIDGE_VERSION__: JSON.stringify(version) },
  legalComments: 'none',
  logLevel: 'info',
});

// Same bytes on every OS (some dependency files ship with CRLF), so CI can check the bundle is up to date.
writeFileSync(outfile, readFileSync(outfile, 'utf8').replace(/\r\n/g, '\n'));
