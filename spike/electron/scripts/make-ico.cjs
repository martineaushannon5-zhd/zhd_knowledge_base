// Pack the rasterized brand PNGs into a Windows .ico (PNG-embedded entries).
// Run: node scripts/make-ico.cjs
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '..', 'assets');
const sizes = [16, 32, 48, 64, 128, 256];
const blobs = sizes.map(s => ({ s, buf: fs.readFileSync(path.join(dir, `icon-${s}.png`)) }));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(blobs.length, 4);
let offset = 6 + 16 * blobs.length;
const entries = [];
for (const { s, buf } of blobs) {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(buf.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += buf.length;
}
fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([header, ...entries, ...blobs.map(b => b.buf)]));
console.log('wrote icon.ico', fs.statSync(path.join(dir, 'icon.ico')).size, 'bytes');
