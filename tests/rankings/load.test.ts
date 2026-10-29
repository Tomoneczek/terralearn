import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadRankings, resetRankingsCache } from '@/rankings/load';
import { RANKING_CATEGORIES } from '@/rankings/types';

const EMPTY = {
  countries: {},
  categories: Object.fromEntries(RANKING_CATEGORIES.map(c => [c, []])),
};

beforeEach(() => resetRankingsCache());
afterEach(() => vi.unstubAllGlobals());

describe('loadRankings', () => {
  it('fetches once and reuses the data', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => EMPTY }));
    vi.stubGlobal('fetch', fetchMock);
    await loadRankings();
    await loadRankings();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects data that does not match the schema and allows a retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ nope: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => EMPTY });
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadRankings()).rejects.toThrow();
    await expect(loadRankings()).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects on an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    await expect(loadRankings()).rejects.toThrow('404');
  });
});
