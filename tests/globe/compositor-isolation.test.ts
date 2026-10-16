import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { defaultLayersState } from '@/layers/registry';
import { LayerCompositor, type GlobeCompositorTarget, type PathItem } from '@/globe/compositor';
import { clearGeoDataCache, type GeoFeatureCollection } from '@/globe/data-loader';

describe('LayerCompositor - Animation & Layer Isolation Regression Tests', () => {
  let mockGlobe: GlobeCompositorTarget;
  let lastPathsPassed: PathItem[] = [];

  const mockPolygons: GeoFeatureCollection = {
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
    ],
  };

  const mockMountains: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'mountain-1',
        properties: {
          id: 'm1',
          kind: 'mountain',
          layerId: 'mountains',
          name_pl: 'Tatry',
          name_en: 'Tatra Mountains',
          rank: { order: 1 },
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [19, 49],
              [19, 50],
              [20, 50],
              [20, 49],
              [19, 49],
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
      {
        type: 'Feature',
        id: 'river-2',
        properties: {
          id: 'r2',
          kind: 'river',
          layerId: 'rivers',
          name_pl: 'Odra',
          name_en: 'Oder',
          rank: { order: 2 },
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [17, 50],
            [16, 52],
            [14, 53],
          ],
        },
      },
    ],
  };

  const mockCapitals: GeoFeatureCollection = {
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

  beforeEach(() => {
    clearGeoDataCache();
    vi.restoreAllMocks();
    lastPathsPassed = [];

    mockGlobe = {
      polygonsData: vi.fn().mockReturnThis(),
      pathsData: vi.fn((paths: PathItem[]) => {
        lastPathsPassed = paths;
        return mockGlobe;
      }),
      pointsData: vi.fn().mockReturnThis(),
      labelsData: vi.fn().mockReturnThis(),

      polygonsTransitionDuration: vi.fn().mockReturnThis(),
      labelsTransitionDuration: vi.fn().mockReturnThis(),
      pathsTransitionDuration: vi.fn().mockReturnThis(),
      pathTransitionDuration: vi.fn().mockReturnThis(),
      pointsTransitionDuration: vi.fn().mockReturnThis(),

      polygonCapColor: vi.fn().mockReturnThis(),
      polygonSideColor: vi.fn().mockReturnThis(),
      polygonStrokeColor: vi.fn().mockReturnThis(),
      polygonAltitude: vi.fn().mockReturnThis(),

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

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        let data: GeoFeatureCollection = mockPolygons;
        if (url.includes('rivers')) data = mockRivers;
        if (url.includes('regions')) data = mockMountains;
        if (url.includes('places')) data = mockCapitals;
        return Promise.resolve({
          ok: true,
          json: async () => data,
        });
      }),
    );
  });

  it('REGRESSION: toggling a polygon layer does NOT re-dispatch pathsData (preserves river animation)', async () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      layers: {
        ...defaultLayersState(),
        rivers: { enabled: true, topN: 5 },
        countriesTopN: { enabled: true, topN: 10 },
        mountains: { enabled: false },
        capitals: { enabled: false },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);

    // Initial compose
    const res1 = await compositor.compose();
    expect(res1.pathsUpdated).toBe(true);
    expect(res1.polygonsUpdated).toBe(true);
    expect(mockGlobe.pathsData).toHaveBeenCalledTimes(1);
    expect(mockGlobe.polygonsData).toHaveBeenCalledTimes(1);

    const firstRiverInstance = lastPathsPassed[0];
    expect(firstRiverInstance).toBeDefined();

    // Now, toggle on the mountains layer (polygons)
    store.set({
      ...store.get(),
      layers: {
        ...store.get().layers,
        mountains: { enabled: true },
      },
    });

    const res2 = await compositor.compose();

    // Polygons must be updated because a new polygon layer was toggled
    expect(res2.polygonsUpdated).toBe(true);
    expect(mockGlobe.polygonsData).toHaveBeenCalledTimes(2);

    // CRITICAL REGRESSION ASSERTION: pathsData MUST NOT be called again!
    // River animation is completely isolated and continues running without restart
    expect(res2.pathsUpdated).toBe(false);
    expect(mockGlobe.pathsData).toHaveBeenCalledTimes(1);

    compositor.destroy();
  });

  it('REGRESSION: modifying river topN preserves exact object reference of existing rivers', async () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      layers: {
        ...defaultLayersState(),
        rivers: { enabled: true, topN: 1 }, // Only Wisła
        countriesTopN: { enabled: false },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);
    await compositor.compose();

    expect(lastPathsPassed.length).toBe(1);
    const wislaInstance = lastPathsPassed[0];
    expect(wislaInstance?.feature.properties.id).toBe('r1');

    // Simulate ThreeGlobe attaching internal __threeObjPath to the path instance
    (wislaInstance as unknown as Record<string, unknown>).__threeObjPath = {
      id: '3d-mesh-for-wisla',
    };

    // Increase topN to 2 (now includes Odra)
    store.set({
      ...store.get(),
      layers: {
        ...store.get().layers,
        rivers: { enabled: true, topN: 2 },
      },
    });

    await compositor.compose();

    expect(mockGlobe.pathsData).toHaveBeenCalledTimes(2);
    expect(lastPathsPassed.length).toBe(2);

    // CRITICAL: Existing Wisła must be the exact same object reference and retain __threeObjPath
    expect(lastPathsPassed[0]).toBe(wislaInstance);
    expect((lastPathsPassed[0] as unknown as Record<string, unknown>).__threeObjPath).toEqual({
      id: '3d-mesh-for-wisla',
    });

    compositor.destroy();
  });

  it('REGRESSION: toggling point layers does NOT re-dispatch pathsData or polygonsData', async () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      layers: {
        ...defaultLayersState(),
        rivers: { enabled: true, topN: 5 },
        countriesTopN: { enabled: true, topN: 10 },
        capitals: { enabled: false },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);
    await compositor.compose();

    expect(mockGlobe.pathsData).toHaveBeenCalledTimes(1);
    expect(mockGlobe.polygonsData).toHaveBeenCalledTimes(1);
    expect(mockGlobe.pointsData).toHaveBeenCalledTimes(0);

    // Enable capitals (point layer)
    store.set({
      ...store.get(),
      layers: {
        ...store.get().layers,
        capitals: { enabled: true },
      },
    });

    const res = await compositor.compose();

    expect(res.pointsUpdated).toBe(true);
    expect(mockGlobe.pointsData).toHaveBeenCalledTimes(1);

    // Paths and Polygons MUST remain untouched
    expect(res.pathsUpdated).toBe(false);
    expect(mockGlobe.pathsData).toHaveBeenCalledTimes(1);

    expect(res.polygonsUpdated).toBe(false);
    expect(mockGlobe.polygonsData).toHaveBeenCalledTimes(1);

    compositor.destroy();
  });
});
