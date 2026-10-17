import { describe, it, expect, beforeEach } from 'vitest';
import { Scene, Line, LineSegments, Sprite } from 'three';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import {
  GraticuleLayerController,
  generateParallelPoints,
  generateMeridianPoints,
  createCartographicBadge,
  TROPIC_LAT,
  POLAR_CIRCLE_LAT,
  type GlobeGraticuleDelegate,
} from '@/globe/graticule-layer';

describe('GraticuleLayerController (3D cartographic parallels & meridians)', () => {
  let mockScene: Scene;
  let mockGlobe: GlobeGraticuleDelegate;

  beforeEach(() => {
    mockScene = new Scene();
    mockGlobe = {
      scene: () => mockScene,
    };
  });

  describe('Mathematical coordinates generator', () => {
    it('generates a closed loop of points for a parallel', () => {
      const points = generateParallelPoints(0, 2, 0.0035, 100);
      // Longitude from -180 to 180 step 2 => 181 points
      expect(points.length).toBe(181);

      // Equator (lat 0): Y should be 0 in Three.js coordinates
      for (const p of points) {
        expect(p.y).toBeCloseTo(0, 3);
        const radius = Math.sqrt(p.x * p.x + p.z * p.z);
        expect(radius).toBeCloseTo(100.35, 2);
      }
    });

    it('generates meridian points from South Pole to North Pole', () => {
      const points = generateMeridianPoints(0, -88, 88, 2, 0.0035, 100);
      // From -88 to 88 step 2 => 89 points
      expect(points.length).toBe(89);

      // Prime meridian (lng 0): Z should be 0 in Globe.gl Cartesian coordinates (X = r*sin(phi), Z = 0)
      for (const p of points) {
        expect(p.z).toBeCloseTo(0, 2);
      }
    });

    it('creates cartographic badge sprite with raycast bypass', () => {
      const sprite = createCartographicBadge('0° Equator', '#00f0ff');
      expect(sprite).toBeInstanceOf(Sprite);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(sprite.raycast({} as any, [] as any)).toBeNull();
      expect(sprite.material.depthWrite).toBe(false);
      expect(sprite.material.transparent).toBe(true);
    });
  });

  describe('Controller lifecycle and store synchronization', () => {
    it('initializes empty in off mode and adds TL_GraticuleLayer with raycast bypass', () => {
      const store = createStore<AppState>(createInitialState());
      const controller = new GraticuleLayerController(mockGlobe, store);

      const group = mockScene.getObjectByName('TL_GraticuleLayer');
      expect(group).not.toBeNull();
      expect(group?.children.length).toBe(0);

      // Raycast bypass verification
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(group?.raycast({} as any, [] as any)).toBeNull();

      controller.destroy();
    });

    it('creates major lines and badges when mode is set to major', () => {
      const store = createStore<AppState>(createInitialState());
      const controller = new GraticuleLayerController(mockGlobe, store);

      store.set({ graticule: 'major' });

      const group = controller.getGroup();
      // 5 parallels (Equator, 2 Tropics, 2 Polar circles)
      // + 2 meridians (Prime meridian, Antimeridian)
      // + 7 educational badges
      // = 14 children total
      expect(group.children.length).toBe(14);

      const lines = group.children.filter(c => c instanceof Line);
      expect(lines.length).toBe(7);

      const sprites = group.children.filter(c => c instanceof Sprite);
      expect(sprites.length).toBe(7);

      // All children must bypass raycasting to preserve globe interaction
      for (const child of group.children) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(child.raycast({} as any, [] as any)).toBeNull();
      }

      controller.destroy();
    });

    it('creates major lines AND intermediate 15deg grid when mode is 15deg', () => {
      const store = createStore<AppState>(createInitialState());
      const controller = new GraticuleLayerController(mockGlobe, store);

      store.set({ graticule: '15deg' });

      const group = controller.getGroup();
      // 7 major lines + 7 badges + 1 intermediate LineSegments = 15 children
      expect(group.children.length).toBe(15);

      const segments = group.children.filter(c => c instanceof LineSegments);
      expect(segments.length).toBe(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(segments[0]?.raycast({} as any, [] as any)).toBeNull();

      controller.destroy();
    });

    it('clears all children when toggling back to off', () => {
      const store = createStore<AppState>(createInitialState());
      const controller = new GraticuleLayerController(mockGlobe, store);

      store.set({ graticule: '15deg' });
      expect(controller.getGroup().children.length).toBe(15);

      store.set({ graticule: 'off' });
      expect(controller.getGroup().children.length).toBe(0);

      controller.destroy();
    });

    it('accepts scene directly as constructor target', () => {
      const store = createStore<AppState>(createInitialState());
      const controller = new GraticuleLayerController(mockScene, store);

      expect(mockScene.getObjectByName('TL_GraticuleLayer')).not.toBeNull();
      controller.destroy();
      expect(mockScene.getObjectByName('TL_GraticuleLayer')).toBeUndefined();
    });

    it('verifies Tropic and Polar circle constant latitudes', () => {
      expect(TROPIC_LAT).toBeCloseTo(23.4365, 4);
      expect(POLAR_CIRCLE_LAT).toBeCloseTo(66.5635, 4);
      expect(TROPIC_LAT + POLAR_CIRCLE_LAT).toBeCloseTo(90, 4);
    });
  });
});
