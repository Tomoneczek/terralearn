import { describe, it, expect } from 'vitest';
import { AdditiveBlending, PerspectiveCamera, Scene, Vector2, Vector3 } from 'three';
import {
  SUN_BILLBOARD_DISTANCE,
  SunController,
  discWorldDiameter,
  minDiscWorldDiameter,
  sunBillboardCenter,
} from '@/globe/sun';
import { DayNightController } from '@/globe/day-night';
import { calculateSunAngularDiameterDeg } from '@/geo/solar';
import { createStore, createInitialState } from '@/state/store';
import type { AppState, Store } from '@/state/types';

const DEG = 180 / Math.PI;
const JANUARY = new Date(Date.UTC(2026, 0, 3, 17));
const JULY = new Date(Date.UTC(2026, 6, 6, 18));

function fakeRenderer(heightPx: number): { getSize(target: Vector2): Vector2 } {
  return { getSize: target => target.set(heightPx * 1.5, heightPx) };
}

function setup(state: Partial<AppState> = {}): {
  scene: Scene;
  store: Store<AppState>;
  sun: SunController;
  sunDirection: Vector3;
} {
  const scene = new Scene();
  const store = createStore<AppState>({
    ...createInitialState(),
    dayNight: true,
    theme: 'dark',
    ...state,
  });
  const sunDirection = new Vector3(1, 0.5, -0.3).normalize();
  const sun = new SunController(scene, store, { sunDirection, date: JANUARY });
  return { scene, store, sun, sunDirection };
}

/** Angle (deg) subtended at the camera by the rendered disc. */
function renderedDiscAngleDeg(sun: SunController, camera: PerspectiveCamera): number {
  const mesh = sun.getMesh();
  const discDiameter = mesh.scale.x / sun.params.glowExtent;
  const distance = mesh.position.distanceTo(camera.position);
  return 2 * Math.atan(discDiameter / 2 / distance) * DEG;
}

describe('sun geometry helpers', () => {
  it('anchors the billboard at a fixed distance from the camera along the sun direction', () => {
    const center = sunBillboardCenter(new Vector3(10, 20, 30), new Vector3(0, 0, 2), 100);
    expect(center.toArray()).toEqual([10, 20, 130]);
  });

  it('converts an angular diameter into a world diameter at the billboard distance', () => {
    const d = discWorldDiameter(0.533, 1000);
    expect(2 * Math.atan(d / 2 / 1000) * DEG).toBeCloseTo(0.533, 6);
  });

  it('computes the world size that covers a minimum number of pixels', () => {
    // 90° FOV → view height at distance D is 2D; 2 px of 1000 px → 0.004 D
    expect(minDiscWorldDiameter(90, 1000, 2, 1000)).toBeCloseTo(4, 6);
    expect(minDiscWorldDiameter(90, 0)).toBe(0);
  });
});

