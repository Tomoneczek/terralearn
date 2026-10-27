import { describe, it, expect, beforeEach } from 'vitest';
import { Scene, Mesh, LineLoop } from 'three';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import {
  SizeComparisonLayerController,
  type GlobeSizeComparisonDelegate,
} from '@/globe/size-comparison-layer';

describe('SizeComparisonLayerController (3D ghost polygon)', () => {
  let mockScene: Scene;
  let mockGlobe: GlobeSizeComparisonDelegate;

  const samplePolygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-40, 70],
        [-30, 70],
        [-35, 75],
        [-40, 70],
      ],
    ],
  };

  const sampleMultiPolygon: GeoJSON.MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [-40, 70],
          [-30, 70],
          [-35, 75],
          [-40, 70],
        ],
      ],
      [
        [
          [-50, 60],
          [-45, 60],
          [-48, 65],
          [-50, 60],
        ],
      ],
    ],
  };

  beforeEach(() => {
    mockScene = new Scene();
    mockGlobe = {
      scene: () => mockScene,
    };
  });

  it('initializes cleanly and attaches TL_SizeComparisonLayer group to scene', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new SizeComparisonLayerController(mockGlobe, store);

    const group = mockScene.getObjectByName('TL_SizeComparisonLayer');
    expect(group).not.toBeNull();
    expect(group?.children.length).toBe(0);

    // Group raycasting must be bypassed so user can still click countries underneath
    const raycastFn = group?.raycast;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(raycastFn?.({} as any, [] as any)).toBeNull();

    controller.destroy();
  });

  it('renders outline, cap mesh, and center marker for a Polygon', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new SizeComparisonLayerController(mockGlobe, store);

    store.set({
      sizeComparison: {
        active: true,
        countryId: 'GL',
        countryName: { pl: 'Grenlandia', en: 'Greenland' },
        countryAreaKm2: 2189751,
        targetLat: 0,
        targetLng: 20,
        geometry: samplePolygon,
      },
    });

    const group = controller.getGroup();
    expect(group.children.length).toBeGreaterThanOrEqual(3);

    // Contains line loop outline, mesh cap, and center anchor
    const hasLine = group.children.some(c => c instanceof LineLoop);
    const hasMesh = group.children.some(c => c instanceof Mesh);
    expect(hasLine).toBe(true);
    expect(hasMesh).toBe(true);

    // All children must bypass raycast
    for (const child of group.children) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(child.raycast({} as any, [] as any)).toBeNull();
    }

    controller.destroy();
  });

  it('renders multiple parts for a MultiPolygon', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new SizeComparisonLayerController(mockGlobe, store);

    store.set({
      sizeComparison: {
        active: true,
        countryId: 'TEST_MULTI',
        countryName: { pl: 'Multi Island', en: 'Multi Island' },
        countryAreaKm2: 500000,
        targetLat: 10,
        targetLng: 30,
        geometry: sampleMultiPolygon,
      },
    });

    const group = controller.getGroup();
    // 2 outlines + 2 caps + 1 center anchor = 5 children
    expect(group.children.length).toBe(5);

    const lineLoops = group.children.filter(c => c instanceof LineLoop);
    expect(lineLoops.length).toBe(2);

    controller.destroy();
  });

  it('clears meshes when deactivated or set to null', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new SizeComparisonLayerController(mockGlobe, store);

    store.set({
      sizeComparison: {
        active: true,
        countryId: 'GL',
        countryName: { pl: 'Grenlandia', en: 'Greenland' },
        countryAreaKm2: 2189751,
        targetLat: 0,
        targetLng: 20,
        geometry: samplePolygon,
      },
    });
    expect(controller.getGroup().children.length).toBeGreaterThan(0);

    store.set({ sizeComparison: null });
    expect(controller.getGroup().children.length).toBe(0);

    controller.destroy();
  });

  it('updates ghost position when targetLat and targetLng change', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new SizeComparisonLayerController(mockGlobe, store);

    store.set({
      sizeComparison: {
        active: true,
        countryId: 'GL',
        countryName: { pl: 'Grenlandia', en: 'Greenland' },
        countryAreaKm2: 2189751,
        targetLat: 0,
        targetLng: 20,
        geometry: samplePolygon,
      },
    });

    // Move to 50, 15
    store.set({
      sizeComparison: {
        active: true,
        countryId: 'GL',
        countryName: { pl: 'Grenlandia', en: 'Greenland' },
        countryAreaKm2: 2189751,
        targetLat: 50,
        targetLng: 15,
        geometry: samplePolygon,
      },
    });

    expect(controller.getGroup().children.length).toBeGreaterThanOrEqual(3);
    controller.destroy();
  });

  it('handles invalid / degenerate rings gracefully without throwing', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new SizeComparisonLayerController(mockGlobe, store);

    const degeneratePolygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[-40, 70]]], // only 1 point
    };

    expect(() => {
      store.set({
        sizeComparison: {
          active: true,
          countryId: 'DEGEN',
          countryName: { pl: 'Degenerate', en: 'Degenerate' },
          countryAreaKm2: 100,
          targetLat: 0,
          targetLng: 0,
          geometry: degeneratePolygon,
        },
      });
    }).not.toThrow();

    controller.destroy();
  });

  it('destroys and removes group from scene', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new SizeComparisonLayerController(mockGlobe, store);

    expect(mockScene.getObjectByName('TL_SizeComparisonLayer')).not.toBeNull();
    controller.destroy();
    expect(mockScene.getObjectByName('TL_SizeComparisonLayer')).toBeUndefined();
  });
});
