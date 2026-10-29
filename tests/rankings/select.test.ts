import { describe, it, expect } from 'vitest';
import { selectRows, maxValue, rowName, rowCountries } from '@/rankings/select';
import { RANKING_CATEGORIES, type RankingRow, type RankingsData } from '@/rankings/types';

const row = (over: Partial<RankingRow> & Pick<RankingRow, 'id' | 'order'>): RankingRow => ({
  value: 100,
  name_pl: over.id,
  name_en: over.id,
  lat: 0,
  lng: 0,
  extentKm: 0,
  ...over,
});

function data(rivers: RankingRow[]): RankingsData {
  const categories = Object.fromEntries(
    RANKING_CATEGORIES.map(c => [c, []]),
  ) as never as RankingsData['categories'];
  return {
    countries: { PL: { pl: 'Polska', en: 'Poland' }, EG: { pl: 'Egipt', en: 'Egypt' } },
    categories: { ...categories, rivers },
  };
}

const RIVERS = [
  row({ id: 'a', order: 1, value: 700, name_pl: 'Łaba', name_en: 'Elbe', countries: ['PL'] }),
  row({ id: 'b', order: 2, value: null, name_pl: 'Śniardwy', name_en: 'Sniardwy' }),
  row({ id: 'c', order: 3, value: 900, name_pl: 'Nil', name_en: 'Nile', countries: ['EG'] }),
  row({ id: 'd', order: 4, value: 100, name_pl: 'Zalew', name_en: 'Zalew' }),
];
const ids = (rows: RankingRow[]) => rows.map(r => r.id);

describe('selectRows', () => {
  const d = data(RIVERS);

  it('sorts by rank in both directions', () => {
    expect(ids(selectRows(d, 'rivers', { sortBy: 'order', dir: 'asc' }, 'en'))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(ids(selectRows(d, 'rivers', { sortBy: 'order', dir: 'desc' }, 'en'))).toEqual([
      'd',
      'c',
      'b',
      'a',
    ]);
  });

  it('sorts by value with unknown values always last', () => {
    expect(ids(selectRows(d, 'rivers', { sortBy: 'value', dir: 'desc' }, 'en'))).toEqual([
      'c',
      'a',
      'd',
      'b',
    ]);
    expect(ids(selectRows(d, 'rivers', { sortBy: 'value', dir: 'asc' }, 'en'))).toEqual([
      'd',
      'a',
      'c',
      'b',
    ]);
  });

  it('sorts names with the collation of the language (Polish Ł before M, Ś before T)', () => {
    const pl = selectRows(d, 'rivers', { sortBy: 'name', dir: 'asc' }, 'pl');
    expect(pl.map(r => r.name_pl)).toEqual(['Łaba', 'Nil', 'Śniardwy', 'Zalew']);
  });

  it('filters by name or country without diacritics, in both languages', () => {
    expect(
      ids(selectRows(d, 'rivers', { sortBy: 'order', dir: 'asc', filter: 'laba' }, 'en')),
    ).toEqual(['a']);
    expect(
      ids(selectRows(d, 'rivers', { sortBy: 'order', dir: 'asc', filter: 'ŚNIARDWY' }, 'pl')),
    ).toEqual(['b']);
    expect(
      ids(selectRows(d, 'rivers', { sortBy: 'order', dir: 'asc', filter: 'egipt' }, 'en')),
    ).toEqual(['c']);
    expect(
      ids(selectRows(d, 'rivers', { sortBy: 'order', dir: 'asc', filter: 'poland' }, 'pl')),
    ).toEqual(['a']);
    expect(selectRows(d, 'rivers', { sortBy: 'order', dir: 'asc', filter: 'zzz' }, 'en')).toEqual(
      [],
    );
  });

  it('does not mutate the source rows', () => {
    selectRows(d, 'rivers', { sortBy: 'order', dir: 'desc' }, 'en');
    expect(ids(d.categories.rivers)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('row helpers', () => {
  const d = data(RIVERS);
  it('names a row in the UI language and lists its countries', () => {
    expect(rowName(RIVERS[0]!, 'pl')).toBe('Łaba');
    expect(rowName(RIVERS[0]!, 'en')).toBe('Elbe');
    expect(rowCountries(RIVERS[0]!, d, 'pl')).toEqual(['Polska']);
    expect(rowCountries(RIVERS[1]!, d, 'en')).toEqual([]);
  });

  it('finds the largest known value of a category', () => {
    expect(maxValue(d, 'rivers')).toBe(900);
    expect(maxValue(d, 'lakes')).toBe(0);
  });
});

describe('selectRows with unranked rows', () => {
  const d = data([
    row({ id: 'big', order: 1, value: 900 }),
    row({ id: 'part', order: null, value: 500 }),
    row({ id: 'small', order: 2, value: 100 }),
  ]);

  it('keeps an unranked row where its value puts it, in both directions', () => {
    expect(ids(selectRows(d, 'rivers', { sortBy: 'order', dir: 'asc' }, 'en'))).toEqual([
      'big',
      'part',
      'small',
    ]);
    expect(ids(selectRows(d, 'rivers', { sortBy: 'order', dir: 'desc' }, 'en'))).toEqual([
      'small',
      'part',
      'big',
    ]);
  });

  it('sorts by value and name without needing a rank number', () => {
    expect(ids(selectRows(d, 'rivers', { sortBy: 'value', dir: 'asc' }, 'en'))).toEqual([
      'small',
      'part',
      'big',
    ]);
    expect(ids(selectRows(d, 'rivers', { sortBy: 'name', dir: 'asc' }, 'en'))).toEqual([
      'big',
      'part',
      'small',
    ]);
  });
});
