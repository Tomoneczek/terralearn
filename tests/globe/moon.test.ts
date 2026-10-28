import { describe, it, expect } from 'vitest';
import { Scene, Vector3 } from 'three';
import { MoonController } from '@/globe/moon';
import { DayNightController, MOON_RADIUS_SCENE } from '@/globe/day-night';
import { calculateMoonScenePosition, MOON_RADIUS_KM } from '@/geo/lunar';
import { calculateSunDirection } from '@/geo/solar';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';

const DATE = new Date(Date.UTC(2026, 9, 28, 12));

function setup(state: Partial<AppState> = {}): {
  scene: Scene;
  store: ReturnType<typeof createStore<AppState>>;
  dayNight: DayNightController;
  moon: MoonController;
} {
  const scene = new Scene();
  const store = createStore<AppState>({
    ...createInitialState(),
    dayNight: true,
    theme: 'dark',
    ...state,
  });
  const dayNight = new DayNightController(store, { date: DATE });
  const moon = new MoonController(scene, store, {
    moonPosition: dayNight.getMoonPosition(),
    sunDirection: dayNight.getSunDirection(),
    date: DATE,
  });
  dayNight.onSunUpdate(date => moon.setDate(date));
  return { scene, store, dayNight, moon };
}

describe('MoonController', () => {
  it('is a real-size sphere at the real Moon position', () => {
    const { scene, moon, dayNight } = setup();
    const mesh = moon.getMesh();
    expect(scene.children).toContain(mesh);
    expect(MOON_RADIUS_SCENE).toBeCloseTo((MOON_RADIUS_KM / 6371) * 100, 9);
    mesh.geometry.computeBoundingSphere();
    expect(mesh.geometry.boundingSphere?.radius).toBeCloseTo(MOON_RADIUS_SCENE, 4);
    expect(mesh.position.toArray()).toEqual(calculateMoonScenePosition(DATE));

    const hits: unknown[] = [];
    // @ts-expect-error verifying no-op raycast
    mesh.raycast({}, hits);
    expect(hits).toHaveLength(0);
    moon.destroy();
    dayNight.destroy();
  });

  it('turns the near side (texture center, local +X) towards the Earth with north up', () => {
    const { moon, dayNight } = setup();
    const mesh = moon.getMesh();
    const nearSide = new Vector3(1, 0, 0).applyQuaternion(mesh.quaternion);
    const toEarth = mesh.position.clone().negate().normalize();
    expect(nearSide.angleTo(toEarth)).toBeLessThan(1e-9);
    // Local +Y (lunar north) stays in the northern sky hemisphere
    expect(new Vector3(0, 1, 0).applyQuaternion(mesh.quaternion).y).toBeGreaterThan(0.8);
    moon.destroy();
    dayNight.destroy();
  });

  it('follows the sky time through the shared day/night state', () => {
    const { moon, dayNight } = setup();
    const later = new Date(DATE.getTime() + 6 * 3600e3);
    dayNight.updateSun(later);
    expect(moon.getMesh().position.toArray()).toEqual(calculateMoonScenePosition(later));
    const sun = moon.getMaterial().uniforms.uSunDirection?.value as Vector3;
    expect(sun.toArray()).toEqual(calculateSunDirection(later));
    moon.destroy();
    dayNight.destroy();
  });

  it('is visible only with day/night on and outside the classic atlas theme', () => {
    const { store, moon, dayNight } = setup();
    expect(moon.getMesh().visible).toBe(true);
    store.set({ dayNight: false });
    expect(moon.getMesh().visible).toBe(false);
    store.set({ dayNight: true, theme: 'classic' });
    expect(moon.getMesh().visible).toBe(false);
    moon.destroy();
    dayNight.destroy();
  });

  it('removes itself from the scene on destroy', () => {
    const { scene, store, moon, dayNight } = setup();
    moon.destroy();
    expect(scene.children).not.toContain(moon.getMesh());
    store.set({ dayNight: false });
    expect(moon.getMesh().visible).toBe(true);
    dayNight.destroy();
  });
});
