import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { generateFacts, type ObjectFacts } from '../../scripts/data/buildSearchAndFacts';

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
