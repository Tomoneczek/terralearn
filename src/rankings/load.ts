import { resolveAssetUrl } from '@/utils/assets';
import { RankingsDataSchema, type RankingsData } from './types';

let cached: Promise<RankingsData> | null = null;

/** Rankings are fetched on first use only and kept for the session; a failed load can be retried. */
export function loadRankings(): Promise<RankingsData> {
  if (!cached) {
    cached = fetch(resolveAssetUrl('/data/rankings.json'))
      .then(res => {
        if (!res.ok) throw new Error(`rankings.json: HTTP ${res.status}`);
        return res.json();
      })
      .then(json => RankingsDataSchema.parse(json))
      .catch(err => {
        cached = null;
        throw err;
      });
  }
  return cached;
}

/** Test hook: forgets the cached data. */
export function resetRankingsCache(): void {
  cached = null;
}
