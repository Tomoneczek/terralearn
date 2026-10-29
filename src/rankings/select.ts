import { normalizeText } from '@/geo/search';
import type { Locale } from '@/i18n/t';
import type { RankingCategory, RankingRow, RankingsData } from './types';

export type SortKey = 'order' | 'name' | 'value';
export type SortDir = 'asc' | 'desc';

export interface RowQuery {
  sortBy: SortKey;
  dir: SortDir;
  /** Free text matched (without diacritics) against names and countries in both languages. */
  filter?: string;
}

export function rowName(row: RankingRow, locale: Locale): string {
  return (locale === 'pl' ? row.name_pl : row.name_en) || row.name_en;
}

export function rowCountries(row: RankingRow, data: RankingsData, locale: Locale): string[] {
  return (row.countries ?? []).map(code => data.countries[code]?.[locale] ?? code);
}

function matchesFilter(row: RankingRow, data: RankingsData, needle: string): boolean {
  const haystack = [
    row.name_pl,
    row.name_en,
    ...(row.countries ?? []).flatMap(code => {
      const names = data.countries[code];
      return names ? [names.pl, names.en] : [];
    }),
  ];
  return haystack.some(text => normalizeText(text).includes(needle));
}

/** Rows of a category filtered and sorted for display; unknown values always sort last. */
export function selectRows(
  data: RankingsData,
  category: RankingCategory,
  query: RowQuery,
  locale: Locale,
): RankingRow[] {
  const needle = normalizeText(query.filter ?? '');
  const rows = needle
    ? data.categories[category].filter(row => matchesFilter(row, data, needle))
    : [...data.categories[category]];

  // The stored order is the display order (by value); it breaks every tie, and unranked rows
  // (no number) sort by where they stand in it
  const position = new Map(data.categories[category].map((row, index) => [row, index]));
  const place = (row: RankingRow): number => position.get(row) ?? 0;
  const sign = query.dir === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(locale);

  return rows.sort((a, b) => {
    if (query.sortBy === 'name') {
      return sign * collator.compare(rowName(a, locale), rowName(b, locale)) || place(a) - place(b);
    }
    if (query.sortBy === 'value') {
      if (a.value === null || b.value === null) {
        return a.value === b.value ? place(a) - place(b) : a.value === null ? 1 : -1;
      }
      return sign * (a.value - b.value) || place(a) - place(b);
    }
    return sign * (place(a) - place(b));
  });
}

/** Largest known value of a category, the 100% of the proportion bars. */
export function maxValue(data: RankingsData, category: RankingCategory): number {
  return data.categories[category].reduce((max, row) => Math.max(max, row.value ?? 0), 0);
}
