import type { LayerId } from '@/layers/types';

export interface SearchIndexItem {
  id: string;
  name_pl: string;
  name_en: string;
  normalized_name: string;
  kind: string;
  layerId: LayerId;
  lat: number;
  lng: number;
  rank?: number;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/\u0141/g, 'l')
    .trim();
}

export function searchIndex(
  query: string,
  items: readonly SearchIndexItem[],
  limit = 8,
): SearchIndexItem[] {
  const normQuery = normalizeText(query);
  if (!normQuery) return [];

  interface ScoredItem {
    item: SearchIndexItem;
    score: number;
  }

  const matches: ScoredItem[] = [];

  for (const item of items) {
    const normPl = normalizeText(item.name_pl);
    const normEn = normalizeText(item.name_en);

    if (normPl.startsWith(normQuery) || normEn.startsWith(normQuery)) {
      matches.push({ item, score: 300 - (item.rank ?? 999) });
    } else {
      const words = item.normalized_name.split(/\s+/);
      const wordPrefixMatch = words.some(w => w.startsWith(normQuery));
      if (wordPrefixMatch) {
        matches.push({ item, score: 200 - (item.rank ?? 999) });
      } else if (item.normalized_name.includes(normQuery)) {
        matches.push({ item, score: 100 - (item.rank ?? 999) });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit).map(m => m.item);
}
