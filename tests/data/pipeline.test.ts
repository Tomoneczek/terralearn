import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { GeoFeatureCollectionSchema, type GeoFeatureCollection } from '../../scripts/data/schema';

const DATA_DIR = path.resolve(process.cwd(), 'public/data');

describe('Data Pipeline Output Verification', () => {
  const datasets = [
    { name: 'countries.json', budgetGzipKb: 150, minFeatures: 150 },
    { name: 'rivers.json', budgetGzipKb: 250, minFeatures: 200 },
    { name: 'lakes.json', budgetGzipKb: 150, minFeatures: 100 },
    { name: 'regions.json', budgetGzipKb: 250, minFeatures: 150 },
    { name: 'places.json', budgetGzipKb: 80, minFeatures: 300 },
  ];

  for (const ds of datasets) {
    describe(`Dataset: ${ds.name}`, () => {
      const filePath = path.join(DATA_DIR, ds.name);

      it('file exists on disk', () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it(`strictly satisfies gzip budget (<= ${ds.budgetGzipKb} KB)`, () => {
        const raw = fs.readFileSync(filePath);
        const gzip = zlib.gzipSync(raw);
        const gzipKb = gzip.length / 1024;
        expect(gzipKb).toBeLessThanOrEqual(ds.budgetGzipKb);
      });

      it('strictly validates against GeoFeatureCollectionSchema', () => {
        const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const parsed = GeoFeatureCollectionSchema.safeParse(json);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.features.length).toBeGreaterThanOrEqual(ds.minFeatures);
        }
      });

      it('contains valid non-empty Polish names (name_pl) for 100% of Top 20 features', () => {
        const json = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GeoFeatureCollection;
        const top20 = json.features.slice(0, 20);
        for (const feat of top20) {
          expect(feat.properties.name_pl).toBeTruthy();
          expect(typeof feat.properties.name_pl).toBe('string');
          expect(feat.properties.name_pl.trim().length).toBeGreaterThan(0);
        }
      });

      it('has unique IDs across all features', () => {
        const json = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GeoFeatureCollection;
        const ids = new Set<string>();
        for (const feat of json.features) {
          expect(ids.has(feat.properties.id)).toBe(false);
          ids.add(feat.properties.id);
        }
      });
    });
  }

  it('generates public/data/ATTRIBUTION.md with proper license statements', () => {
    const attrPath = path.join(DATA_DIR, 'ATTRIBUTION.md');
    expect(fs.existsSync(attrPath)).toBe(true);
    const text = fs.readFileSync(attrPath, 'utf-8');
    expect(text).toContain('Natural Earth Vector');
    expect(text).toContain('Public Domain');
    expect(text).toContain('Komisja Standaryzacji Nazw Geograficznych');
  });
});
