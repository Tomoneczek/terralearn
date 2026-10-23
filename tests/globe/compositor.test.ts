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
  let polygonSideColorFn: (d: GeoFeature) => string;
  let polygonCapMaterialFn: (d: GeoFeature) => { visible: boolean } | undefined;

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
      pathTransitionDuration: vi.fn().mockReturnThis(),
      pointsTransitionDuration: vi.fn().mockReturnThis(),

      polygonCapColor: vi.fn((fn: (d: GeoFeature) => string) => {
        polygonCapColorFn = fn;
        return mockGlobe;
      }),
      polygonSideColor: vi.fn((fn: (d: GeoFeature) => string) => {
        polygonSideColorFn = fn;
        return mockGlobe;
      }),
      polygonCapMaterial: vi.fn((fn: (d: GeoFeature) => { visible: boolean } | undefined) => {
        polygonCapMaterialFn = fn;
        return mockGlobe;
      }),
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

  it('style accessors ignore selection and hover (highlight is drawn by the overlay)', () => {
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

    // Regression: hover/selection used to restyle the main polygon layer (color, stroke, altitude).
    const normalCap = polygonCapColorFn(featNormal);
    expect(polygonCapColorFn(featSelected)).toBe(normalCap);
    expect(polygonCapColorFn(featHovered)).toBe(normalCap);

    const normalStroke = polygonStrokeColorFn(featNormal);
    expect(polygonStrokeColorFn(featSelected)).toBe(normalStroke);
    expect(polygonStrokeColorFn(featHovered)).toBe(normalStroke);

    const normalAltitude = polygonAltitudeFn(featNormal);
    expect(polygonAltitudeFn(featSelected)).toBe(normalAltitude);
    expect(polygonAltitudeFn(featHovered)).toBe(normalAltitude);

    compositor.destroy();
  });

  // Regression: fully transparent polygon parts (the borders layer) used to cost three draw calls
  // per polygon part. Transparent sides/strokes are now skipped (empty color) and the transparent
  // cap keeps a non-rendered material so it stays pickable.
  describe('cheap transparent polygon parts', () => {
    const feature = (layerId: string, kind = 'country'): GeoFeature => ({
      type: 'Feature',
      properties: { id: `${layerId}-1`, kind, layerId, name_pl: 'x', name_en: 'x' },
      geometry: { type: 'Polygon', coordinates: [] },
    });

    it('hides side and stroke and uses an invisible cap material for borders', () => {
      const store = createStore<AppState>(createInitialState());
      const compositor = new LayerCompositor(mockGlobe, store);
      const border = feature('borders');

      expect(polygonSideColorFn(border)).toBe('');
      expect(polygonCapMaterialFn(border)?.visible).toBe(false);
      // The stroke of borders is a real (semi-transparent) color and must stay
      expect(polygonStrokeColorFn(border)).not.toBe('');
      expect(polygonStrokeColorFn(border)).not.toBe('transparent');

      compositor.destroy();
    });

    it('keeps normal cap/side colors for colored layers', () => {
      const store = createStore<AppState>(createInitialState());
      const compositor = new LayerCompositor(mockGlobe, store);
      const lake = feature('lakes', 'lake');

      expect(polygonCapMaterialFn(lake)).toBeUndefined();
      expect(polygonSideColorFn(lake)).not.toBe('');
      expect(polygonCapColorFn(lake)).not.toBe('transparent');

      compositor.destroy();
    });
  });

  describe('capitals sink', () => {
    const capitalFeature = (id: string, lng: number, lat: number): GeoFeature => ({
      type: 'Feature',
      id,
      properties: {
        id,
        kind: 'capital',
        layerId: 'political-capitals',
        name_pl: id,
        name_en: id,
        rank: { population: 1_000_000 },
      },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    });
    const places: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        capitalFeature('cap-a', 21, 52),
        capitalFeature('cap-b', 13, 52),
        {
          ...capitalFeature('mega-x', 139, 35),
          properties: {
            id: 'mega-x',
            kind: 'megacity',
            layerId: 'political-capitals',
            name_pl: 'mega-x',
            name_en: 'mega-x',
            rank: { population: 20_000_000 },
          },
        },
      ],
    };

    const setup = async (withSink = true) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: async () => places })),
      );
      const layers = defaultLayersState();
      for (const id of Object.keys(layers) as LayerId[]) {
        layers[id] = { ...layers[id], enabled: id === 'capitals' || id === 'megacities' };
      }
      const store = createStore<AppState>({ ...createInitialState(), layers });
      const compositor = new LayerCompositor(mockGlobe, store);
      const sink = { setFeatures: vi.fn(), setColors: vi.fn() };
      if (withSink) compositor.capitalsSink = sink;
      await compositor.compose();
      return { store, compositor, sink };
    };

    // Regression: capitals used to be one globe.gl mesh each (hundreds of draw calls).
    it('sends capitals to the sink instead of globe.gl points', async () => {
      const { compositor, sink } = await setup();

      expect(sink.setFeatures).toHaveBeenCalledTimes(1);
      const sent = sink.setFeatures.mock.calls[0]![0] as GeoFeature[];
      expect(sent.map(f => f.properties.id)).toEqual(['cap-a', 'cap-b']);
      expect(sent.every(f => f.properties.layerId === 'capitals')).toBe(true);
      expect(mockGlobe.pointsData).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'cap-a' })]),
      );

      compositor.destroy();
    });

    it('falls back to regular points when no sink is attached', async () => {
      const { compositor } = await setup(false);
      expect(mockGlobe.pointsData).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'cap-a' })]),
      );
      compositor.destroy();
    });

    it('does not resend unchanged capitals and empties the sink when the layer is disabled', async () => {
      const { store, compositor, sink } = await setup();
      await compositor.compose();
      expect(sink.setFeatures).toHaveBeenCalledTimes(1);

      store.set({
        layers: { ...store.get().layers, capitals: { enabled: false } },
      });
      await compositor.compose();
      expect(sink.setFeatures).toHaveBeenCalledTimes(2);
      expect(sink.setFeatures.mock.calls[1]![0]).toEqual([]);

      compositor.destroy();
    });

    // Countries and capitals are named by the hover tooltip and the info card, so the globe
    // carries no permanent text for them (it collided with markers and selection halos).
    it('puts no on-globe labels on capitals, but keeps them for other kinds', async () => {
      const { compositor } = await setup();
      const labelIds = (): string[] => {
        const calls = vi.mocked(mockGlobe.labelsData).mock.calls;
        const last = (calls[calls.length - 1]?.[0] ?? []) as GeoFeature[];
        return last.map(f => f.properties.id);
      };

      expect(labelIds()).not.toContain('cap-a');
      expect(labelIds()).not.toContain('cap-b');
      expect(labelIds()).toContain('mega-x'); // megacities are still labelled

      compositor.destroy();
    });

    it('does not label a hovered or selected capital in the normal mode', async () => {
      const { store, compositor } = await setup();
      store.set({
        hovered: { id: 'cap-a', layerId: 'capitals' as LayerId, kind: 'capital' },
        selection: { id: 'cap-b', layerId: 'capitals' as LayerId, kind: 'capital' },
      });
      const calls = vi.mocked(mockGlobe.labelsData).mock.calls;
      const all = calls.flatMap(c => (c[0] as GeoFeature[]).map(f => f.properties.id));
      expect(all).not.toContain('cap-a');
      expect(all).not.toContain('cap-b');

      compositor.destroy();
    });

    it('lets knowledge-map colors reach the sink', async () => {
      const { store, compositor, sink } = await setup();
      expect(sink.setColors).toHaveBeenLastCalledWith(null);

      store.set({ knowledgeMap: true });
      expect(sink.setColors).toHaveBeenLastCalledWith(expect.any(Object));

      compositor.destroy();
    });
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

  it('configures safe entry transition durations for newly added items', () => {
    const store = createStore<AppState>(createInitialState());
    const compositor = new LayerCompositor(mockGlobe, store);

    expect(mockGlobe.polygonsTransitionDuration).toHaveBeenCalledWith(400);
    expect(mockGlobe.labelsTransitionDuration).toHaveBeenCalledWith(0);
    expect(mockGlobe.pathsTransitionDuration).toHaveBeenCalledWith(0);
    expect(mockGlobe.pathTransitionDuration).toHaveBeenCalledWith(400);
    expect(mockGlobe.pointsTransitionDuration).toHaveBeenCalledWith(400);

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

    // polygonsData should NOT be re-called on hover, and (regression) the main layers must not
    // be restyled either: only the accessors set at construction are applied.
    expect(mockGlobe.polygonsData).toHaveBeenCalledTimes(1);
    expect(mockGlobe.polygonCapColor).toHaveBeenCalledTimes(1);
    expect(mockGlobe.polygonSideColor).toHaveBeenCalledTimes(1);
    expect(mockGlobe.polygonStrokeColor).toHaveBeenCalledTimes(1);
    expect(mockGlobe.polygonAltitude).toHaveBeenCalledTimes(1);
    expect(mockGlobe.pathColor).toHaveBeenCalledTimes(1);
    expect(mockGlobe.pointColor).toHaveBeenCalledTimes(1);

    compositor.destroy();
  });

  describe('hover/selection label handling and feature lookup', () => {
    it('re-applies label colors only when a visible label is hovered or selected', async () => {
      const lakes: GeoFeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'lake-1',
            properties: {
              id: 'lake-1',
              kind: 'lake',
              layerId: 'lakes',
              name_pl: 'Jezioro',
              name_en: 'Lake',
              labelLat: 1,
              labelLng: 1,
              rank: { order: 1 },
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [0, 2],
                  [2, 2],
                  [2, 0],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: async () => lakes })),
      );
      const layers = defaultLayersState();
      for (const id of Object.keys(layers) as LayerId[]) {
        layers[id] = { ...layers[id], enabled: id === 'lakes' };
      }
      const store = createStore<AppState>({ ...createInitialState(), layers });
      const compositor = new LayerCompositor(mockGlobe, store);
      await compositor.compose();
      const before = vi.mocked(mockGlobe.labelColor).mock.calls.length;

      // Hover a feature that has no visible label (countries/capitals carry none): no swap
      store.set({
        ...store.get(),
        hovered: { id: 'c1', layerId: 'countriesTopN' as LayerId, kind: 'country' },
      });
      expect(vi.mocked(mockGlobe.labelColor).mock.calls.length).toBe(before);

      // Hover a feature with a visible label: colors refreshed
      store.set({
        ...store.get(),
        hovered: { id: 'lake-1', layerId: 'lakes' as LayerId, kind: 'lake' },
      });
      expect(vi.mocked(mockGlobe.labelColor).mock.calls.length).toBe(before + 1);

      compositor.destroy();
    });

    it('resolves features of enabled layers by id and notifies after compose', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: async () => mockCountries })),
      );
      const store = createStore<AppState>({
        ...createInitialState(),
        layers: { ...defaultLayersState(), countriesTopN: { enabled: true, topN: 10 } },
      });
      const compositor = new LayerCompositor(mockGlobe, store);
      const onComposed = vi.fn();
      compositor.onComposed = onComposed;

      expect(compositor.getFeatureById('c1')).toBeUndefined();
      await compositor.compose();

      expect(onComposed).toHaveBeenCalledTimes(1);
      expect(compositor.getFeatureById('c1')?.properties.layerId).toBe('countriesTopN');
      expect(compositor.getFeatureById('missing')).toBeUndefined();

      compositor.destroy();
      expect(compositor.getFeatureById('c1')).toBeUndefined();
    });
  });

  it('handles MultiLineString and LineString path caching across multiple compose calls', async () => {
    const multiPathFeature: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'river-multi',
          properties: {
            id: 'r-multi',
            kind: 'river',
            layerId: 'rivers',
            name_pl: 'Rzeka M',
            name_en: 'River M',
            rank: { order: 1 },
          },
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [10, 20],
                [11, 21],
              ],
              [
                [12, 22],
                [13, 23],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          id: 'river-single',
          properties: {
            id: 'r-single',
            kind: 'river',
            layerId: 'rivers',
            name_pl: 'Rzeka S',
            name_en: 'River S',
            rank: { order: 2 },
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [30, 40],
              [31, 41],
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
          json: async () => multiPathFeature,
        }),
      ),
    );

    const store = createStore<AppState>({
      ...createInitialState(),
      layers: {
        ...defaultLayersState(),
        rivers: { enabled: true, topN: 10 },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);

    // First compose - populates cache
    const firstRes = await compositor.compose();
    expect(firstRes.pathsCount).toBe(3);

    // Second compose - hits the cache update branches (else branches in pathItemCache)
    const secondRes = await compositor.compose();
    expect(secondRes.pathsCount).toBe(3);

    compositor.destroy();
  });

  it('filters features by kind for layers sharing datasets', async () => {
    const mixedFeatures: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: '1',
          properties: { id: '1', kind: 'other', layerId: 'mountains', name_pl: 'O', name_en: 'O' },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
        {
          type: 'Feature',
          id: '2',
          properties: {
            id: '2',
            kind: 'mountain',
            layerId: 'mountains',
            name_pl: 'M',
            name_en: 'M',
          },
          geometry: { type: 'Point', coordinates: [1, 1] },
        },
        {
          type: 'Feature',
          id: '3',
          properties: { id: '3', kind: 'desert', layerId: 'deserts', name_pl: 'D', name_en: 'D' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          id: '4',
          properties: { id: '4', kind: 'capital', layerId: 'capitals', name_pl: 'C', name_en: 'C' },
          geometry: { type: 'Point', coordinates: [2, 2] },
        },
        {
          type: 'Feature',
          id: '5',
          properties: {
            id: '5',
            kind: 'megacity',
            layerId: 'megacities',
            name_pl: 'MC',
            name_en: 'MC',
          },
          geometry: { type: 'Point', coordinates: [3, 3] },
        },
        {
          type: 'Feature',
          id: '6',
          properties: { id: '6', kind: 'peak', layerId: 'peaks', name_pl: 'P', name_en: 'P' },
          geometry: { type: 'Point', coordinates: [4, 4] },
        },
        {
          type: 'Feature',
          id: '7',
          properties: {
            id: '7',
            kind: 'landform',
            layerId: 'landforms',
            name_pl: 'L',
            name_en: 'L',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          id: '8',
          properties: { id: '8', kind: 'marine', layerId: 'marine', name_pl: 'MA', name_en: 'MA' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          id: '9',
          properties: {
            id: '9',
            kind: 'country',
            layerId: 'countriesTopN',
            name_pl: 'CO',
            name_en: 'CO',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
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
          json: async () => mixedFeatures,
        }),
      ),
    );

    const store = createStore<AppState>({
      ...createInitialState(),
      layers: {
        ...defaultLayersState(),
        mountains: { enabled: true },
        deserts: { enabled: true },
        capitals: { enabled: true },
        megacities: { enabled: true },
        peaks: { enabled: true },
        landforms: { enabled: true },
        marine: { enabled: true },
        borders: { enabled: true },
        countriesTopN: { enabled: true },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);
    const res = await compositor.compose();
    expect(res.pointsCount + res.polygonsCount).toBeGreaterThan(0);

    compositor.destroy();
  });

  it('evaluates accessors for rings, points, labels, and knowledgeMap', () => {
    let capturedRingAlt: ((d: Record<string, unknown>) => number) | undefined;
    let capturedRingColor: ((d: Record<string, unknown>) => string) | undefined;
    let capturedRingRadius: ((d: Record<string, unknown>) => number) | undefined;
    let capturedRingSpeed: ((d: Record<string, unknown>) => number) | undefined;
    let capturedRingPeriod: ((d: Record<string, unknown>) => number) | undefined;
    let capturedPointLat: ((d: GeoFeature) => number) | undefined;
    let capturedPointLng: ((d: GeoFeature) => number) | undefined;
    let capturedLabelLat: ((d: GeoFeature) => number) | undefined;
    let capturedLabelLng: ((d: GeoFeature) => number) | undefined;
    let capturedLabelColor: ((d: GeoFeature) => string) | undefined;
    let capturedPointColor: ((d: GeoFeature) => string) | undefined;
    let capturedPathColor:
      ((d: { id: string; feature: GeoFeature; points: [number, number][] }) => string) | undefined;

    mockGlobe.ringAltitude = vi.fn(fn => {
      capturedRingAlt = fn;
      return mockGlobe;
    });
    mockGlobe.ringColor = vi.fn(fn => {
      capturedRingColor = fn;
      return mockGlobe;
    });
    mockGlobe.ringMaxRadius = vi.fn(fn => {
      capturedRingRadius = fn;
      return mockGlobe;
    });
    mockGlobe.ringPropagationSpeed = vi.fn(fn => {
      capturedRingSpeed = fn;
      return mockGlobe;
    });
    mockGlobe.ringRepeatPeriod = vi.fn(fn => {
      capturedRingPeriod = fn;
      return mockGlobe;
    });
    mockGlobe.pointLat = vi.fn(fn => {
      capturedPointLat = fn;
      return mockGlobe;
    });
    mockGlobe.pointLng = vi.fn(fn => {
      capturedPointLng = fn;
      return mockGlobe;
    });
    mockGlobe.labelLat = vi.fn(fn => {
      capturedLabelLat = fn;
      return mockGlobe;
    });
    mockGlobe.labelLng = vi.fn(fn => {
      capturedLabelLng = fn;
      return mockGlobe;
    });
    mockGlobe.labelColor = vi.fn(fn => {
      capturedLabelColor = fn;
      return mockGlobe;
    });
    mockGlobe.pointColor = vi.fn(fn => {
      capturedPointColor = fn;
      return mockGlobe;
    });
    mockGlobe.pathColor = vi.fn(fn => {
      capturedPathColor = fn;
      return mockGlobe;
    });

    const store = createStore<AppState>({
      ...createInitialState(),
      knowledgeMap: true,
      selection: { id: 'selected-1', layerId: 'countriesTopN' as LayerId, kind: 'country' },
      hovered: { id: 'hovered-1', layerId: 'countriesTopN' as LayerId, kind: 'country' },
    });

    const compositor = new LayerCompositor(mockGlobe, store);

    // Ring accessors with default and custom values
    expect(capturedRingAlt?.({ altitude: 0.05 })).toBe(0.05);
    expect(capturedRingAlt?.({})).toBe(0.015);
    expect(capturedRingColor?.({ color: '#ff0000' })).toBe('#ff0000');
    expect(capturedRingColor?.({})).toBe('rgba(255, 215, 60, 0.8)');
    expect(capturedRingRadius?.({ maxRadius: 5 })).toBe(5);
    expect(capturedRingRadius?.({})).toBe(3.5);
    expect(capturedRingSpeed?.({ propagationSpeed: 4 })).toBe(4);
    expect(capturedRingSpeed?.({})).toBe(2.5);
    expect(capturedRingPeriod?.({ repeatPeriod: 500 })).toBe(500);
    expect(capturedRingPeriod?.({})).toBe(1000);

    // Point coordinate accessors
    const ptWithCoords: GeoFeature = {
      type: 'Feature',
      id: 'p1',
      properties: { id: 'p1', kind: 'capital', layerId: 'capitals', name_pl: 'P', name_en: 'P' },
      geometry: { type: 'Point', coordinates: [10, 20] },
    };
    const ptEmptyCoords: GeoFeature = {
      type: 'Feature',
      id: 'p2',
      properties: { id: 'p2', kind: 'capital', layerId: 'capitals', name_pl: 'P', name_en: 'P' },
      geometry: { type: 'Point', coordinates: [] },
    };
    expect(capturedPointLat?.(ptWithCoords)).toBe(20);
    expect(capturedPointLat?.(ptEmptyCoords)).toBe(0);
    expect(capturedPointLng?.(ptWithCoords)).toBe(10);
    expect(capturedPointLng?.(ptEmptyCoords)).toBe(0);

    // Label coordinate accessors (explicit labelLat/Lng vs coordinates vs fallback)
    const labelExplicit: GeoFeature = {
      type: 'Feature',
      id: 'l1',
      properties: {
        id: 'l1',
        kind: 'capital',
        layerId: 'capitals',
        name_pl: 'L',
        name_en: 'L',
        labelLat: 45,
        labelLng: 30,
      },
      geometry: { type: 'Point', coordinates: [10, 20] },
    };
    expect(capturedLabelLat?.(labelExplicit)).toBe(45);
    expect(capturedLabelLat?.(ptWithCoords)).toBe(20);
    expect(capturedLabelLat?.(ptEmptyCoords)).toBe(0);
    expect(capturedLabelLng?.(labelExplicit)).toBe(30);
    expect(capturedLabelLng?.(ptWithCoords)).toBe(10);
    expect(capturedLabelLng?.(ptEmptyCoords)).toBe(0);

    // Label color accessor
    const selFeat: GeoFeature = {
      type: 'Feature',
      id: 'selected-1',
      properties: {
        id: 'selected-1',
        kind: 'country',
        layerId: 'countriesTopN',
        name_pl: 'S',
        name_en: 'S',
      },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    const hovFeat: GeoFeature = {
      type: 'Feature',
      id: 'hovered-1',
      properties: {
        id: 'hovered-1',
        kind: 'country',
        layerId: 'countriesTopN',
        name_pl: 'H',
        name_en: 'H',
      },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    expect(capturedLabelColor?.(selFeat)).toBe('rgba(255, 220, 100, 1)');
    expect(capturedLabelColor?.(hovFeat)).toBe('rgba(180, 240, 255, 1)');
    expect(capturedLabelColor?.(ptWithCoords)).toBe('rgba(255, 255, 255, 0.95)');

    // Point & path color accessors with knowledgeMap active
    const testPointFeat: GeoFeature = {
      type: 'Feature',
      id: 'pt-1',
      properties: {
        id: 'pt-1',
        kind: 'capital',
        layerId: 'capitals',
        name_pl: 'PT',
        name_en: 'PT',
      },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    expect(capturedPointColor?.(testPointFeat)).toBeDefined();

    const testPathItem = {
      id: 'p-1',
      feature: {
        type: 'Feature',
        id: 'r-1',
        properties: { id: 'r-1', kind: 'river', layerId: 'rivers', name_pl: 'R', name_en: 'R' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
      } as GeoFeature,
      points: [
        [0, 0],
        [1, 1],
      ] as [number, number][],
    };
    expect(capturedPathColor?.(testPathItem)).toBeDefined();

    compositor.destroy();
  });

  it('handles lifecycle destruction, debounced scheduling, and network error resilience', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Fetch network failure'))),
    );

    const store = createStore<AppState>({
      ...createInitialState(),
      layers: {
        ...defaultLayersState(),
        countriesTopN: { enabled: true },
      },
    });

    const compositor = new LayerCompositor(mockGlobe, store);

    // Resilience against network errors - compose should catch and not throw
    const res = await compositor.compose();
    expect(res.polygonsCount).toBe(0);

    // Debounced scheduling
    compositor.scheduleCompose(20);
    compositor.scheduleCompose(10); // cancels previous timer

    await new Promise(r => setTimeout(r, 40));

    // Refresh dynamic styles when hiddenLabels is true
    store.set({ ...store.get(), hiddenLabels: true });
    compositor.refreshDynamicStyles();

    // Destroy
    compositor.destroy();

    // Invocations after destruction should be safe no-ops
    compositor.scheduleCompose(10);
    compositor.refreshDynamicStyles();
    const destroyedRes = await compositor.compose();
    expect(destroyedRes.polygonsCount).toBe(0);
  });
});
