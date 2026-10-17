import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface WaterMaskOptions {
  width?: number;
  height?: number;
  sourceGeoJsonPath?: string;
  outputPath?: string;
}

// Precomputed CRC32 table for PNG chunk writing
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

/**
 * Creates an 8-bit grayscale PNG file from raw pixel data.
 */
export function encodeGrayscalePng(width: number, height: number, data: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: 13 bytes
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per pixel
  ihdr[9] = 0; // color type: 0 (grayscale)
  ihdr[10] = 0; // deflate compression
  ihdr[11] = 0; // filter: standard
  ihdr[12] = 0; // no interlace

  const ihdrChunk = makePngChunk('IHDR', ihdr);

  // Scanlines with filter byte 0 (None) at the start of each row
  const scanlines = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    scanlines[y * (width + 1)] = 0; // filter byte
    data.copy(scanlines, y * (width + 1) + 1, y * width, (y + 1) * width);
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = makePngChunk('IDAT', compressed);
  const iendChunk = makePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

interface GeoJsonPolygonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

interface GeoJsonFeature {
  geometry: GeoJsonPolygonGeometry;
}

interface GeoJsonCollection {
  features: GeoJsonFeature[];
}

/**
 * Generates an equirectangular water/ocean mask raster from Natural Earth land polygons.
 * Pixels: 255 = water / oceans, 0 = land.
 */
export function generateWaterMask(options: WaterMaskOptions = {}): Buffer {
  const width = options.width ?? 1024;
  const height = options.height ?? 512;
  const defaultSource = path.resolve(
    process.cwd(),
    '.cache/data/raw/ne_110m_admin_0_countries.geojson',
  );
  const sourcePath = options.sourceGeoJsonPath ?? defaultSource;
  const outputPath =
    options.outputPath ?? path.resolve(process.cwd(), 'public/textures/water-mask.png');

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`GeoJSON source not found at ${sourcePath}`);
  }

  const raw = fs.readFileSync(sourcePath, 'utf-8');
  const geojson = JSON.parse(raw) as GeoJsonCollection;

  // Initialize buffer with 255 (water)
  const buffer = Buffer.alloc(width * height, 255);

  // Extract all exterior polygon rings
  const rings: [number, number][][] = [];
  for (const f of geojson.features) {
    if (f.geometry?.type === 'Polygon') {
      rings.push(f.geometry.coordinates[0] as [number, number][]);
    } else if (f.geometry?.type === 'MultiPolygon') {
      for (const poly of f.geometry.coordinates) {
        rings.push(poly[0] as [number, number][]);
      }
    }
  }

  // Convert lat/lng to equirectangular pixel space
  const pixelRings = rings.map(ring =>
    ring.map(([lng, lat]) => [((lng + 180) / 360) * width, ((90 - lat) / 180) * height]),
  );

  // Scanline polygon rasterizer
  for (let y = 0; y < height; y++) {
    const scanY = y + 0.5;
    const intersections: number[] = [];

    for (const ring of pixelRings) {
      const n = ring.length;
      for (let i = 0; i < n - 1; i++) {
        const p1 = ring[i]!;
        const p2 = ring[i + 1]!;
        const y1 = p1[1]!;
        const y2 = p2[1]!;

        if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) {
          const x = p1[0]! + ((scanY - y1) / (y2 - y1)) * (p2[0]! - p1[0]!);
          intersections.push(x);
        }
      }
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length; i += 2) {
      const xStart = Math.max(0, Math.floor(intersections[i]!));
      const xEnd = Math.min(width - 1, Math.ceil(intersections[i + 1]!));
      for (let x = xStart; x <= xEnd; x++) {
        buffer[y * width + x] = 0; // 0 = land
      }
    }
  }

  const png = encodeGrayscalePng(width, height, buffer);

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, png);
  console.log(`  ✓ Generated water mask ${outputPath} (${(png.length / 1024).toFixed(1)} KB)`);

  return png;
}

// Direct execution CLI
if (process.argv[1]?.includes('generateWaterMask')) {
  try {
    generateWaterMask();
  } catch (err) {
    console.error('Failed to generate water mask:', err);
    process.exit(1);
  }
}
