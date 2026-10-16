import { describe, it, expect } from 'vitest';
import { normalizeText, searchIndex, type SearchIndexItem } from '@/geo/search';

describe('Search & Normalization', () => {
  it('normalizes Polish diacritics, spaces and case', () => {
    expect(normalizeText('Polska')).toBe('polska');
    expect(normalizeText('Jezioro Śniardwy')).toBe('jezioro sniardwy');
    expect(normalizeText('Łódź')).toBe('lodz');
    expect(normalizeText('KRAKÓW')).toBe('krakow');
    expect(normalizeText(' Żółć ')).toBe('zolc');
  });

  const mockIndex: SearchIndexItem[] = [
    {
      id: 'PL',
      name_pl: 'Polska',
      name_en: 'Poland',
      normalized_name: 'polska poland',
      kind: 'country',
      layerId: 'countriesTopN',
      lat: 52.0,
      lng: 19.0,
      rank: 1,
    },
    {
      id: 'l1',
      name_pl: 'Śniardwy',
      name_en: 'Sniardwy',
      normalized_name: 'sniardwy jezioro sniardwy',
      kind: 'lake',
      layerId: 'lakes',
      lat: 53.7,
      lng: 21.7,
      rank: 2,
    },
    {
      id: 'r1',
      name_pl: 'Wisła',
      name_en: 'Vistula',
      normalized_name: 'wisla vistula',
      kind: 'river',
      layerId: 'rivers',
      lat: 52.2,
      lng: 21.0,
      rank: 3,
    },
    {
      id: 'p1',
      name_pl: 'Mount Everest',
      name_en: 'Mount Everest',
      normalized_name: 'mount everest czomolungma',
      kind: 'peak',
      layerId: 'peaks',
      lat: 27.9,
      lng: 86.9,
      rank: 1,
    },
  ];

  it('matches prefix queries prioritizing official names', () => {
    const results = searchIndex('pol', mockIndex);
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe('PL');
  });

  it('matches query ignoring diacritics', () => {
    const results = searchIndex('sniard', mockIndex);
    expect(results.length).toBe(1);
    expect(results[0]?.name_pl).toBe('Śniardwy');

    const resultsWithDiacritics = searchIndex('Śniar', mockIndex);
    expect(resultsWithDiacritics.length).toBe(1);
    expect(resultsWithDiacritics[0]?.id).toBe('l1');
  });

  it('finds items by second word / alias', () => {
    const results = searchIndex('everest', mockIndex);
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe('p1');
  });

  it('returns empty array when query is empty or whitespace', () => {
    expect(searchIndex('', mockIndex)).toEqual([]);
    expect(searchIndex('   ', mockIndex)).toEqual([]);
  });

  it('respects limit parameter', () => {
    const results = searchIndex('s', mockIndex, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
