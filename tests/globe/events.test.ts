import { describe, it, expect, vi } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import type { LayerId } from '@/layers';
import { attachGlobeEvents, resolveFeature, type GlobeEventsDelegate } from '@/globe/events';
import { HoverArbiter } from '@/globe/hover-arbiter';
import type { GeoFeature } from '@/globe/data-loader';

describe('Globe Events & Picking', () => {
  function createMockGlobe(): {
    globe: GlobeEventsDelegate;
    triggerPolygonClick: (obj: object) => void;
    triggerPolygonHover: (obj: object | null) => void;
    triggerGlobeClick: (coords: { lat: number; lng: number }) => void;
    triggerPathClick: (obj: object) => void;
    triggerPathHover: (obj: object | null) => void;
  } {
    let pathClickCb: ((obj: object) => void) | undefined;
    let pathHoverCb: ((obj: object | null) => void) | undefined;
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
      onPathClick: vi.fn((fn: (obj: object) => void) => {
        pathClickCb = fn;
        return globe;
      }),
      onPathHover: vi.fn((fn: (obj: object | null) => void) => {
        pathHoverCb = fn;
        return globe;
      }),
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
      triggerPathClick: (obj: object) => pathClickCb?.(obj),
      triggerPathHover: (obj: object | null) => pathHoverCb?.(obj),
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
      name_pl: 'Polska',
      name_en: 'Poland',
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

  // Regression: globe.gl keeps its hovered object when the pointer leaves the canvas, so the
  // tooltip ("Saudi Arabia") stayed on top of the sidebar.
  it('clears the hover when the pointer leaves the globe and restores it on return', () => {
    const store = createStore(createInitialState());
    const { globe, triggerPolygonHover } = createMockGlobe();
    const container = document.createElement('div');
    const arbiter = new HoverArbiter(store, container);
    const detach = attachGlobeEvents(globe, store, container, arbiter);

    triggerPolygonHover({
      type: 'Feature',
      properties: {
        id: 'SA',
        layerId: 'countriesTopN',
        kind: 'country',
        name_pl: 'Arabia Saudyjska',
      },
      geometry: { type: 'Point', coordinates: [45, 24] },
    });
    container.dispatchEvent(new Event('pointerleave'));
    expect(store.get().hovered).toBeNull();

    container.dispatchEvent(new Event('pointerenter'));
    expect(store.get().hovered?.id).toBe('SA');

    detach();
    container.dispatchEvent(new Event('pointerleave'));
    expect(store.get().hovered?.id).toBe('SA');
  });

  it('clears the hover on pointer leave without an arbiter', () => {
    const store = createStore(createInitialState());
    const { globe, triggerPolygonHover } = createMockGlobe();
    const container = document.createElement('div');
    attachGlobeEvents(globe, store, container);

    triggerPolygonHover({
      type: 'Feature',
      properties: {
        id: 'SA',
        layerId: 'countriesTopN',
        kind: 'country',
        name_pl: 'Arabia Saudyjska',
      },
      geometry: { type: 'Point', coordinates: [45, 24] },
    });
    container.dispatchEvent(new Event('pointerleave'));
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

  // Regression: globe.gl passes paths as { id, feature, points } wrappers, which used to be
  // ignored because the handlers looked for `properties.id` on the wrapper itself.
  describe('path wrappers', () => {
    const river: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'nile',
        layerId: 'rivers',
        kind: 'river',
        name_pl: 'Nil',
        name_en: 'Nile',
      },
      geometry: { type: 'LineString', coordinates: [] },
    };
    const pathItem = { id: 'nile-seg-0', feature: river, points: [] };

    it('sets hovered and clears it for a hovered path wrapper', () => {
      const store = createStore<AppState>(createInitialState());
      const { globe, triggerPathHover } = createMockGlobe();
      attachGlobeEvents(globe, store);

      triggerPathHover(pathItem);
      expect(store.get().hovered?.id).toBe('nile');
      expect(store.get().hovered?.kind).toBe('river');

      triggerPathHover(null);
      expect(store.get().hovered).toBeNull();
    });

    it('selects the feature behind a clicked path wrapper', () => {
      const store = createStore<AppState>(createInitialState());
      const { globe, triggerPathClick } = createMockGlobe();
      attachGlobeEvents(globe, store);

      triggerPathClick(pathItem);
      expect(store.get().selection?.id).toBe('nile');
    });

    it('resolveFeature handles wrappers, plain features and junk', () => {
      expect(resolveFeature(pathItem)?.properties.id).toBe('nile');
      expect(resolveFeature(river)?.properties.id).toBe('nile');
      expect(resolveFeature({})).toBeNull();
      expect(resolveFeature({ feature: {} })).toBeNull();
    });
  });

  // The capitals layer owns its markers: while the pointer is over one, whatever globe.gl reports
  // underneath (a country, the background) must neither override the hover nor handle the click.
  describe('with a hover arbiter (capitals layer)', () => {
    const country: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'pl',
        layerId: 'borders',
        kind: 'country',
        name_pl: 'Polska',
        name_en: 'Poland',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    };
    const capitalRef = { id: 'capital-warsaw', layerId: 'capitals' as LayerId, kind: 'capital' };

    it('routes globe.gl hover through the arbiter', () => {
      const store = createStore<AppState>(createInitialState());
      const container = document.createElement('div');
      const { globe, triggerPolygonHover } = createMockGlobe();
      attachGlobeEvents(globe, store, container, new HoverArbiter(store, container));

      triggerPolygonHover(country);
      expect(store.get().hovered?.id).toBe('pl');
      expect(container.style.cursor).toBe('pointer');

      triggerPolygonHover(null);
      expect(store.get().hovered).toBeNull();
      expect(container.style.cursor).toBe('default');
    });

    it('keeps the capital hovered while globe.gl reports the country underneath', () => {
      const store = createStore<AppState>(createInitialState());
      const arbiter = new HoverArbiter(store);
      const { globe, triggerPolygonHover } = createMockGlobe();
      attachGlobeEvents(globe, store, undefined, arbiter);

      arbiter.setCapitalHover(capitalRef);
      triggerPolygonHover(country);
      expect(store.get().hovered?.id).toBe('capital-warsaw');

      arbiter.setCapitalHover(null);
      expect(store.get().hovered?.id).toBe('pl');
    });

    it('ignores globe.gl clicks (feature and background) while a capital is claimed', () => {
      const store = createStore<AppState>(createInitialState());
      const arbiter = new HoverArbiter(store);
      const { globe, triggerPolygonClick, triggerGlobeClick } = createMockGlobe();
      attachGlobeEvents(globe, store, undefined, arbiter);

      arbiter.setCapitalHover(capitalRef);
      triggerPolygonClick(country);
      triggerGlobeClick({ lat: 1, lng: 2 });
      expect(store.get().selection).toBeNull();
      expect(store.get().globeClick).toBeNull();

      arbiter.setCapitalHover(null);
      triggerPolygonClick(country);
      expect(store.get().selection?.id).toBe('pl');
    });

    it('ignores globe.gl clicks while the Moon is under the pointer', () => {
      const store = createStore<AppState>(createInitialState());
      const arbiter = new HoverArbiter(store);
      const { globe, triggerPolygonClick, triggerGlobeClick } = createMockGlobe();
      attachGlobeEvents(globe, store, undefined, arbiter);

      arbiter.setMoonHover(true);
      triggerPolygonClick(country);
      triggerGlobeClick({ lat: 1, lng: 2 });
      expect(store.get().selection).toBeNull();
      expect(store.get().globeClick).toBeNull();
    });
  });
});
