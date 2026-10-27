import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scene } from 'three';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import {
  RouteLayerController,
  polarToCartesian,
  type GlobeRouteDelegate,
} from '@/globe/route-layer';

describe('RouteLayerController (3D spherical routes)', () => {
  let mockScene: Scene;
  let mockGlobe: GlobeRouteDelegate;

  beforeEach(() => {
    mockScene = new Scene();
    mockGlobe = {
      scene: () => mockScene,
      arcsData: vi.fn(),
      getCoords: (lat: number, lng: number, alt = 0) => {
        const v = polarToCartesian(lat, lng, alt, 100);
        return { x: v.x, y: v.y, z: v.z };
      },
    };
  });

  describe('polarToCartesian', () => {
    it('converts latitude and longitude to 3D Cartesian coordinates', () => {
      // Equator prime meridian (0, 0)
      const v0 = polarToCartesian(0, 0, 0, 100);
      expect(v0.y).toBeCloseTo(0, 2);
      expect(v0.length()).toBeCloseTo(100, 2);

      // North Pole (90, 0)
      const vNorth = polarToCartesian(90, 0, 0, 100);
      expect(vNorth.y).toBeCloseTo(100, 2);
      expect(vNorth.x).toBeCloseTo(0, 2);
      expect(vNorth.z).toBeCloseTo(0, 2);
    });
  });

  describe('RouteLayerController lifecycle and rendering', () => {
    it('initializes empty when route comparison is inactive', () => {
      const store = createStore<AppState>(createInitialState());
      const controller = new RouteLayerController(mockGlobe, store);

      expect(mockGlobe.arcsData).toHaveBeenCalledWith([]);
      controller.destroy();
    });

    it('renders single marker when only start point is set', () => {
      const store = createStore<AppState>(createInitialState());
      const controller = new RouteLayerController(mockGlobe, store);

      store.set({
        routeComparison: {
          active: true,
          from: { lat: 52.23, lng: 21.01, label: { pl: 'Warszawa', en: 'Warsaw' } },
          to: null,
        },
      });

      // Should have 1 marker in scene
      const group = mockScene.getObjectByName('TL_RouteLayer');
      expect(group).not.toBeNull();
      expect(group?.children.length).toBe(1);

      controller.destroy();
    });

    it('renders 3D arc, orthodrome track, loxodrome track, and markers when both endpoints are set', () => {
      const store = createStore<AppState>(createInitialState());
      const controller = new RouteLayerController(mockGlobe, store);

      store.set({
        routeComparison: {
          active: true,
          from: { lat: 52.23, lng: 21.01, label: { pl: 'Warszawa', en: 'Warsaw' } },
          to: { lat: 35.68, lng: 139.76, label: { pl: 'Tokio', en: 'Tokyo' } },
        },
      });

      // 1. Arc data called with start and end
      expect(mockGlobe.arcsData).toHaveBeenCalledWith([
        {
          startLat: 52.23,
          startLng: 21.01,
          endLat: 35.68,
          endLng: 139.76,
          color: '#00f0ff',
        },
      ]);

      // 2. Scene should contain:
      // - 1 orthodrome line
      // - 1 loxodrome line
      // - 2 endpoint markers (start and destination)
      const group = mockScene.getObjectByName('TL_RouteLayer');
      expect(group).not.toBeNull();
      expect(group?.children.length).toBe(4);

      // Verify lines have positions
      const lines = group?.children.filter(c => c.type === 'Line');
      expect(lines?.length).toBe(2);

      controller.destroy();
    });

    it('clears all meshes and arcs when route comparison is deactivated', () => {
      const store = createStore<AppState>(createInitialState());
      const controller = new RouteLayerController(mockGlobe, store);

      store.set({
        routeComparison: {
          active: true,
          from: { lat: 52.23, lng: 21.01 },
          to: { lat: 35.68, lng: 139.76 },
        },
      });

      const group = mockScene.getObjectByName('TL_RouteLayer');
      expect(group?.children.length).toBe(4);

      // Deactivate
      store.set({ routeComparison: null });
      expect(group?.children.length).toBe(0);
      expect(mockGlobe.arcsData).toHaveBeenLastCalledWith([]);

      controller.destroy();
    });

    it('cleans up scene and subscriptions on destroy', () => {
      const store = createStore<AppState>(createInitialState());
      const controller = new RouteLayerController(mockGlobe, store);

      expect(mockScene.getObjectByName('TL_RouteLayer')).not.toBeNull();

      controller.destroy();
      expect(mockScene.getObjectByName('TL_RouteLayer')).toBeUndefined();
    });
  });
});
