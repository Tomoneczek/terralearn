import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { FeatureRef } from '@/state/types';
import { LayerCompositor, type GlobeCompositorTarget, type RingItem } from '@/globe/compositor';
import { attachGlobeEvents, toFeatureRef, type GlobeEventsDelegate } from '@/globe/events';
import type { GeoFeature } from '@/globe/data-loader';

describe('LayerCompositor - Selection Pulsing Halo (ringsData)', () => {
  let mockGlobe: GlobeCompositorTarget;
  let lastRingsPassed: RingItem[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    lastRingsPassed = [];

    mockGlobe = {
      polygonsData: vi.fn().mockReturnThis(),
      pathsData: vi.fn().mockReturnThis(),
      pointsData: vi.fn().mockReturnThis(),
      ringsData: vi.fn((rings: RingItem[]) => {
        lastRingsPassed = rings;
        return mockGlobe;
      }),

      polygonsTransitionDuration: vi.fn().mockReturnThis(),
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

      pointLat: vi.fn().mockReturnThis(),
      pointLng: vi.fn().mockReturnThis(),
      pointColor: vi.fn().mockReturnThis(),
      pointRadius: vi.fn().mockReturnThis(),
      pointAltitude: vi.fn().mockReturnThis(),

      ringLat: vi.fn().mockReturnThis(),
      ringLng: vi.fn().mockReturnThis(),
      ringAltitude: vi.fn().mockReturnThis(),
      ringColor: vi.fn().mockReturnThis(),
      ringMaxRadius: vi.fn().mockReturnThis(),
      ringPropagationSpeed: vi.fn().mockReturnThis(),
      ringRepeatPeriod: vi.fn().mockReturnThis(),
    };
  });

  it('triggers pulsing halo when an object with coordinates is selected', () => {
    const store = createStore(createInitialState());
    const compositor = new LayerCompositor(mockGlobe, store);

    expect(mockGlobe.ringMaxRadius).toHaveBeenCalled();
    expect(mockGlobe.ringPropagationSpeed).toHaveBeenCalled();

    // Select a capital city (Warsaw: lat 52.23, lng 21.01)
    const selection: FeatureRef = {
      id: 'p1',
      layerId: 'capitals',
      kind: 'capital',
      name_pl: 'Warszawa',
      name_en: 'Warsaw',
      lat: 52.23,
      lng: 21.01,
    };

    store.set({ selection });

    expect(mockGlobe.ringsData).toHaveBeenCalled();
    expect(lastRingsPassed).toHaveLength(1);
    expect(lastRingsPassed[0]?.lat).toBe(52.23);
    expect(lastRingsPassed[0]?.lng).toBe(21.01);
    expect(lastRingsPassed[0]?.maxRadius).toBe(3.5);

    // Verify fading color interpolation function
    const colorFn = lastRingsPassed[0]?.color;
    expect(typeof colorFn).toBe('function');
    if (typeof colorFn === 'function') {
      const startColor = colorFn(0);
      const endColor = colorFn(1);
      expect(startColor).toContain('rgba(255, 215, 60, 1)');
      expect(endColor).toContain('rgba(255, 215, 60, 0)');
    }

    // Deselect object
    store.set({ selection: null });
    expect(lastRingsPassed).toHaveLength(0);

    compositor.destroy();
  });

  it('extracts fallback coordinates from click event when label coordinates are absent', () => {
    const store = createStore(createInitialState());
    let polygonClickHandler:
      | ((
          polygon: object,
          event: MouseEvent,
          coords: { lat: number; lng: number; altitude: number },
        ) => void)
      | undefined;

    const mockDelegate: GlobeEventsDelegate = {
      onPolygonClick: fn => {
        polygonClickHandler = fn;
        return mockDelegate;
      },
    };

    const detach = attachGlobeEvents(mockDelegate, store);

    const featureWithoutLabelCoords: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'c-test',
        layerId: 'countriesTopN',
        kind: 'country',
        name_pl: 'Testlandia',
        name_en: 'Testland',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    };

    expect(polygonClickHandler).toBeDefined();
    polygonClickHandler?.(featureWithoutLabelCoords, new MouseEvent('click'), {
      lat: 12.34,
      lng: 56.78,
      altitude: 0.05,
    });

    const currentSelection = store.get().selection;
    expect(currentSelection?.id).toBe('c-test');
    expect(currentSelection?.lat).toBe(12.34);
    expect(currentSelection?.lng).toBe(56.78);

    detach();
  });

  it('toFeatureRef extracts Point coordinates from geometry if label coords are missing', () => {
    const pointFeature: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'peak-1',
        layerId: 'peaks',
        kind: 'peak',
        name_pl: 'Rysy',
        name_en: 'Rysy',
      },
      geometry: { type: 'Point', coordinates: [20.088, 49.179] },
    };

    const ref = toFeatureRef(pointFeature);
    expect(ref.lng).toBe(20.088);
    expect(ref.lat).toBe(49.179);
  });
});
