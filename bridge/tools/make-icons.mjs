// Renders the DeepSeek Bridge icon (a bridge arch on the popup's blue) to PNG with no dependencies.
// Usage: node bridge/tools/make-icons.mjs   -> writes bridge/extension/icons/*.png and icon.svg
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
mkdirSync(out, { recursive: true });

const C1 = [0x6f, 0x8a, 0xff]; // gradient start (top-left)
const C2 = [0x3a, 0x4b, 0xd8]; // gradient end (bottom-right), close to the popup accent #4d6bfe

const roundedRect = (u, v, r) => {
  const qx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
  const qy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  return Math.hypot(qx, qy) - r; // <= 0 inside
};

const box = (u, v, x0, x1, y0, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;

/** Is the white glyph covering this point? A bridge: deck, two pillars, and an arch. */
function glyph(u, v) {
  const deck = box(u, v, 0.14, 0.86, 0.68, 0.77);
  const pillars = box(u, v, 0.21, 0.29, 0.50, 0.68) || box(u, v, 0.71, 0.79, 0.50, 0.68);
  const d = Math.hypot(u - 0.5, v - 0.86);
  const arch = Math.abs(d - 0.31) <= 0.045 && v <= 0.70;
  return deck || pillars || arch;
}

function render(size) {
  const S = 4; // supersampling per axis
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let cover = 0;
      let white = 0;
      for (let sy = 0; sy < S; sy += 1) {
        for (let sx = 0; sx < S; sx += 1) {
          const u = (x + (sx + 0.5) / S) / size;
          const v = (y + (sy + 0.5) / S) / size;
          if (roundedRect(u, v, 0.22) <= 0) {
            cover += 1;
            if (glyph(u, v)) white += 1;
          }
        }
      }
      const total = S * S;
      const t = (x + y) / (2 * size);
      const base = C1.map((c, i) => c + (C2[i] - c) * t);
      const w = cover ? white / cover : 0;
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k += 1) px[i + k] = Math.round(base[k] * (1 - w) + 255 * w);
      px[i + 3] = Math.round((cover / total) * 255);
    }
  }
  return px;
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) writeFileSync(join(out, `icon-${size}.png`), png(size, render(size)));
writeFileSync(join(out, 'icon.png'), png(96, render(96)));

// The Claude Code plugin listing wants a square PNG between 512 and 2048 px.
const pluginDir = join(out, '..', '..', '..', '.claude-plugin');
mkdirSync(pluginDir, { recursive: true });
writeFileSync(join(pluginDir, 'icon.png'), png(512, render(512)));

writeFileSync(join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6f8aff"/><stop offset="1" stop-color="#3a4bd8"/></linearGradient></defs>
  <rect width="128" height="128" rx="28" fill="url(#g)"/>
  <g fill="#fff"><rect x="18" y="87" width="92" height="12" rx="2"/><rect x="27" y="64" width="10" height="23"/><rect x="91" y="64" width="10" height="23"/></g>
  <path d="M24 87 A40 40 0 0 1 104 87" fill="none" stroke="#fff" stroke-width="11"/>
</svg>
`);
console.log('icons written to', out);
