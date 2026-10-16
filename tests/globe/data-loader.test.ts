import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadGeoData,
  getCachedGeoData,
  clearGeoDataCache,
  type GeoFeatureCollection,
} from '@/globe/data-loader';

describe('Globe DataLoader', () => {
  beforeEach(() => {
    clearGeoDataCache();
    vi.restoreAllMocks();
  });

  const mockData: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'pl',
        properties: {
          id: 'pl',
          kind: 'country',
          layerId: 'political-countries',
          name_pl: 'Polska',
          name_en: 'Poland',
        },
        geometry: {
          type: 'Point',
          coordinates: [20, 52],
        },
      },
    ],
  };

  it('fetches and caches GeoJSON dataset', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(getCachedGeoData('/data/test.json')).toBeUndefined();

    const result = await loadGeoData('/data/test.json');
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.properties.name_pl).toBe('Polska');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call should return from memory cache without invoking fetch
    const cachedResult = await loadGeoData('/data/test.json');
    expect(cachedResult).toBe(result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedGeoData('/data/test.json')).toBe(result);
  });

  it('deduplicates concurrent in-flight requests', async () => {
    let resolvePromise: (value: unknown) => void;
    const pending = new Promise(resolve => {
      resolvePromise = resolve;
    });

    const fetchMock = vi.fn().mockImplementation(() => pending);
    vi.stubGlobal('fetch', fetchMock);

    const call1 = loadGeoData('/data/parallel.json');
    const call2 = loadGeoData('/data/parallel.json');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolvePromise!({
      ok: true,
      json: async () => mockData,
    });

    const [res1, res2] = await Promise.all([call1, call2]);
    expect(res1).toBe(res2);
    expect(res1.features).toHaveLength(1);
  });

  it('throws on HTTP failure and does not cache the failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadGeoData('/data/missing.json')).rejects.toThrow(
      'Failed to load /data/missing.json: HTTP 404',
    );
    expect(getCachedGeoData('/data/missing.json')).toBeUndefined();
  });

  it('throws on invalid GeoJSON payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ not: 'a feature collection' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadGeoData('/data/invalid.json')).rejects.toThrow('Invalid GeoJSON');
  });

  it('clearGeoDataCache empties the memory cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });
    vi.stubGlobal('fetch', fetchMock);

    await loadGeoData('/data/test.json');
    expect(getCachedGeoData('/data/test.json')).toBeDefined();

    clearGeoDataCache();
    expect(getCachedGeoData('/data/test.json')).toBeUndefined();
  });
});
