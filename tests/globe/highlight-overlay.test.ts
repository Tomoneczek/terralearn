import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Mesh, Raycaster, Scene, Vector3, type Object3D } from 'three';
import ConicPolygonGeometry from 'three-conic-polygon-geometry';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { MeshBasicMaterial } from 'three';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { createStore, createInitialState } from '@/state/store';
import type { AppState, FeatureRef, Store } from '@/state/types';
import type { LayerId } from '@/layers';
import type { GeoFeature } from '@/globe/data-loader';
import {
  GLOBE_RADIUS,
  HIGHLIGHT_STYLES,
  HighlightOverlay,
  latLngToVector,
  lineToPositions,
} from '@/globe/highlight-overlay';

function feature(
  id: string,
  geometry: GeoFeature['geometry'],
  layerId = 'countriesTopN',
  kind = 'country',
): GeoFeature {
  return {
    type: 'Feature',
    id,
    properties: { id, kind, layerId, name_pl: id, name_en: id },
    geometry,
  };
}

const square = (lng: number, lat: number): GeoFeature['geometry'] => ({
  type: 'Polygon',
  coordinates: [
    [
      [lng, lat],
      [lng + 5, lat],
      [lng + 5, lat + 5],
      [lng, lat + 5],
      [lng, lat],
    ],
  ],
});

const ref = (id: string, layerId = 'countriesTopN'): FeatureRef => ({
  id,
  layerId: layerId as LayerId,
  kind: 'country',
});

/** Fill meshes of a group (Line2 extends Mesh, so it has to be excluded explicitly). */
function fillMeshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse(o => {
    if (o instanceof Mesh && !(o instanceof Line2)) out.push(o);
  });
  return out;
}

describe('geometry helpers', () => {
  it('latLngToVector uses the same convention as three-conic-polygon-geometry', () => {
    const geometry = new ConicPolygonGeometry(
      [
        [
          [10, 10],
          [20, 10],
          [20, 20],
          [10, 20],
          [10, 10],
        ],
      ],
      GLOBE_RADIUS,
      GLOBE_RADIUS,
      false,
      true,
      false,
      5,
    );
    const position = geometry.attributes.position!;
    const corners: Array<[number, number]> = [
      [10, 10],
      [20, 20],
    ];
    for (const [lng, lat] of corners) {
      const expected = latLngToVector(lat, lng, GLOBE_RADIUS);
      let nearest = Infinity;
      for (let i = 0; i < position.count; i++) {
        nearest = Math.min(
          nearest,
          new Vector3(position.getX(i), position.getY(i), position.getZ(i)).distanceTo(expected),
        );
      }
      expect(nearest).toBeLessThan(1e-4);
    }
  });

  it('puts every projected point on the requested radius', () => {
    const positions = lineToPositions(
      [
        [0, 0],
        [40, 30],
      ],
      105,
    );
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(positions[i]!, positions[i + 1]!, positions[i + 2]!)).toBeCloseTo(105, 6);
    }
  });

  it('subdivides long edges so chords stay close to the surface', () => {
    const positions = lineToPositions(
      [
        [0, 0],
        [30, 0],
      ],
      GLOBE_RADIUS,
      2,
    );
    expect(positions.length / 3).toBeGreaterThanOrEqual(16);
  });

  it('interpolates across the antimeridian the short way', () => {
    const positions = lineToPositions(
      [
        [179, 0],
        [-179, 0],
      ],
      GLOBE_RADIUS,
      1,
    );
    const points: Vector3[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      points.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
    }
    // 2 degrees of arc in total: no point may be far from the antimeridian
    const antimeridian = latLngToVector(0, 180, GLOBE_RADIUS);
    for (const p of points) {
      expect(p.distanceTo(antimeridian)).toBeLessThan(GLOBE_RADIUS * 0.03);
    }
  });
});

