// Generates crisp matte-carbon ZeroPoint app icons: build/icon.png (256x256) and multi-size build/icon.ico
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const outDir = path.join(process.cwd(), 'build');
fs.mkdirSync(outDir, { recursive: true });

function renderIconRGBA(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      // Clean rounded-square matte carbon badge (10% outer margin baked in)
      const boxR = size * 0.44;
      const cornerR = size * 0.13;
      const qx = Math.max(ax - (boxR - cornerR), 0);
      const qy = Math.max(ay - (boxR - cornerR), 0);
      const sdf = Math.sqrt(qx * qx + qy * qy) - cornerR;

      if (sdf > 1.0) {
        rgba[idx + 3] = 0;
        continue;
      }

      const aaAlpha = sdf > 0 ? Math.max(0, Math.min(1, 1 - sdf)) : 1;

      // Subtle vertical matte carbon tone (#18181d top -> #111114 bottom)
      const gradT = y / Math.max(1, size - 1);
      let r = Math.round(24 - gradT * 7);
      let g = Math.round(24 - gradT * 7);
      let b = Math.round(29 - gradT * 9);
      let a = Math.round(255 * aaAlpha);

      // Hairline neutral border (#32323c)
      const borderW = Math.max(1.0, size * 0.022);
      if (sdf > -borderW) {
        r = 54;
        g = 54;
        b = 64;
      }

      // 4 razor-sharp alabaster white crosshair arms (matches TitleBar SVG 1:1)
      const armHalfW = Math.max(1.0, size * 0.036);
      const gap = size * 0.115;
      const armEnd = size * 0.315;
      const inH = ay <= armHalfW && ax >= gap && ax <= armEnd;
      const inV = ax <= armHalfW && ay >= gap && ay <= armEnd;
      if (inH || inV) {
        r = 244;
        g = 244;
        b = 246;
      }

      // Single signature vermilion center pinpoint (#ff5526)
      const dotR = Math.max(1.3, size * 0.056);
      if (dist <= dotR) {
        r = 255;
        g = 85;
        b = 38;
      } else if (dist <= dotR + 0.9) {
        const blend = Math.max(0, Math.min(1, (dotR + 0.9 - dist) / 0.9));
        r = Math.round(r + (255 - r) * blend);
        g = Math.round(g + (85 - g) * blend);
        b = Math.round(b + (38 - b) * blend);
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
  header.writeUInt16LE(1, 2);
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

console.log('Generated matte-carbon ZeroPoint build/icon.png and build/icon.ico.');
