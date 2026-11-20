// Generates high-resolution crisp build/icon.png (256x256) and multi-size build/icon.ico (256, 64, 48, 32, 16)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const outDir = path.join(process.cwd(), 'build');
fs.mkdirSync(outDir, { recursive: true });

function renderIconRGBA(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const rMax = size * 0.46;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      // Rounded-square dark obsidian plate with subtle cyan glow gradient
      const boxR = size * 0.46;
      const cornerR = size * 0.14;
      const qx = Math.max(ax - (boxR - cornerR), 0);
      const qy = Math.max(ay - (boxR - cornerR), 0);
      const sdf = Math.sqrt(qx * qx + qy * qy) - cornerR;

      if (sdf > 1.0) {
        rgba[idx + 3] = 0;
        continue;
      }

      const aaAlpha = sdf > 0 ? Math.max(0, Math.min(1, 1 - sdf)) : 1;

      // Obsidian backdrop with radial cyan core glow
      const glow = Math.max(0, 1 - dist / (rMax * 1.15));
      let r = Math.round(9 + glow * 10);
      let g = Math.round(14 + glow * 34);
      let b = Math.round(24 + glow * 48);
      let a = Math.round(255 * aaAlpha);

      // Outer beveled frame border
      if (sdf > -size * 0.032) {
        r = 0;
        g = 210;
        b = 235;
      }

      // Subtle inner precision ring
      const ringR = size * 0.31;
      const ringW = Math.max(1.1, size * 0.022);
      if (Math.abs(dist - ringR) <= ringW && !(ax < size * 0.09 || ay < size * 0.09)) {
        r = 0;
        g = 240;
        b = 255;
      }

      // 4 crisp tactical crosshair arms
      const armHalfW = Math.max(1.1, size * 0.033);
      const gap = size * 0.11;
      const armEnd = size * 0.36;
      const inH = ay <= armHalfW && ax >= gap && ax <= armEnd;
      const inV = ax <= armHalfW && ay >= gap && ay <= armEnd;
      if (inH || inV) {
        r = 0;
        g = 245;
        b = 255;
      }

      // Bright white center pinpoint dot with crisp rim
      const dotR = Math.max(1.4, size * 0.048);
      if (dist <= dotR) {
        r = 255;
        g = 255;
        b = 255;
      } else if (dist <= dotR + Math.max(0.8, size * 0.015)) {
        r = 16;
        g = 245;
        b = 155;
      }

      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }
  return rgba;
}

function encodePNG(width, height, rgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOut = y * (width * 4 + 1);
    scanlines[rowOut] = 0;
    rgba.copy(scanlines, rowOut + 1, y * width * 4, (y + 1) * width * 4);
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildICO(sizes) {
  const images = sizes.map((s) => ({
    size: s,
    png: encodePNG(s, s, renderIconRGBA(s)),
  }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO
  header.writeUInt16LE(images.length, 4);

  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  images.forEach((img, i) => {
    const pos = i * 16;
    entries[pos] = img.size >= 256 ? 0 : img.size;
    entries[pos + 1] = img.size >= 256 ? 0 : img.size;
    entries[pos + 2] = 0;
    entries[pos + 3] = 0;
    entries.writeUInt16LE(1, pos + 4);
    entries.writeUInt16LE(32, pos + 6);
    entries.writeUInt32LE(img.png.length, pos + 8);
    entries.writeUInt32LE(offset, pos + 12);
    offset += img.png.length;
  });

  return Buffer.concat([header, entries, ...images.map((img) => img.png)]);
}

const png256 = encodePNG(256, 256, renderIconRGBA(256));
fs.writeFileSync(path.join(outDir, 'icon.png'), png256);

const ico = buildICO([256, 128, 64, 48, 32, 16]);
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);

console.log('Generated build/icon.png (256x256) and build/icon.ico (multi-res).');
