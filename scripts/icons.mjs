// Draws the app icons from the brand: a signal-yellow block mark on ink.
// Plain axis-aligned squares, so a tiny PNG encoder is all we need (no deps).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const INK = [0x16, 0x15, 0x0f];
const YELLOW = [0xf6, 0xd2, 0x1f];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** size px; mark = fraction of the icon covered by the yellow block. */
function icon(size, mark) {
  const s = Math.round(size * mark);
  const x0 = Math.round((size - s) / 2);
  // sits a touch low, like a block cursor resting on a baseline
  const y0 = Math.round((size - s) / 2 + size * 0.03);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const c = x >= x0 && x < x0 + s && y >= y0 && y < y0 + s ? YELLOW : INK;
      raw.set(c, row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icon-192.png', icon(192, 0.4));
writeFileSync('public/icon-512.png', icon(512, 0.4));
writeFileSync('public/icon-maskable-512.png', icon(512, 0.3));
writeFileSync('public/apple-touch-icon.png', icon(180, 0.36));
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#16150F"/><rect x="9.5" y="10.5" width="13" height="13" fill="#F6D21F"/></svg>\n`,
);
console.log('icons written to public/');
