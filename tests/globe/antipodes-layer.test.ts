import { describe, it, expect, beforeEach } from 'vitest';
import { Scene, Mesh, Line } from 'three';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { AntipodesLayerController, type GlobeAntipodesDelegate } from '@/globe/antipodes-layer';

describe('AntipodesLayerController (3D antipodal markers & shaft)', () => {
  let mockScene: Scene;
  let mockGlobe: GlobeAntipodesDelegate;

  beforeEach(() => {
    mockScene = new Scene();
    mockGlobe = {
      scene: () => mockScene,
    };
  });

  it('initializes empty and adds TL_AntipodesLayer group with raycast bypass', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new AntipodesLayerController(mockGlobe, store);

    const group = mockScene.getObjectByName('TL_AntipodesLayer');
    expect(group).not.toBeNull();
    expect(group?.children.length).toBe(0);

    // Group raycasting must be bypassed so user can still interact with globe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(group?.raycast({} as any, [] as any)).toBeNull();

    controller.destroy();
  });

  it('renders Point A markers, Point B markers, and diametral tunnel line', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new AntipodesLayerController(mockGlobe, store);

    store.set({
      antipodes: {
        active: true,
        source: { lat: 52.23, lng: 21.01, label: 'Warszawa' },
        antipode: { lat: -52.23, lng: -158.99, locationName: 'Ocean Spokojny', isLand: false },
      },
    });

    const group = controller.getGroup();
    // 2 meshes for Point A (core + ring) + 2 meshes for Point B (core + ring) + 1 shaft Line = 5 children
    expect(group.children.length).toBe(5);

    const meshes = group.children.filter(c => c instanceof Mesh);
    expect(meshes.length).toBe(4);

    const lines = group.children.filter(c => c instanceof Line);
    expect(lines.length).toBe(1);

    // All children must have raycast bypassed
    for (const child of group.children) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(child.raycast({} as any, [] as any)).toBeNull();
    }

    controller.destroy();
  });

  it('clears all 3D objects when antipodes state is set to null or inactive', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new AntipodesLayerController(mockGlobe, store);

    store.set({
      antipodes: {
        active: true,
        source: { lat: 40.41, lng: -3.7, label: 'Madryt' },
        antipode: { lat: -40.41, lng: 176.3, locationName: 'Nowa Zelandia', isLand: true },
      },
    });
    expect(controller.getGroup().children.length).toBe(5);

    store.set({ antipodes: null });
    expect(controller.getGroup().children.length).toBe(0);

    controller.destroy();
  });

  it('destroys and removes group from scene', () => {
    const store = createStore<AppState>(createInitialState());
    const controller = new AntipodesLayerController(mockGlobe, store);

    expect(mockScene.getObjectByName('TL_AntipodesLayer')).not.toBeNull();
    controller.destroy();
    expect(mockScene.getObjectByName('TL_AntipodesLayer')).toBeUndefined();
  });
});
