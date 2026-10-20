import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  generateFacts,
  formatDecimalPl,
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

describe('facts: area comparison with Poland', () => {
  it('formats decimals with a Polish comma', () => {
    expect(formatDecimalPl(98.94)).toBe('98,9');
    expect(formatDecimalPl(1)).toBe('1,0');
  });

  // Regression: the card for Poland said "Powierzchnia stanowi ok. 98.9% powierzchni Polski".
  it('does not compare Poland with itself', () => {
    expect(generateFacts(country('PL', 309_202)).comparison).toBeUndefined();
  });

  it('uses a decimal comma in the share and multiple wording for other countries', () => {
    expect(generateFacts(country('XX', 309_202)).comparison).toBe(
      'Powierzchnia stanowi ok. 98,9% powierzchni Polski',
    );
    expect(generateFacts(country('YY', 343_000)).comparison).toBe(
      'Powierzchnia równa ok. 1,1x terytorium Polski',
    );
  });

  describe('shipped facts.json', () => {
    const factsPath = path.resolve(process.cwd(), 'public/data/facts.json');
    const facts = JSON.parse(fs.readFileSync(factsPath, 'utf-8')) as Record<string, ObjectFacts>;

    it('has no comparison for Poland', () => {
      expect(facts.PL?.comparison).toBeUndefined();
    });

    it('never uses a decimal point in comparison numbers', () => {
      const offenders = Object.values(facts)
        .filter(f => f.comparison && /\d\.\d/.test(f.comparison))
        .map(f => f.id);
      expect(offenders).toEqual([]);
    });
  });
});