describe('HighlightOverlay', () => {
  let store: Store<AppState>;
  let scene: Scene;
  let features: Map<string, GeoFeature>;
  let overlay: HighlightOverlay;

  beforeEach(() => {
    store = createStore<AppState>(createInitialState());
    scene = new Scene();
    features = new Map([
      ['A', feature('A', square(10, 10))],
      ['B', feature('B', square(30, 10))],
      [
        'R',
        feature(
          'R',
          {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [10, 5],
              [20, 0],
            ],
          },
          'rivers',
          'river',
        ),
      ],
      ['P', feature('P', { type: 'Point', coordinates: [21, 52] }, 'capitals', 'capital')],
    ]);
    overlay = new HighlightOverlay(scene, store, id => features.get(id));
  });

  it('adds its group to the scene and shows nothing by default', () => {
    expect(scene.children).toContain(overlay.group);
    expect(overlay.getActiveCount()).toBe(0);
  });

  it('draws a fill mesh and outline lines for a hovered polygon', () => {
    store.set({ hovered: ref('A') });

    expect(overlay.getActiveCount()).toBe(1);
    const meshes = fillMeshes(overlay.group);
    const lines: Line2[] = [];
    overlay.group.traverse(o => {
      if (o instanceof Line2) lines.push(o);
    });
    expect(meshes).toHaveLength(1);
    expect(lines).toHaveLength(1);

    const fill = meshes[0]!.material as MeshBasicMaterial;
    expect(fill.opacity).toBe(HIGHLIGHT_STYLES.hover.fillOpacity);
    expect(fill.depthWrite).toBe(false);
    const line = lines[0]!.material as LineMaterial;
    expect(line.linewidth).toBe(HIGHLIGHT_STYLES.hover.lineWidth);
  });

  it('draws the cap just above the feature layer altitude', () => {
    store.set({ hovered: ref('A') });
    const mesh = fillMeshes(overlay.group)[0]!;
    const position = mesh.geometry.attributes.position!;
    const radius = Math.hypot(position.getX(0), position.getY(0), position.getZ(0));
    // countriesTopN base altitude 0.012 + overlay lift 0.003
    expect(radius).toBeCloseTo(GLOBE_RADIUS * (1 + 0.012 + 0.003), 3);
  });

  it('uses the selected style, and shows only the selected one when hover is the same feature', () => {
    store.set({ selection: ref('A'), hovered: ref('A') });
    expect(overlay.getActiveCount()).toBe(1);
    const fill = fillMeshes(overlay.group)[0]!.material as MeshBasicMaterial;
    expect(fill.opacity).toBe(HIGHLIGHT_STYLES.selected.fillOpacity);

    store.set({ hovered: ref('B') });
    expect(overlay.getActiveCount()).toBe(2);
  });

  it('draws only an outline for paths and a marker ring for points', () => {
    store.set({ hovered: ref('R', 'rivers') });
    let lineCount = 0;
    overlay.group.traverse(o => {
      if (o instanceof Line2) lineCount++;
    });
    expect(fillMeshes(overlay.group)).toHaveLength(0);
    expect(lineCount).toBe(1);

    store.set({ hovered: ref('P', 'capitals') });
    lineCount = 0;
    overlay.group.traverse(o => {
      if (o instanceof Line2) lineCount++;
    });
    expect(lineCount).toBe(1);
  });

  it('never intercepts pointer picking', () => {
    store.set({ hovered: ref('A') });
    const raycaster = new Raycaster(new Vector3(0, 0, 300), new Vector3(0, 0, -1));
    const hits = raycaster.intersectObject(overlay.group, true);
    expect(hits).toHaveLength(0);
    overlay.group.traverse(o => {
      expect(o.frustumCulled).toBe(false);
    });
  });

  it('ignores features it cannot resolve and picks them up on sync', () => {
    store.set({ hovered: ref('late') });
    expect(overlay.getActiveCount()).toBe(0);

    features.set('late', feature('late', square(50, 10)));
    overlay.sync();
    expect(overlay.getActiveCount()).toBe(1);
  });

  it('reuses cached geometry when hovering back and forth', () => {
    store.set({ hovered: ref('A') });
    const first = overlay.group.children[0];
    store.set({ hovered: ref('B') });
    store.set({ hovered: ref('A') });

    expect(overlay.getCacheSize()).toBe(2);
    expect(overlay.group.children[0]).toBe(first);
  });

  it('evicts and disposes the oldest entries beyond the cache limit', () => {
    const disposed = vi.fn();
    for (let i = 0; i < 30; i++) {
      features.set(`F${i}`, feature(`F${i}`, square(i, 0)));
    }
    store.set({ hovered: ref('F0') });
    for (const mesh of fillMeshes(overlay.group)) {
      mesh.geometry.addEventListener('dispose', disposed);
    }

    for (let i = 1; i < 30; i++) store.set({ hovered: ref(`F${i}`) });

    expect(overlay.getCacheSize()).toBeLessThanOrEqual(24);
    expect(disposed).toHaveBeenCalled();
  });

  it('removes itself from the scene and stops reacting after destroy', () => {
    store.set({ hovered: ref('A') });
    overlay.destroy();

    expect(scene.children).not.toContain(overlay.group);
    expect(overlay.getCacheSize()).toBe(0);
    store.set({ hovered: ref('B') });
    expect(overlay.getActiveCount()).toBe(0);
  });

  it('works without a scene (mock environments)', () => {
    const detached = new HighlightOverlay(null, store, id => features.get(id));
    store.set({ hovered: ref('A') });
    expect(detached.getActiveCount()).toBe(1);
    detached.destroy();
  });
});
