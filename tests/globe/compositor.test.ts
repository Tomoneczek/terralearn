import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import { defaultLayersState } from '@/layers/registry';
import type { LayerId } from '@/layers';
import type { AppState } from '@/state/types';
import { LayerCompositor, type GlobeCompositorTarget } from '@/globe/compositor';
import { clearGeoDataCache, type GeoFeature, type GeoFeatureCollection } from '@/globe/data-loader';

describe('LayerCompositor', () => {
  let mockGlobe: GlobeCompositorTarget;
  let polygonCapColorFn: (d: GeoFeature) => string;
  let polygonStrokeColorFn: (d: GeoFeature) => string;
  let polygonAltitudeFn: (d: GeoFeature) => number;

  beforeEach(() => {
    clearGeoDataCache();
    vi.restoreAllMocks();

    mockGlobe = {
      polygonsData: vi.fn().mockReturnThis(),
      pathsData: vi.fn().mockReturnThis(),
      pointsData: vi.fn().mockReturnThis(),
      labelsData: vi.fn().mockReturnThis(),

      polygonsTransitionDuration: vi.fn().mockReturnThis(),
      labelsTransitionDuration: vi.fn().mockReturnThis(),
      pathsTransitionDuration: vi.fn().mockReturnThis(),

      polygonCapColor: vi.fn((fn: (d: GeoFeature) => string) => {
        polygonCapColorFn = fn;
        return mockGlobe;
      }),
      polygonSideColor: vi.fn().mockReturnThis(),
      polygonStrokeColor: vi.fn((fn: (d: GeoFeature) => string) => {
        polygonStrokeColorFn = fn;
        return mockGlobe;
      }),
      polygonAltitude: vi.fn((fn: (d: GeoFeature) => number) => {
        polygonAltitudeFn = fn;
        return mockGlobe;
      }),

      pathPoints: vi.fn().mockReturnThis(),
      pathPointLat: vi.fn().mockReturnThis(),
      pathPointLng: vi.fn().mockReturnThis(),
      pathPointAlt: vi.fn().mockReturnThis(),
      pathColor: vi.fn().mockReturnThis(),
      pathStroke: vi.fn().mockReturnThis(),
      pathDashLength: vi.fn().mockReturnThis(),
      pathDashGap: vi.fn().mockReturnThis(),
      pathDashAnimateTime: vi.fn().mockReturnThis(),

      pointLat: vi.fn().mockReturnThis(),
      pointLng: vi.fn().mockReturnThis(),
      pointColor: vi.fn().mockReturnThis(),
      pointRadius: vi.fn().mockReturnThis(),
      pointAltitude: vi.fn().mockReturnThis(),

      labelLat: vi.fn().mockReturnThis(),
      labelLng: vi.fn().mockReturnThis(),
      labelText: vi.fn().mockReturnThis(),
      labelSize: vi.fn().mockReturnThis(),
      labelDotRadius: vi.fn().mockReturnThis(),
      labelAltitude: vi.fn().mockReturnThis(),
      labelColor: vi.fn().mockReturnThis(),
    };
  });

  const mockCountries: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'country-1',
        properties: {
          id: 'c1',
          kind: 'country',
          layerId: 'countriesTopN',
          name_pl: 'Kraj 1',
          name_en: 'Country 1',
          rank: { order: 1 },
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
              [0, 0],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        id: 'country-2',
        properties: {
          id: 'c2',
          kind: 'country',
          layerId: 'countriesTopN',
          name_pl: 'Kraj 2',
          name_en: 'Country 2',
          rank: { order: 2 },
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [2, 2],
              [2, 3],
              [3, 3],
              [3, 2],
              [2, 2],
            ],
          ],
        },
      },
    ],
  };

  const mockRivers: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'river-1',
        properties: {
          id: 'r1',
          kind: 'river',
          layerId: 'rivers',
          name_pl: 'Wisła',
          name_en: 'Vistula',
          rank: { order: 1 },
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [19, 50],
            [19, 52],
            [18, 54],
          ],
        },
      },
    ],
  };

  const mockPlaces: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'place-1',
        properties: {
          id: 'p1',
          kind: 'capital',
          layerId: 'capitals',
          name_pl: 'Warszawa',
          name_en: 'Warsaw',
          rank: { order: 1 },
        },
        geometry: { type: 'Point', coordinates: [21.0, 52.2] },
      },
    ],
  };

  it('aggregates active layers and dispatches data to globe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        let data: GeoFeatureCollection = mockCountries;
        if (url.includes('rivers')) data = mockRivers;
        if (url.includes('places')) data = mockPlaces;
        return Promise.resolve({
          ok: true,
          json: async () => data,
        });
      }),
    );

    const store = createStore<AppState>({
      ...createInitialState(),
      layers: {
        ...defaultLayersState(),
        countriesTopN: { enabled: true, topN: 10 },
        rivers: { enabled: true, topN: 5 },
        capitals: { enabled: true },
        borders: { enabled: false },
        lakes: { enabled: false },
        mountains: { enabled: false },
        deserts: { enabled: false },
        peaks: { enabled: false },
        megacities: { enabled: false },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);
    const summary = await compositor.compose();

    expect(summary.polygonsCount).toBe(2);
    expect(summary.pathsCount).toBe(1);
    expect(summary.pointsCount).toBe(1);

    expect(mockGlobe.polygonsData).toHaveBeenCalled();
    expect(mockGlobe.pathsData).toHaveBeenCalled();
    expect(mockGlobe.pointsData).toHaveBeenCalled();

    compositor.destroy();
  });

  it('filters polygon features by topN slider value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => mockCountries,
        }),
      ),
    );

    const store = createStore<AppState>({
      ...createInitialState(),
      layers: {
        ...defaultLayersState(),
        countriesTopN: { enabled: true, topN: 1 },
        borders: { enabled: false },
        rivers: { enabled: false },
        lakes: { enabled: false },
        mountains: { enabled: false },
        deserts: { enabled: false },
        peaks: { enabled: false },
        capitals: { enabled: false },
        megacities: { enabled: false },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);
    const summary = await compositor.compose();

    expect(summary.polygonsCount).toBe(1);
    compositor.destroy();
  });

  it('style accessors return highlighted colors on selection and hover', () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      selection: { id: 'c1', layerId: 'countriesTopN' as LayerId, kind: 'country' },
      hovered: { id: 'c2', layerId: 'countriesTopN' as LayerId, kind: 'country' },
    });

    const compositor = new LayerCompositor(mockGlobe, store);

    const featSelected: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'c1',
        layerId: 'countriesTopN',
        kind: 'country',
        name_pl: 'Kraj 1',
        name_en: 'Country 1',
      },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    const featHovered: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'c2',
        layerId: 'countriesTopN',
        kind: 'country',
        name_pl: 'Kraj 2',
        name_en: 'Country 2',
      },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    const featNormal: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'c3',
        layerId: 'countriesTopN',
        kind: 'country',
        name_pl: 'Kraj 3',
        name_en: 'Country 3',
      },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };

    expect(polygonCapColorFn(featSelected)).toContain('hsla(180, 100%, 70%');
    expect(polygonCapColorFn(featHovered)).toContain('hsla(180, 100%, 80%');
    expect(polygonCapColorFn(featNormal)).toBeDefined();

    expect(polygonStrokeColorFn(featSelected)).toBe('hsl(50, 100%, 65%)');
    expect(polygonStrokeColorFn(featHovered)).toBe('hsl(180, 100%, 80%)');

    expect(polygonAltitudeFn(featSelected)).toBeGreaterThan(polygonAltitudeFn(featNormal));
    expect(polygonAltitudeFn(featHovered)).toBeGreaterThan(polygonAltitudeFn(featNormal));

    compositor.destroy();
  });

  it('hides labels when hiddenLabels is true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => mockCountries,
        }),
      ),
    );

    const store = createStore<AppState>({
      ...createInitialState(),
      hiddenLabels: true,
      layers: {
        ...defaultLayersState(),
        countriesTopN: { enabled: true, topN: 10 },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);
    const summary = await compositor.compose();

    expect(summary.labelsCount).toBe(0);
    compositor.destroy();
  });

  it('handles MultiLineString paths in rivers layer', async () => {
    const mockMultiRivers: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'river-multi',
          properties: {
            id: 'rm1',
            kind: 'river',
            layerId: 'rivers',
            name_pl: 'Amazonka',
            name_en: 'Amazon',
            rank: { order: 1 },
          },
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [-70, -3],
                [-60, -2],
              ],
              [
                [-60, -2],
                [-50, 0],
              ],
            ],
          },
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => mockMultiRivers,
        }),
      ),
    );

    const store = createStore<AppState>({
      ...createInitialState(),
      layers: {
        ...defaultLayersState(),
        rivers: { enabled: true, topN: 5 },
        countriesTopN: { enabled: false },
        borders: { enabled: false },
        lakes: { enabled: false },
        mountains: { enabled: false },
        deserts: { enabled: false },
        peaks: { enabled: false },
        capitals: { enabled: false },
        megacities: { enabled: false },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);
    const summary = await compositor.compose();

    expect(summary.pathsCount).toBe(2);
    compositor.destroy();
  });

  it('configures transition durations to 0 to prevent looping fade animations', () => {
    const store = createStore<AppState>(createInitialState());
    const compositor = new LayerCompositor(mockGlobe, store);

    expect(mockGlobe.polygonsTransitionDuration).toHaveBeenCalledWith(0);
    expect(mockGlobe.labelsTransitionDuration).toHaveBeenCalledWith(0);
    expect(mockGlobe.pathsTransitionDuration).toHaveBeenCalledWith(0);

    compositor.destroy();
  });

  it('updates dynamic styles without re-dispatching polygonsData on hover change', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => mockCountries,
        }),
      ),
    );

    const store = createStore<AppState>({
      ...createInitialState(),
      layers: {
        ...defaultLayersState(),
        countriesTopN: { enabled: true, topN: 10 },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);
    await compositor.compose();

    expect(mockGlobe.polygonsData).toHaveBeenCalledTimes(1);

    // Simulate mouse hover event
    store.set({
      ...store.get(),
      hovered: { id: 'c1', layerId: 'countriesTopN' as LayerId, kind: 'country' },
    });

    // Wait a brief moment for any scheduled timers
    await new Promise(r => setTimeout(r, 80));

    // polygonsData should NOT be re-called on hover - dynamic styles refresh instead!
    expect(mockGlobe.polygonsData).toHaveBeenCalledTimes(1);
    expect(mockGlobe.polygonCapColor).toHaveBeenCalledTimes(2);

    compositor.destroy();
  });
});
