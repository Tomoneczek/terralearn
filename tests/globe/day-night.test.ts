import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import { DayNightController } from '@/globe/day-night';
import type { Vector3 } from 'three';

// Mock Three.js TextureLoader
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

describe('DayNightController and Terminator Shader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes ShaderMaterial with proper uniforms and initial state', () => {
    const store = createStore({
      ...createInitialState(),
      dayNight: false,
    });

    const controller = new DayNightController(store);
    const material = controller.getMaterial();

    expect(material.uniforms.uDayTexture).toBeDefined();
    expect(material.uniforms.uNightTexture).toBeDefined();
    expect(material.uniforms.uSunDirection).toBeDefined();
    expect(material.uniforms.uEnabled?.value).toBe(0.0);

    controller.destroy();
  });

  it('updates uEnabled uniform when store dayNight state changes', () => {
    const store = createStore({
      ...createInitialState(),
      dayNight: false,
    });

    const controller = new DayNightController(store);
    const material = controller.getMaterial();

    expect(material.uniforms.uEnabled?.value).toBe(0.0);

    store.set(s => ({ ...s, dayNight: true }));
    expect(material.uniforms.uEnabled?.value).toBe(1.0);

    store.set(s => ({ ...s, dayNight: false }));
    expect(material.uniforms.uEnabled?.value).toBe(0.0);

    controller.destroy();
  });

  it('updates sun direction vector based on astronomical date', () => {
    const store = createStore(createInitialState());
    const controller = new DayNightController(store);
    const material = controller.getMaterial();

    const sunVec = material.uniforms.uSunDirection?.value as Vector3;
    const initialY = sunVec.y;

    // June 21 -> Northern summer solstice (y > 0)
    controller.updateSun(new Date(Date.UTC(2026, 5, 21, 12, 0, 0)));
    expect(sunVec.y).toBeGreaterThan(0.3);

    // Dec 21 -> Southern summer solstice / Northern winter (y < 0)
    controller.updateSun(new Date(Date.UTC(2026, 11, 21, 12, 0, 0)));
    expect(sunVec.y).toBeLessThan(-0.3);

    expect(sunVec.y).not.toBe(initialY);

    controller.destroy();
  });
});
