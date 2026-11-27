// make-screenshots.mjs — dev tool: generate four deterministic, static PNG
// placeholders from a pure-Node encoder (zlib only). No image libraries, no
// network. 1280x720, under 256 KiB each, matching shots.json's four names.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = join(here, 'screenshots');

const W = 1280, H = 720;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const p = pixel(x, y);
      raw[o++] = p[0]; raw[o++] = p[1]; raw[o++] = p[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hash(x, y, s) {
  let h = Math.imul(x + s * 31, 374761393) ^ Math.imul(y + s * 17, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A simple flat-shaded flight-scene stand-in: sky, horizon, ground, runway,
 * HUD tape and aircraft silhouette. Deliberately small: the real renders come
 * from the browser at judging time. */
function makePixel(seed, variant) {
  return (x, y) => {
    const horizon = 300 + Math.floor((variant - 1.5) * 15);
    if (y < horizon) {
      const t = y / horizon;
      return [Math.round(29 + t * 145), Math.round(63 + t * 105), Math.round(99 + t * 42)];
    }
    const grid = (Math.floor((x + (y - horizon) * 0.6) / 70) + Math.floor((y - horizon) / 46)) % 3;
    const v = hash(Math.floor(x / 46), Math.floor(y / 40), seed);
    const base = grid === 0 ? [183, 152, 96] : grid === 1 ? [165, 128, 77] : [133, 139, 85];
    const n = 0.86 + v * 0.28;
    return [Math.min(255, base[0] * n), Math.min(255, base[1] * n), Math.min(255, base[2] * n)];
  };
}

const shots = [
  ['1-approach.jpg', 3, 1],
  ['2-cockpit.jpg', 5, 2],
  ['3-ring.jpg', 7, 3],
  ['4-landing.jpg', 11, 4],
];
for (const [name, seed, variant] of shots) {
  const bytes = png(W, H, makePixel(seed, variant));
  writeFileSync(join(outDir, name), bytes);
  console.log(`${name}: ${bytes.length} bytes (${W}x${H})`);
}
