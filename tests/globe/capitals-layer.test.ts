import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BufferAttribute,
  Color,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { createStore, createInitialState } from '@/state/store';
import type { AppState, Store } from '@/state/types';
import type { GeoFeature } from '@/globe/data-loader';
import { HoverArbiter } from '@/globe/hover-arbiter';
import {
  CAPITALS_FRAGMENT_SHADER,
  CAPITALS_VERTEX_SHADER,
  CAPITAL_ALTITUDE,
  CapitalsLayer,
} from '@/globe/capitals-layer';
import { latLngToVector } from '@/globe/highlight-overlay';

const R = 100;
const WIDTH = 1280;
const HEIGHT = 800;

function capital(id: string, lng: number, lat: number, population: number): GeoFeature {
  return {
    type: 'Feature',
    id,
    properties: {
      id,
      kind: 'capital',
      layerId: 'capitals',
      name_pl: id,
      name_en: id,
      rank: { population },
    },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
}

const WARSAW = capital('warsaw', 21.0, 52.2, 1_800_000);
const BERLIN = capital('berlin', 13.4, 52.5, 3_600_000);
const CAIRO = capital('cairo', 31.2, 30.0, 9_500_000);
const TOKYO = capital('tokyo', 139.7, 35.7, 14_000_000);

function cameraAt(lat: number, lng: number, altitude: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 2000);
  camera.position.copy(latLngToVector(lat, lng, R * (1 + altitude)));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function fakeRenderer(): WebGLRenderer {
  return {
    getSize: (target: Vector2) => target.set(WIDTH, HEIGHT),
    getPixelRatio: () => 2,
  } as unknown as WebGLRenderer;
}

function renderOnce(layer: CapitalsLayer, camera: PerspectiveCamera): void {
  layer
    .getMesh()
    .onBeforeRender(
      fakeRenderer(),
      new Scene(),
      camera,
      layer.getMesh().geometry,
      layer.getMaterial(),
      null as never,
    );
}

describe('CapitalsLayer', () => {
  let store: Store<AppState>;
  let scene: Scene;
  let container: HTMLElement;
  let arbiter: HoverArbiter;
  let camera: PerspectiveCamera;
  let layer: CapitalsLayer;

  const move = (x: number, y: number): void => {
    container.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
  };

  beforeEach(() => {
    store = createStore<AppState>(createInitialState());
    scene = new Scene();
    container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
    arbiter = new HoverArbiter(store, container);
    camera = cameraAt(52.2, 21.0, 1.0); // looking straight at Warsaw, zoomed in
    layer = new CapitalsLayer({ scene, store, arbiter, container, getCamera: () => camera });
    layer.setFeatures([WARSAW, BERLIN, CAIRO, TOKYO]);
  });

  afterEach(() => layer.destroy());

  describe('geometry', () => {
    it('adds one point cloud to the scene, hidden until it has capitals', () => {
      expect(scene.children).toContain(layer.getMesh());
      expect(layer.getMesh().visible).toBe(true);
      expect(layer.getItemCount()).toBe(4);

      layer.setFeatures([]);
      expect(layer.getMesh().visible).toBe(false);
      expect(layer.getItemCount()).toBe(0);
    });

    it('places every capital just above the countries layer', () => {
      const position = layer.getMesh().geometry.getAttribute('position');
      expect(position.count).toBe(4);
      for (let i = 0; i < position.count; i++) {
        const radius = Math.hypot(position.getX(i), position.getY(i), position.getZ(i));
        expect(radius).toBeCloseTo(R * (1 + CAPITAL_ALTITUDE), 3);
      }
    });

    it('gives bigger cities a larger rank scale', () => {
      const rank = layer.getMesh().geometry.getAttribute('aRank');
      expect(rank.getX(3)).toBeGreaterThan(rank.getX(0)); // Tokyo vs Warsaw
    });

    it('never takes part in globe.gl picking', () => {
      const raycaster = new Raycaster(new Vector3(0, 0, 400), new Vector3(0, 0, -1));
      expect(raycaster.intersectObject(layer.getMesh(), true)).toHaveLength(0);
    });
  });

  describe('shader', () => {
    it('implements the spotlight, zoom and horizon fades', () => {
      expect(CAPITALS_VERTEX_SHADER).toContain('smoothstep(rFull, rFade, distPx)');
      expect(CAPITALS_VERTEX_SHADER).toContain('uZoomFade');
      expect(CAPITALS_VERTEX_SHADER).toContain('aRank');
      expect(CAPITALS_VERTEX_SHADER).toContain('cameraPosition');
      expect(CAPITALS_VERTEX_SHADER).toContain('gl_PointSize');
      expect(CAPITALS_FRAGMENT_SHADER).toContain('discard');
    });

    it('feeds viewport, pixel ratio and zoom factor on every render', () => {
      renderOnce(layer, camera);
      const u = layer.getMaterial().uniforms;
      expect((u.uViewport!.value as Vector2).toArray()).toEqual([WIDTH, HEIGHT]);
      expect(u.uPixelRatio!.value).toBe(2);
      expect(u.uZoomFade!.value).toBe(1);

      renderOnce(layer, cameraAt(52.2, 21.0, 2.2));
      expect(u.uZoomFade!.value).toBe(0);
    });

    it('scales the marker with zoom in the shader and feeds the scaling uniforms', () => {
      expect(CAPITALS_VERTEX_SHADER).toContain('uPointZoomScale');
      expect(CAPITALS_VERTEX_SHADER).toContain('uPointCloseAltitude');
      expect(CAPITALS_FRAGMENT_SHADER).toContain('ring'); // light ring for contrast

      renderOnce(layer, camera);
      const u = layer.getMaterial().uniforms;
      expect(u.uPointZoomScale!.value).toBe(layer.params.pointZoomScale);
      expect(u.uPointCloseAltitude!.value).toBe(layer.params.pointScaleCloseAltitude);
      expect(u.uZoomFullAltitude!.value).toBe(layer.params.zoomFullAltitude);
    });

    it('follows live parameter changes', () => {
      layer.params.fadeRadius = 0.5;
      layer.params.pointSize = 12;
      renderOnce(layer, camera);
      const u = layer.getMaterial().uniforms;
      expect(u.uFadeRadius!.value).toBe(0.5);
      expect(u.uPointSize!.value).toBe(12);
    });
  });

  describe('screen-space spotlight (CPU mirror)', () => {
    const byId = (items: ReturnType<CapitalsLayer['computeScreenItems']>, id: string) =>
      items.find(i => i.id === id)!;

    it('lights capitals near the screen center and hides the far side of the globe', () => {
      const items = layer.computeScreenItems(camera, WIDTH, HEIGHT);

      const warsaw = byId(items, 'warsaw');
      expect(warsaw.distPx).toBeLessThan(2);
      expect(warsaw.opacity).toBe(1);
      expect(warsaw.x).toBeCloseTo(WIDTH / 2, 0);
      expect(warsaw.y).toBeCloseTo(HEIGHT / 2, 0);

      expect(byId(items, 'berlin').opacity).toBeGreaterThan(byId(items, 'cairo').opacity);
      expect(byId(items, 'tokyo').opacity).toBe(0);
    });

    it('shows nothing while the whole globe is in view', () => {
      const items = layer.computeScreenItems(cameraAt(52.2, 21.0, 2.2), WIDTH, HEIGHT);
      expect(items.every(i => i.opacity === 0)).toBe(true);
    });

    it('keeps the selected capital visible regardless of the spotlight', () => {
      store.set({ selection: { id: 'cairo', layerId: 'capitals', kind: 'capital' } });
      const items = layer.computeScreenItems(camera, WIDTH, HEIGHT);
      expect(byId(items, 'cairo').opacity).toBe(1);
      // ...but not through the globe
      store.set({ selection: { id: 'tokyo', layerId: 'capitals', kind: 'capital' } });
      expect(byId(layer.computeScreenItems(camera, WIDTH, HEIGHT), 'tokyo').opacity).toBe(0);
    });

    it('mirrors hover/selection into the per-point state attribute', () => {
      store.set({
        hovered: { id: 'berlin', layerId: 'capitals', kind: 'capital' },
        selection: { id: 'cairo', layerId: 'capitals', kind: 'capital' },
      });
      const state = layer.getMesh().geometry.getAttribute('aState');
      expect([state.getX(0), state.getX(1), state.getX(2), state.getX(3)]).toEqual([0, 1, 2, 0]);
    });
  });

  describe('picking and pointer interaction', () => {
    it('picks the capital under the pointer and ignores invisible ones', () => {
      expect(layer.pick({ x: WIDTH / 2, y: HEIGHT / 2 }, camera, WIDTH, HEIGHT)).toBe('warsaw');
      expect(layer.pick({ x: 5, y: 5 }, camera, WIDTH, HEIGHT)).toBeNull();

      const zoomedOut = cameraAt(52.2, 21.0, 2.2);
      expect(layer.pick({ x: WIDTH / 2, y: HEIGHT / 2 }, zoomedOut, WIDTH, HEIGHT)).toBeNull();
    });

    // The bigger the zoomed-in marker, the larger the area that selects it.
    it('widens the hit area together with the zoomed-in marker', () => {
      // Pointer 13 px from Warsaw's marker: outside the base 12 px radius, inside the grown one
      const pointer = { x: WIDTH / 2 + 13, y: HEIGHT / 2 };
      const farCamera = cameraAt(52.2, 21.0, 1.1);
      const closeCamera = cameraAt(52.2, 21.0, 0.25);

      expect(layer.pick(pointer, farCamera, WIDTH, HEIGHT)).toBeNull();
      expect(layer.pick(pointer, closeCamera, WIDTH, HEIGHT)).toBe('warsaw');
    });

    it('claims the hover when the pointer is over a capital and releases it elsewhere', () => {
      move(WIDTH / 2, HEIGHT / 2);
      expect(arbiter.isCapitalClaimed()).toBe(true);
      expect(store.get().hovered?.id).toBe('warsaw');
      expect(store.get().hovered?.kind).toBe('capital');

      move(20, 20);
      expect(arbiter.isCapitalClaimed()).toBe(false);
      expect(store.get().hovered).toBeNull();
    });

    it('releases the hover when the pointer leaves the globe', () => {
      move(WIDTH / 2, HEIGHT / 2);
      container.dispatchEvent(new Event('pointerleave'));
      expect(arbiter.isCapitalClaimed()).toBe(false);
    });

    it('selects the hovered capital on click', () => {
      move(WIDTH / 2, HEIGHT / 2);
      container.dispatchEvent(
        new MouseEvent('pointerdown', { clientX: WIDTH / 2, clientY: HEIGHT / 2 }),
      );
      container.dispatchEvent(new MouseEvent('click', { clientX: WIDTH / 2, clientY: HEIGHT / 2 }));
      expect(store.get().selection?.id).toBe('warsaw');
    });

    it('ignores a click that ended a drag', () => {
      move(WIDTH / 2, HEIGHT / 2);
      container.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100 }));
      container.dispatchEvent(new MouseEvent('click', { clientX: WIDTH / 2, clientY: HEIGHT / 2 }));
      expect(store.get().selection).toBeNull();
    });

    it('does nothing on a click away from any capital', () => {
      move(20, 20);
      container.dispatchEvent(new MouseEvent('pointerdown', { clientX: 20, clientY: 20 }));
      container.dispatchEvent(new MouseEvent('click', { clientX: 20, clientY: 20 }));
      expect(store.get().selection).toBeNull();
    });

    it('re-targets the claim on the next update when the camera moved another capital under a still pointer', () => {
      move(WIDTH / 2, HEIGHT / 2);
      expect(store.get().hovered?.id).toBe('warsaw');

      // pan to Cairo without moving the mouse: Cairo now sits under the cursor
      renderOnce(layer, cameraAt(30.0, 31.2, 1.0));
      expect(arbiter.isCapitalClaimed()).toBe(true);
      expect(store.get().hovered?.id).toBe('cairo');
    });

    it('drops the claim on the next update when nothing is left under a still pointer', () => {
      move(WIDTH / 2, HEIGHT / 2);
      expect(arbiter.isCapitalClaimed()).toBe(true);

      // pan to the Gulf of Guinea: no capital under the cursor any more
      renderOnce(layer, cameraAt(0, 0, 1.0));
      expect(arbiter.isCapitalClaimed()).toBe(false);
      expect(store.get().hovered).toBeNull();
    });

    it('keeps a hovered capital alive under the cursor while zooming out', () => {
      move(WIDTH / 2, HEIGHT / 2);
      renderOnce(layer, cameraAt(52.2, 21.0, 2.2));
      expect(arbiter.isCapitalClaimed()).toBe(true);
    });
  });

  describe('color overrides', () => {
    const colorOf = (i: number): Color => {
      const attr = layer.getMesh().geometry.getAttribute('aColor') as BufferAttribute;
      return new Color(attr.getX(i), attr.getY(i), attr.getZ(i));
    };

    it('recolors single capitals and restores the default', () => {
      const original = colorOf(0).getHex();
      layer.setColors({ warsaw: 'hsl(120, 60%, 45%)' });
      expect(colorOf(0).getHex()).not.toBe(original);
      expect(colorOf(1).getHex()).toBe(original); // untouched

      layer.setColors(null);
      expect(colorOf(0).getHex()).toBe(original);
    });
  });

  describe('lifecycle', () => {
    it('removes the points and stops reacting to the pointer after destroy', () => {
      layer.destroy();
      expect(scene.children).not.toContain(layer.getMesh());
      move(WIDTH / 2, HEIGHT / 2);
      expect(arbiter.isCapitalClaimed()).toBe(false);
    });

    it('works without a scene or container (mock environments)', () => {
      const detached = new CapitalsLayer({
        scene: null,
        store,
        arbiter,
        container: null,
        getCamera: () => null,
      });
      expect(() => detached.setFeatures([WARSAW])).not.toThrow();
      detached.destroy();
    });
  });
});
