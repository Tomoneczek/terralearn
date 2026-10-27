import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SEAS_LISTED_AS_LAKES,
  compareRanges,
  isReservoir,
  lakeEnglishName,
  maxElevationInRange,
  type RawPeak,
} from '../../scripts/data/physicalRanking';
import type { GeoFeatureCollection } from '../../scripts/data/schema';

const range = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [80, 25],
      [80, 35],
      [90, 35],
      [90, 25],
      [80, 25],
    ],
  ],
};

const peak = (lng: number, lat: number, elevation: number | string): RawPeak => ({
  geometry: { coordinates: [lng, lat] },
  properties: { elevation },
});

describe('maxElevationInRange', () => {
  it('uses the highest peak inside the outline regardless of region names (Himalayas regression)', () => {
    const peaks = [peak(86.9, 28.0, 8848), peak(85, 28, '6000'), peak(10, 46, 4808)];
    expect(maxElevationInRange(range, peaks)).toBe(8848);
  });

  it('returns undefined instead of a made-up 2000 m when no peak lies inside', () => {
    expect(maxElevationInRange(range, [peak(10, 46, 4808)])).toBeUndefined();
  });

  it('uses the curated summit of a well-known range without elevation points', () => {
    expect(maxElevationInRange(range, [], 'Taurus mountains')).toBe(3756);
  });
});

describe('compareRanges', () => {
  it('puts ranges with a known elevation first, the rest by area', () => {
    const ranges = [
      { name: 'unknown-small', area: 10 },
      { name: 'low', elevation: 1000, area: 1 },
      { name: 'unknown-big', area: 500 },
      { name: 'high', elevation: 8848, area: 1 },
    ];
    expect([...ranges].sort(compareRanges).map(r => r.name)).toEqual([
      'high',
      'low',
      'unknown-big',
      'unknown-small',
    ]);
  });
});

describe('isReservoir', () => {
  it('drops artificial reservoirs but keeps natural lakes Natural Earth labels "Reservoir"', () => {
    expect(isReservoir({ name: 'Represa de Sobradinho', featurecla: 'Reservoir' })).toBe(true);
    expect(isReservoir({ name: 'Rés. de La Grande 3', featurecla: 'Reservoir' })).toBe(true);
    expect(isReservoir({ name: 'Lake Volta', featurecla: 'Reservoir' })).toBe(true);
    expect(isReservoir({ name: 'Issyk-Kul', featurecla: 'Reservoir' })).toBe(false);
    expect(isReservoir({ name: 'Dead Sea', featurecla: 'Reservoir' })).toBe(false);
    expect(isReservoir({ name: 'Lake Superior', featurecla: 'Lake' })).toBe(false);
  });
});

describe('lake classification', () => {
  it('lists the Caspian Sea with lakes (largest lake in the world), not with marine bodies', () => {
    expect(SEAS_LISTED_AS_LAKES.has('Caspian Sea')).toBe(true);
  });

  it('uses the common English name for Lake Victoria instead of "Nyanza"', () => {
    expect(lakeEnglishName({ name: 'Lake Victoria', name_en: 'Nyanza' })).toBe('Victoria');
    expect(lakeEnglishName({ name: 'Lake Superior', name_en: 'Superior' })).toBe('Superior');
    expect(lakeEnglishName({ name: 'Foo', name_en: null })).toBe('Foo');
  });
});

describe('generated data (regression for the reported rankings)', () => {
  const read = (file: string) =>
    JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'public/data', file), 'utf-8'),
    ) as GeoFeatureCollection;

  it('ranks the Caspian Sea as the largest lake and lists no reservoirs', () => {
    const lakes = read('lakes.json').features;
    expect(lakes.slice(0, 3).map(f => f.properties.name_en)).toEqual([
      'Caspian Sea',
      'Superior',
      'Victoria',
    ]);
    expect(lakes.some(f => /Sobradinho|Kariba|Volta/.test(f.properties.name_en))).toBe(false);
    expect(read('marine.json').features.some(f => f.properties.name_en === 'Caspian Sea')).toBe(
      false,
    );
  });

  it('ranks the Himalayas first and never invents a 2000 m summit', () => {
    const ranges = read('regions.json').features.filter(f => f.properties.kind === 'mountain');
    expect(ranges.slice(0, 3).map(f => f.properties.name_en)).toEqual([
      'Himalayas',
      'Karakoram',
      'Hindu Kush',
    ]);
    expect(ranges.filter(f => f.properties.rank.elevation === 2000)).toHaveLength(0);
  });

  it('has no Polish region names written in capitals', () => {
    const names = [...read('regions.json').features, ...read('landforms.json').features].map(
      f => f.properties.name_pl,
    );
    expect(names.filter(n => /[A-ZĄĆĘŁŃÓŚŹŻ]{2}/.test(n) && n === n.toUpperCase())).toEqual([]);
  });
});
