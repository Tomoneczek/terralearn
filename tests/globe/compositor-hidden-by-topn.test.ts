import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { defaultLayersState } from '@/layers/registry';
import { LayerCompositor, type GlobeCompositorTarget, type PathItem } from '@/globe/compositor';
import { clearGeoDataCache, type GeoFeatureCollection } from '@/globe/data-loader';

const river = (id: string, order: number) => ({
  type: 'Feature' as const,
  id,
  properties: {
    id,
    kind: 'river' as const,
    layerId: 'physical-rivers',
    name_pl: id,
    name_en: id,
    aliases: [],
    rank: { length: 1000 - order, order },
  },
  geometry: {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [5, 5],
    ],
  },
});

const RIVERS: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: [river('big', 1), river('medium', 2), river('small', 3)],
};

function globeStub(onPaths: (paths: PathItem[]) => void): GlobeCompositorTarget {
  const g = {} as Record<string, unknown>;
  const names = [
    'polygonsData',
    'pointsData',
    'polygonsTransitionDuration',
    'pathsTransitionDuration',
    'pathTransitionDuration',
    'pointsTransitionDuration',
    'polygonCapColor',
    'polygonSideColor',
    'polygonStrokeColor',
    'polygonAltitude',
    'pathPoints',
    'pathPointLat',
    'pathPointLng',
    'pathPointAlt',
    'pathColor',
    'pathStroke',
    'pathDashLength',
    'pathDashGap',
    'pathDashAnimateTime',
    'pointLat',
    'pointLng',
    'pointColor',
    'pointRadius',
    'pointAltitude',
  ];
  for (const n of names) g[n] = vi.fn(() => g);
  g.pathsData = vi.fn((paths: PathItem[]) => {
    onPaths(paths);
    return g;
  });
  return g as unknown as GlobeCompositorTarget;
}

describe('LayerCompositor - objects outside the Top N', () => {
  let drawn: PathItem[] = [];

  beforeEach(() => {
    clearGeoDataCache();
    drawn = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => RIVERS })),
    );
  });

  it('REGRESSION: resolves an object the Top N leaves out, so it can still be highlighted', async () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      layers: { ...defaultLayersState(), rivers: { enabled: true, topN: 1 } },
    });
    const compositor = new LayerCompositor(
      globeStub(paths => (drawn = paths)),
      store,
    );
    await compositor.compose();

    // Only the top river is drawn...
    expect(drawn.map(p => p.feature.properties.id)).toEqual(['big']);
    // ...but the rankings table can still locate the others: geometry and layer are resolvable
    const hidden = compositor.getFeatureById('small');
    expect(hidden?.properties.id).toBe('small');
    expect(hidden?.properties.layerId).toBe('rivers');
    expect(hidden?.geometry.type).toBe('LineString');
    expect(compositor.getFeatureById('missing')).toBeUndefined();

    compositor.destroy();
  });

  it('forgets objects of a layer that was switched off', async () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      layers: { ...defaultLayersState(), rivers: { enabled: true, topN: 1 } },
    });
    const compositor = new LayerCompositor(
      globeStub(paths => (drawn = paths)),
      store,
    );
    await compositor.compose();
    store.set({ layers: { ...store.get().layers, rivers: { enabled: false, topN: 1 } } });
    await compositor.compose();
    expect(compositor.getFeatureById('small')).toBeUndefined();
    compositor.destroy();
  });
});
