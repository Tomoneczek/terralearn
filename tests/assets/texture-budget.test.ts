import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect } from 'vitest';

const TEXTURES_DIR = path.resolve(process.cwd(), 'public/textures');
const ROOT_ATTRIBUTION_PATH = path.resolve(process.cwd(), 'ATTRIBUTION.md');

describe('Texture Assets Budget and Quality Integrity (G08-01)', () => {
  it('strictly adheres to weight budgets for all planetary textures', () => {
    const budgets: Record<string, number> = {
      'earth-day.jpg': 300 * 1024, // max 300 KB
      'earth-dark.jpg': 120 * 1024, // max 120 KB
      'earth-night.jpg': 800 * 1024, // max 800 KB
      'earth-atlas.jpg': 350 * 1024, // max 350 KB
      'water-mask.png': 50 * 1024, // max 50 KB
      'clouds.png': 500 * 1024, // max 500 KB
      'night-sky.png': 1000 * 1024, // max 1000 KB
    };

    let totalBytes = 0;

    for (const [filename, maxBytes] of Object.entries(budgets)) {
      const filePath = path.join(TEXTURES_DIR, filename);
      expect(fs.existsSync(filePath), `Texture file ${filename} must exist`).toBe(true);

      const size = fs.statSync(filePath).size;
      totalBytes += size;

      expect(size).toBeLessThanOrEqual(maxBytes);
    }

    // Total textures budget <= 3.0 MB
    expect(totalBytes).toBeLessThanOrEqual(3.0 * 1024 * 1024);
  });

  it('generates a valid, accurate water mask separating oceans from continents', () => {
    const maskPath = path.join(TEXTURES_DIR, 'water-mask.png');
    expect(fs.existsSync(maskPath)).toBe(true);

    const buf = fs.readFileSync(maskPath);
    // Verify PNG signature: 137 80 78 71 13 10 26 10
    expect(buf[0]).toBe(137);
    expect(buf[1]).toBe(80);
    expect(buf[2]).toBe(78);
    expect(buf[3]).toBe(71);

    // Locate IDAT chunk and decompress scanlines
    const idatIdx = buf.indexOf(Buffer.from('IDAT'));
    expect(idatIdx).toBeGreaterThan(0);

    const idatLen = buf.readUInt32BE(idatIdx - 4);
    const compressed = buf.subarray(idatIdx + 4, idatIdx + 4 + idatLen);
    const raw = zlib.inflateSync(compressed);

    const width = 1024;
    const height = 512;

    function getPixel(lng: number, lat: number): number {
      const x = Math.max(0, Math.min(width - 1, Math.floor(((lng + 180) / 360) * width)));
      const y = Math.max(0, Math.min(height - 1, Math.floor(((90 - lat) / 180) * height)));
      // Grayscale scanlines include 1 filter byte per row
      return raw[y * (width + 1) + 1 + x]!;
    }

    // Oceans must be 255 (water)
    expect(getPixel(-30, 20)).toBe(255); // Mid-Atlantic
    expect(getPixel(-150, 0)).toBe(255); // Pacific
    expect(getPixel(75, -20)).toBe(255); // Indian Ocean
    expect(getPixel(0, 85)).toBe(255); // Arctic Ocean

    // Continents must be 0 (land)
    expect(getPixel(21, 52)).toBe(0); // Warsaw / Poland
    expect(getPixel(31, 30)).toBe(0); // Cairo / Egypt
    expect(getPixel(-60, -3)).toBe(0); // Amazon basin / Brazil
    expect(getPixel(135, -25)).toBe(0); // Central Australia
    expect(getPixel(0, 20)).toBe(0); // Sahara / Mali
  });

  it('provides public domain ATTRIBUTION.md covering Natural Earth and NASA Visible Earth', () => {
    expect(fs.existsSync(ROOT_ATTRIBUTION_PATH)).toBe(true);

    const content = fs.readFileSync(ROOT_ATTRIBUTION_PATH, 'utf-8');
    expect(content).toContain('Natural Earth');
    expect(content).toContain('NASA Visible Earth');
    expect(content).toContain('Komisja Standaryzacji Nazw Geograficznych');
    expect(content).toContain('Public Domain');
  });
});
