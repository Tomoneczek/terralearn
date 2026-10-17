import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scene, Raycaster, Vector3 } from 'three';
import { CloudsController } from '@/globe/clouds';
import { createStore, createInitialState } from '@/state/store';

// Mock Three.js TextureLoader to avoid network calls in test
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    TextureLoader: class MockTextureLoader {
      load() {
        return {
          dispose: vi.fn(),
        };
      }
    },
  };
});

describe('CloudsController (G08-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates cloud sphere with altitude, transparent material and non-blocking depthWrite', () => {
    const scene = new Scene();
    const store = createStore(createInitialState());

    const controller = new CloudsController(scene, store, {
      globeRadius: 100,
      altitude: 0.005,
    });

    const mesh = controller.getMesh();
    expect(mesh).toBeDefined();
    expect(mesh?.name).toBe('clouds-sphere');
    expect(mesh?.visible).toBe(true);

    const mat = mesh?.material as import('three').MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);

    controller.destroy();
  });

  it('CRITICAL: raycast ignores clouds sphere to prevent intercepting picking/hover/clicks', () => {
    const scene = new Scene();
    const store = createStore(createInitialState());
    const controller = new CloudsController(scene, store);

    const mesh = controller.getMesh()!;
    expect(mesh).toBeDefined();

    const raycaster = new Raycaster(new Vector3(0, 0, 150), new Vector3(0, 0, -1));
    const intersects: unknown[] = [];

    // Invoking raycast on clouds mesh must do nothing and add zero intersects
    mesh.raycast(raycaster, intersects as never);
    expect(intersects.length).toBe(0);

    controller.destroy();
  });

  it('reactively toggles mesh visibility when store clouds state changes', () => {
    const scene = new Scene();
    const store = createStore({
      ...createInitialState(),
      clouds: true,
    });

    const controller = new CloudsController(scene, store);
    const mesh = controller.getMesh()!;
    expect(mesh.visible).toBe(true);

    store.set(s => ({ ...s, clouds: false }));
    expect(mesh.visible).toBe(false);

    store.set(s => ({ ...s, clouds: true }));
    expect(mesh.visible).toBe(true);

    controller.destroy();
  });

  it('rotates clouds on tick when visible and leaves rotation untouched when hidden', () => {
    const scene = new Scene();
    const store = createStore(createInitialState());
    const controller = new CloudsController(scene, store, { rotationSpeed: -0.01 });

    const mesh = controller.getMesh()!;
    const initialRot = mesh.rotation.y;

    controller.tick();
    expect(mesh.rotation.y).toBeCloseTo(initialRot - 0.01, 5);

    // When hidden, tick should not rotate
    controller.setVisible(false);
    const hiddenRot = mesh.rotation.y;
    controller.tick();
    expect(mesh.rotation.y).toBe(hiddenRot);

    controller.destroy();
  });

  it('properly cleans up resources and removes mesh from scene on destroy', () => {
    const scene = new Scene();
    const store = createStore(createInitialState());
    const controller = new CloudsController(scene, store);

    expect(scene.children.length).toBe(1);

    controller.destroy();
    expect(scene.children.length).toBe(0);
  });
});
