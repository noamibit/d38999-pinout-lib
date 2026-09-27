// Minimal, dependency-free PNG icon generator.
// Produces icons/icon-192.png, icons/icon-512.png and icons/icon-512-maskable.png
// by rasterizing a tiny connector-dot glyph directly into a pixel buffer.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Add a filter-type byte (0 = none) before each scanline.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hex(c) {
  return [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
}

const BG = hex('#0b0f14');
const DOT = hex('#4da3ff');

/** Draw the connector-dot glyph into a size x size RGBA buffer. */
function render(size, { maskableSafe = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  };

  const cx = size / 2;
  const cy = size / 2;
  // Maskable icons need important content within the safe-zone circle
  // (~40% radius), so shrink the glyph for that variant.
  const scale = maskableSafe ? 0.34 : 0.46;
  const R = size * scale;
  const ringW = Math.max(2, size * 0.03);
  const dotR = Math.max(2, size * 0.045);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      set(x, y, BG);
    }
  }

  // Ring.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - R) <= ringW) set(x, y, DOT);
    }
  }

  // Six dots around the ring + one center dot.
  const positions = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    positions.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  positions.push([cx, cy]);

  for (const [px, py] of positions) {
    const r = px === cx && py === cy ? dotR * 1.2 : dotR;
    for (let y = Math.floor(py - r - 1); y <= py + r + 1; y++) {
      for (let x = Math.floor(px - r - 1); x <= px + r + 1; x++) {
        if (Math.hypot(x - px, y - py) <= r) set(x, y, DOT);
      }
    }
  }

  return buf;
}

for (const [name, size, opts] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-512-maskable.png', 512, { maskableSafe: true }],
]) {
  const buf = render(size, opts);
  writeFileSync(path.join(outDir, name), encodePNG(size, size, buf));
  console.log('wrote', name);
}