describe('SunController', () => {
  it('adds an additive, depth-tested, non-writing, non-pickable billboard to the scene', () => {
    const { scene, sun } = setup();
    const mesh = sun.getMesh();
    expect(scene.children).toContain(mesh);
    expect(mesh.frustumCulled).toBe(false);

    const material = sun.getMaterial();
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);

    const hits: unknown[] = [];
    // @ts-expect-error verifying no-op raycast
    mesh.raycast({}, hits);
    expect(hits).toHaveLength(0);
    sun.destroy();
  });

  it('keeps the Sun in the same sky direction wherever the camera is (no parallax)', () => {
    const { sun, sunDirection } = setup();
    for (const position of [new Vector3(0, 0, 300), new Vector3(-9000, 2000, 1500)]) {
      const camera = new PerspectiveCamera(50, 1.5, 0.05, 125_000);
      camera.position.copy(position);
      camera.lookAt(0, 0, 0);
      sun.place(camera);

      const seen = sun.getMesh().position.clone().sub(camera.position);
      expect(seen.length()).toBeCloseTo(SUN_BILLBOARD_DISTANCE, 3);
      expect(seen.normalize().angleTo(sunDirection)).toBeLessThan(1e-9);
      expect(sun.getMesh().quaternion.equals(camera.quaternion)).toBe(true);
    }
    sun.destroy();
  });

  it('renders the disc at the real angular diameter for the date', () => {
    const { sun } = setup();
    const camera = new PerspectiveCamera(50, 1.5, 0.05, 125_000);
    camera.position.set(0, 0, 400);

    sun.place(camera, fakeRenderer(1080));
    const january = calculateSunAngularDiameterDeg(JANUARY);
    expect(renderedDiscAngleDeg(sun, camera)).toBeCloseTo(january, 6);

    sun.setDate(JULY);
    sun.place(camera, fakeRenderer(1080));
    expect(renderedDiscAngleDeg(sun, camera)).toBeCloseTo(calculateSunAngularDiameterDeg(JULY), 6);
    expect(renderedDiscAngleDeg(sun, camera)).toBeLessThan(january);

    sun.params.discScale = 4;
    sun.place(camera, fakeRenderer(1080));
    expect(renderedDiscAngleDeg(sun, camera)).toBeCloseTo(4 * sun.getAngularDiameterDeg(), 4);
    sun.destroy();
  });

  it('never draws the disc smaller than the minimum pixel size on tiny viewports', () => {
    const { sun } = setup();
    const camera = new PerspectiveCamera(50, 1.5, 0.05, 125_000);
    sun.place(camera, fakeRenderer(100));
    const discDiameter = sun.getMesh().scale.x / sun.params.glowExtent;
    expect(discDiameter).toBeCloseTo(minDiscWorldDiameter(50, 100), 6);
    expect(discDiameter).toBeGreaterThan(discWorldDiameter(sun.getAngularDiameterDeg()));
    sun.destroy();
  });

  it('follows the shared day/night sun direction and date updates', () => {
    const store = createStore({ ...createInitialState(), dayNight: true });
    const dayNight = new DayNightController(store);
    const sun = new SunController(null, store, {
      sunDirection: dayNight.getSunDirection(),
      date: JANUARY,
    });
    const unsubscribe = dayNight.onSunUpdate(date => sun.setDate(date));

    dayNight.updateSun(JULY);
    expect(sun.getAngularDiameterDeg()).toBeCloseTo(calculateSunAngularDiameterDeg(JULY), 9);

    const camera = new PerspectiveCamera();
    sun.place(camera);
    const seen = sun.getMesh().position.clone().sub(camera.position).normalize();
    expect(seen.angleTo(dayNight.getSunDirection())).toBeLessThan(1e-9);

    unsubscribe();
    dayNight.updateSun(JANUARY);
    expect(sun.getAngularDiameterDeg()).toBeCloseTo(calculateSunAngularDiameterDeg(JULY), 9);

    sun.destroy();
    dayNight.destroy();
  });

  it('is visible only with day/night on and outside the classic atlas theme', () => {
    const { store, sun } = setup();
    expect(sun.getMesh().visible).toBe(true);

    store.set({ dayNight: false });
    expect(sun.getMesh().visible).toBe(false);

    store.set({ dayNight: true, theme: 'classic' });
    expect(sun.getMesh().visible).toBe(false);

    store.set({ theme: 'dark' });
    expect(sun.getMesh().visible).toBe(true);
    sun.destroy();

    const hidden = setup({ dayNight: false });
    expect(hidden.sun.getMesh().visible).toBe(false);
    hidden.sun.destroy();
  });

  it('removes itself from the scene and stops reacting to the store on destroy', () => {
    const { scene, store, sun } = setup();
    sun.destroy();
    expect(scene.children).not.toContain(sun.getMesh());
    store.set({ dayNight: false });
    expect(sun.getMesh().visible).toBe(true);
  });
});
