import { describe, it, expect, vi, afterEach } from 'vitest';
import { Raycaster, Vector3, type Object3D } from 'three';
import ThreeGlobe from 'three-globe';
import { LayerCompositor, type GlobeCompositorTarget } from '@/globe/compositor';
import { latLngToVector } from '@/globe/highlight-overlay';
import { countDrawCalls } from '@/dev/draw-calls';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { defaultLayersState, type LayerId } from '@/layers';

/** Rings are clockwise, like every exterior ring in the real (TopoJSON-derived) dataset. */
function square(id: string, lng: number): object {
  return {
    type: 'Feature',
    id,
    properties: {
      id,
      kind: 'country',
      layerId: 'borders',
      name_pl: id,
      name_en: id,
      rank: { order: 1 },
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng, 0],
          [lng, 5],
          [lng + 5, 5],
          [lng + 5, 0],
          [lng, 0],
        ],
      ],
    },
  };
}

const multi = {
  type: 'Feature',
  id: 'islands',
  properties: {
    id: 'islands',
    kind: 'country',
    layerId: 'borders',
    name_pl: 'islands',
    name_en: 'islands',
    rank: { order: 1 },
  },
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [40, 0],
          [40, 5],
          [45, 5],
          [45, 0],
          [40, 0],
        ],
      ],
      [
        [
          [50, 0],
          [50, 5],
          [55, 5],
          [55, 0],
          [50, 0],
        ],
      ],
    ],
  },
};

async function setup(): Promise<{ globe: ThreeGlobe; compositor: LayerCompositor }> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [square('A', 0), square('B', 10), multi],
        }),
      }),
    ),
  );
  const layers = Object.fromEntries(
    Object.entries(defaultLayersState()).map(([id, state]) => [
      id,
      { ...state, enabled: id === 'borders' },
    ]),
  ) as AppState['layers'];
  const store = createStore<AppState>({ ...createInitialState(), layers });
  // No intro animation: it scales the whole globe from zero and would skew the raycast
  const globe = new ThreeGlobe({ animateIn: false, waitForGlobeReady: false });
  const compositor = new LayerCompositor(globe as unknown as GlobeCompositorTarget, store);
  await compositor.compose();
  await new Promise(r => setTimeout(r, 120));
  globe.updateMatrixWorld(true);
  return { globe, compositor };
}

function polygonTypeOf(object: Object3D): string | null {
  let current: Object3D | null = object;
  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, '__globeObjType')) {
      return (current as Object3D & { __globeObjType: string }).__globeObjType;
    }
    current = current.parent;
  }
  return null;
}

describe('transparent polygon layers (borders) draw cost', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Regression: borders (transparent cap and side) used to cost 3 draw calls per polygon part:
  // an invisible side, an invisible cap and the visible stroke. Only the stroke should be drawn.
  it('draws only the stroke for each polygon part', async () => {
    const { globe, compositor } = await setup();

    // 2 squares + 2 islands = 4 polygon parts
    expect(countDrawCalls(globe).polygon).toBe(4);

    compositor.destroy();
  });

  it('keeps the invisible caps pickable by raycast', async () => {
    const { globe, compositor } = await setup();

    const target = latLngToVector(2.5, 12.5, 100); // inside square "B"
    const origin = target.clone().multiplyScalar(3);
    const raycaster = new Raycaster(origin, target.clone().sub(origin).normalize());
    const hits = raycaster.intersectObject(globe, true).filter(h => {
      return polygonTypeOf(h.object) === 'polygon';
    });

    expect(hits.length).toBeGreaterThan(0);
    const owner = hits[0]!.object.parent as Object3D & { __data?: { data?: { id?: string } } };
    expect(owner.__data?.data?.id ?? (owner.__data as { id?: string } | undefined)?.id).toBe('B');
    expect(new Vector3().copy(hits[0]!.point).length()).toBeGreaterThan(99);

    compositor.destroy();
  });

  it('still draws colored layers normally (cap + side + stroke)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            type: 'FeatureCollection',
            features: [
              {
                ...(square('L', 0) as object),
                properties: {
                  id: 'L',
                  kind: 'lake',
                  layerId: 'lakes',
                  name_pl: 'L',
                  name_en: 'L',
                  rank: { order: 1 },
                },
              },
            ],
          }),
        }),
      ),
    );
    const layers = Object.fromEntries(
      Object.entries(defaultLayersState()).map(([id, state]) => [
        id,
        { ...state, enabled: (id as LayerId) === 'lakes' },
      ]),
    ) as AppState['layers'];
    const store = createStore<AppState>({ ...createInitialState(), layers });
    const globe = new ThreeGlobe({ animateIn: false, waitForGlobeReady: false });
    const compositor = new LayerCompositor(globe as unknown as GlobeCompositorTarget, store);
    await compositor.compose();
    await new Promise(r => setTimeout(r, 120));

    expect(countDrawCalls(globe).polygon).toBe(3);
    compositor.destroy();
  });
});
