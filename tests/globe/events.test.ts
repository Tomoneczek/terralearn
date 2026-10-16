import { describe, it, expect, vi } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import type { LayerId } from '@/layers';
import { attachGlobeEvents, type GlobeEventsDelegate } from '@/globe/events';
import type { GeoFeature } from '@/globe/data-loader';

describe('Globe Events & Picking', () => {
  function createMockGlobe(): {
    globe: GlobeEventsDelegate;
    triggerPolygonClick: (obj: object) => void;
    triggerPolygonHover: (obj: object | null) => void;
    triggerGlobeClick: (coords: { lat: number; lng: number }) => void;
  } {
    let polygonClickCb: ((obj: object) => void) | undefined;
    let polygonHoverCb: ((obj: object | null) => void) | undefined;
    let globeClickCb: ((coords: { lat: number; lng: number }) => void) | undefined;

    const globe: GlobeEventsDelegate = {
      onPolygonClick: vi.fn((fn: (obj: object) => void) => {
        polygonClickCb = fn;
        return globe;
      }),
      onPolygonHover: vi.fn((fn: (obj: object | null) => void) => {
        polygonHoverCb = fn;
        return globe;
      }),
      onPathClick: vi.fn().mockReturnThis(),
      onPathHover: vi.fn().mockReturnThis(),
      onPointClick: vi.fn().mockReturnThis(),
      onPointHover: vi.fn().mockReturnThis(),
      onGlobeClick: vi.fn((fn: (coords: { lat: number; lng: number }) => void) => {
        globeClickCb = fn;
        return globe;
      }),
    };

    return {
      globe,
      triggerPolygonClick: (obj: object) => polygonClickCb?.(obj),
      triggerPolygonHover: (obj: object | null) => polygonHoverCb?.(obj),
      triggerGlobeClick: (coords: { lat: number; lng: number }) => globeClickCb?.(coords),
    };
  }

  it('updates store selection on polygon click', () => {
    const store = createStore(createInitialState());
    const { globe, triggerPolygonClick } = createMockGlobe();
    attachGlobeEvents(globe, store);

    expect(store.get().selection).toBeNull();

    const mockFeature: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'pl',
        layerId: 'borders',
        kind: 'country',
        name_pl: 'Polska',
        name_en: 'Poland',
        labelLat: 52.0,
        labelLng: 20.0,
      },
      geometry: {
        type: 'Point',
        coordinates: [20.0, 52.0],
      },
    };

    triggerPolygonClick(mockFeature);

    expect(store.get().selection).toEqual({
      id: 'pl',
      layerId: 'borders',
      kind: 'country',
      name: 'Polska',
      lat: 52.0,
      lng: 20.0,
    });
  });

  it('updates store hovered and container cursor on feature hover', () => {
    const store = createStore(createInitialState());
    const { globe, triggerPolygonHover } = createMockGlobe();
    const container = document.createElement('div');
    attachGlobeEvents(globe, store, container);

    const mockFeature: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'amazon',
        layerId: 'rivers',
        kind: 'river',
        name_pl: 'Amazonka',
        name_en: 'Amazon',
      },
      geometry: {
        type: 'Point',
        coordinates: [0, 0],
      },
    };

    triggerPolygonHover(mockFeature);
    expect(store.get().hovered?.id).toBe('amazon');
    expect(container.style.cursor).toBe('pointer');

    // Unhover
    triggerPolygonHover(null);
    expect(store.get().hovered).toBeNull();
    expect(container.style.cursor).toBe('default');
  });

  it('records globe coordinate click and clears selection', () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      selection: { id: 'test', layerId: 'countriesTopN' as LayerId, kind: 'country' },
    });
    const { globe, triggerGlobeClick } = createMockGlobe();
    attachGlobeEvents(globe, store);

    triggerGlobeClick({ lat: -15.5, lng: 45.2 });

    expect(store.get().globeClick).toEqual({ lat: -15.5, lng: 45.2 });
    expect(store.get().selection).toBeNull();
  });
});
