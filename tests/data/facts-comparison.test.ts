import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  generateFacts,
  REFERENCE_FEATURE_IDS,
  type ObjectFacts,
} from '../../scripts/data/buildSearchAndFacts';

type RawFeature = Parameters<typeof generateFacts>[0];

function country(id: string, area: number): RawFeature {
  return {
    type: 'Feature',
    id,
    properties: {
      id,
      kind: 'country',
      layerId: 'countriesTopN',
      name_pl: id,
      name_en: id,
      rank: { area, population: 1_000_000, order: 1 },
    },
    geometry: { type: 'Polygon', coordinates: [] },
  };
}

function feature(
  id: string,
  kind: string,
  rank: NonNullable<RawFeature['properties']['rank']>,
): RawFeature {
  return {
    type: 'Feature',
    id,
    properties: { id, kind, layerId: 'test', name_pl: id, name_en: id, rank },
    geometry: { type: 'Point', coordinates: [0, 0] },
  } as RawFeature;
}

// Regression: the Warsaw card said "Population ≈ 95% of Warsaw", the Vistula "≈ 1× the Vistula"
// and the Baltic Sea "≈ 55% of the Baltic Sea".
describe('facts: reference objects are not compared with themselves', () => {
  it.each([
    ['capital-warsaw', 'capital', { population: 1_707_000 }],
    ['river-vistula', 'river', { length: 1047 }],
    ['marine-sea-baltic-sea', 'marine', { area: 206_000 }],
    ['peak-rysy', 'peak', { elevation: 2499 }],
    ['lake-sniardwy', 'lake', { area: 113.8 }],
  ] as const)('%s has no comparison', (id, kind, rank) => {
    expect(generateFacts(feature(id, kind, rank)).comparison).toBeUndefined();
  });

  it('still compares other objects of the same kind', () => {
    expect(
      generateFacts(feature('capital-prague', 'capital', { population: 1_357_000 })).comparison,
    ).toEqual({ metric: 'population', ref: 'warsaw', ratio: 0.758 });
    expect(generateFacts(feature('river-oder', 'river', { length: 854 })).comparison?.ref).toBe(
      'vistula',
    );
  });
});

describe('facts: area comparison with Poland', () => {
  // Regression: the card for Poland said "Powierzchnia stanowi ok. 98.9% powierzchni Polski".
  it('does not compare Poland with itself', () => {
    expect(generateFacts(country('PL', 309_202)).comparison).toBeUndefined();
  });

  it('stores comparisons as language-neutral ratios', () => {
    expect(generateFacts(country('XX', 309_202)).comparison).toEqual({
      metric: 'area',
      ref: 'poland',
      ratio: 0.989,
    });
    expect(generateFacts(country('YY', 343_000)).comparison?.ratio).toBe(1.097);
  });

  it('stores stats as numbers with keys and the world rank last', () => {
    expect(generateFacts(country('YY', 343_000)).stats).toEqual([
      { key: 'area', value: 343_000 },
      { key: 'population', value: 1_000_000 },
      { key: 'rank', value: 1 },
    ]);
  });

  describe('shipped facts.json', () => {
    const factsPath = path.resolve(process.cwd(), 'public/data/facts.json');
    const facts = JSON.parse(fs.readFileSync(factsPath, 'utf-8')) as Record<string, ObjectFacts>;

    it('has no comparison for Poland', () => {
      expect(facts.PL?.comparison).toBeUndefined();
    });

    it('has no comparison for any reference object', () => {
      const offenders = Object.values(REFERENCE_FEATURE_IDS).filter(id => facts[id]?.comparison);
      expect(offenders).toEqual([]);
    });

    // Guards against a pipeline id change silently re-enabling self-comparisons.
    it('still contains the reference objects under the expected ids', () => {
      const { rysy: _rysy, sniardwy: _sniardwy, ...shipped } = REFERENCE_FEATURE_IDS;
      expect(Object.values(shipped).filter(id => !facts[id])).toEqual([]);
    });

    // Regression: facts.json held Polish sentences, so the English card mixed languages.
    it('contains no pre-formatted (Polish) text', () => {
      const offenders = Object.values(facts)
        .filter(
          f =>
            'kind_pl' in f ||
            typeof f.comparison === 'string' ||
            f.stats.some(stat => typeof stat.value !== 'number'),
        )
        .map(f => f.id);
      expect(offenders).toEqual([]);
    });
  });
});
