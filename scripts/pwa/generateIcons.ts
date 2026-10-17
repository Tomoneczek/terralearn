import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function encodeRGBAtoPNG(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = makePngChunk('IHDR', ihdrData);

  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  let inPos = 0;
  let outPos = 0;
  for (let y = 0; y < height; y++) {
    rawScanlines[outPos++] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      rawScanlines[outPos++] = rgba[inPos++]!;
      rawScanlines[outPos++] = rgba[inPos++]!;
      rawScanlines[outPos++] = rgba[inPos++]!;
      rawScanlines[outPos++] = rgba[inPos++]!;
    }
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });
  const idatChunk = makePngChunk('IDAT', compressed);
  const iendChunk = makePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

function generateIcon(size: number): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44;
  const strokeW = Math.max(2, Math.round(size * 0.035));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Default dark background #0a0e17
      let red = 10;
      let green = 14;
      let blue = 23;
      const alpha = 255;

      if (dist <= r + strokeW / 2) {
        if (Math.abs(dist - r) <= strokeW / 2) {
          // Cyan rim: #38bdf8 (56, 189, 248)
          red = 56;
          green = 189;
          blue = 248;
        } else if (dist < r) {
          // Inner globe: #0b0e14 (11, 14, 20)
          red = 11;
          green = 14;
          blue = 20;

          // Parallels (horizontal ellipses)
          const ellipse1 = (dx * dx) / (r * r) + (dy * dy) / (r * 0.38 * (r * 0.38));
          if (Math.abs(ellipse1 - 1.0) < 0.12) {
            red = 14;
            green = 165;
            blue = 233;
          }

          // Meridians (vertical ellipses)
          const ellipse2 = (dx * dx) / (r * 0.38 * (r * 0.38)) + (dy * dy) / (r * r);
          if (Math.abs(ellipse2 - 1.0) < 0.12) {
            red = 14;
            green = 165;
            blue = 233;
          }

          // Center core: cyan dot
          if (dist < r * 0.22) {
            red = 56;
            green = 189;
            blue = 248;
          }
        }
      }

      rgba[idx] = red;
      rgba[idx + 1] = green;
      rgba[idx + 2] = blue;
      rgba[idx + 3] = alpha;
    }
  }

  return encodeRGBAtoPNG(size, size, rgba);
}

const outDir = path.resolve(process.cwd(), 'public/icons');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'icon-192.png'), generateIcon(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), generateIcon(512));
console.log('✅ Generated public/icons/icon-192.png and public/icons/icon-512.png');
