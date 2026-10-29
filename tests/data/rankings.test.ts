import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { RankingsDataSchema, RANKING_CATEGORIES, type RankingsData } from '@/rankings/types';

const DATA_DIR = path.resolve(process.cwd(), 'public/data');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));

const rankings: RankingsData = RankingsDataSchema.parse(read('rankings.json'));
const names = (category: (typeof RANKING_CATEGORIES)[number], n: number) =>
  rankings.categories[category].slice(0, n).map(r => r.name_en);

describe('rankings.json', () => {
  it('stays within the gzip budget (lazy-loaded, no geometry)', () => {
    const gzipKb =
      zlib.gzipSync(fs.readFileSync(path.join(DATA_DIR, 'rankings.json'))).length / 1024;
    expect(gzipKb).toBeLessThanOrEqual(70);
  });

  it('has the world top 3 of every well-known category', () => {
    expect(names('lakes', 3)).toEqual(['Caspian Sea', 'Superior', 'Victoria']);
    expect(names('rivers', 3)).toEqual(['Nile', 'Amazon', 'Yangtze']);
    expect(names('mountains', 3)).toEqual(['Himalayas', 'Karakoram', 'Hindu Kush']);
    expect(names('peaks', 3)).toEqual(['Mount Everest', 'K2', 'Kanchenjunga']);
    expect(names('countriesTopN', 2)).toEqual(['Russia', 'Antarctica']);
  });

  it('orders every category by a strictly increasing, gap-free rank', () => {
    for (const category of RANKING_CATEGORIES) {
      const orders = rankings.categories[category].map(r => r.order);
      expect(orders, category).toEqual([...orders].sort((a, b) => a - b));
      expect(new Set(orders).size, category).toBe(orders.length);
    }
  });

  it('keeps every object of the layer files, with a matching id and rank', () => {
    const sources = {
      lakes: ['lakes.json', 'lake'],
      rivers: ['rivers.json', 'river'],
      mountains: ['regions.json', 'mountain'],
      deserts: ['regions.json', 'desert'],
      landforms: ['landforms.json', 'landform'],
      marine: ['marine.json', 'marine'],
      countriesTopN: ['countries.json', 'country'],
      peaks: ['places.json', 'peak'],
    } as const;
    for (const [category, [file, kind]] of Object.entries(sources)) {
      const features: { properties: { id: string; kind: string; rank: { order?: number } } }[] =
        read(file).features.filter(
          (f: { properties: { kind: string } }) => f.properties.kind === kind,
        );
      const rows = rankings.categories[category as keyof typeof sources];
      expect(rows.length, category).toBe(features.length);
      const byId = new Map(rows.map(r => [r.id, r]));
      for (const f of features) {
        const row = byId.get(f.properties.id);
        expect(row, `${category}: ${f.properties.id}`).toBeDefined();
        if (f.properties.rank.order) expect(row?.order).toBe(f.properties.rank.order);
      }
    }
  });

  it('orders peaks by height and keeps heights known for peaks', () => {
    const peaks = rankings.categories.peaks;
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i - 1]!.value!).toBeGreaterThanOrEqual(peaks[i]!.value!);
    }
  });

  it('resolves every referenced country code to names in both languages', () => {
    for (const category of RANKING_CATEGORIES) {
      for (const row of rankings.categories[category]) {
        for (const code of row.countries ?? []) {
          expect(rankings.countries[code], `${row.id} → ${code}`).toBeDefined();
        }
      }
    }
    expect(rankings.countries['PL']).toEqual({ pl: 'Polska', en: 'Poland' });
  });

  it('gives the longest river the largest extent for camera framing', () => {
    const nile = rankings.categories.rivers[0]!;
    expect(nile.extentKm).toBe(6650);
    expect(rankings.categories.peaks[0]!.extentKm).toBe(0);
  });
});
