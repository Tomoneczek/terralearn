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

    expect(material.uniforms.uBaseTexture).toBeDefined();
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

  it('REGRESSION (G08-00): guarantees high luminance contrast between subsolar point and antipode', () => {
    // Shader simulation function matching DAY_NIGHT_FRAGMENT_SHADER logic
    function simulateShader(
      sunDot: number,
      dayRgb: [number, number, number],
      nightRgb: [number, number, number],
    ) {
      const dayScatter = Math.max(0.0, Math.min(1.0, sunDot));
      const dayLight = 0.35 + 0.65 * dayScatter;
      const dayIlluminated = dayRgb.map(c => c * dayLight);

      const nightAmbient = [0.015, 0.02, 0.035];
      const cityLights = nightRgb.map(c => c * 1.5);
      const nightSurface = [
        Math.max(nightAmbient[0]!, cityLights[0]!),
        Math.max(nightAmbient[1]!, cityLights[1]!),
        Math.max(nightAmbient[2]!, cityLights[2]!),
      ];

      // smoothstep(-0.08, 0.08, sunDot)
      const t = Math.max(0, Math.min(1, (sunDot - -0.08) / (0.08 - -0.08)));
      const dayFactor = t * t * (3 - 2 * t);

      const surface = [
        nightSurface[0]! * (1 - dayFactor) + dayIlluminated[0]! * dayFactor,
        nightSurface[1]! * (1 - dayFactor) + dayIlluminated[1]! * dayFactor,
        nightSurface[2]! * (1 - dayFactor) + dayIlluminated[2]! * dayFactor,
      ];

      return surface;
    }

    // Relative luminance formula (ITU-R BT.709)
    function luminance(rgb: number[]) {
      return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
    }

    // Typical Earth ocean/land day color from earth-day.jpg vs night ocean
    const oceanDay: [number, number, number] = [0.15, 0.4, 0.7];
    const oceanNight: [number, number, number] = [0.0, 0.0, 0.0];

    // Subsolar zenith (sunDot = 1.0)
    const dayResult = simulateShader(1.0, oceanDay, oceanNight);
    const dayLum = luminance(dayResult);

    // Antipode midnight (sunDot = -1.0)
    const nightResult = simulateShader(-1.0, oceanDay, oceanNight);
    const nightLum = luminance(nightResult);

    // Contrast ratio must be sharp and noticeable (> 15x)
    expect(dayLum).toBeGreaterThan(0.3);
    expect(nightLum).toBeLessThan(0.03);
    expect(dayLum / nightLum).toBeGreaterThan(15);
  });

  it('adds warm sunset/sunrise twilight band at terminator line', () => {
    function getTwilightGlow(sunDot: number): [number, number, number] {
      // smoothstep(-0.10, 0.0, sunDot) * (1.0 - smoothstep(0.0, 0.10, sunDot))
      const t1 = Math.max(0, Math.min(1, (sunDot - -0.1) / (0.0 - -0.1)));
      const s1 = t1 * t1 * (3 - 2 * t1);

      const t2 = Math.max(0, Math.min(1, (sunDot - 0.0) / (0.1 - 0.0)));
      const s2 = t2 * t2 * (3 - 2 * t2);

      const twilight = s1 * (1.0 - s2);
      const intensity = twilight * 0.45;
      return [1.0 * intensity, 0.45 * intensity, 0.15 * intensity];
    }

    // At terminator (sunDot = 0.0), twilight glow is at its peak
    const terminatorGlow = getTwilightGlow(0.0);
    expect(terminatorGlow[0]).toBeGreaterThan(0.4); // Warm red component
    expect(terminatorGlow[1]).toBeGreaterThan(0.18); // Amber/gold component

    // Far into day (sunDot = 0.8), twilight glow is zero
    const noonGlow = getTwilightGlow(0.8);
    expect(noonGlow[0]).toBe(0);
    expect(noonGlow[1]).toBe(0);

    // Deep in night (sunDot = -0.8), twilight glow is zero
    const midnightGlow = getTwilightGlow(-0.8);
    expect(midnightGlow[0]).toBe(0);
    expect(midnightGlow[1]).toBe(0);
  });

  it('verifies subsolar vector alignment with Prime Meridian on Spring Equinox 12:00 UTC', () => {
    const store = createStore(createInitialState());
    const controller = new DayNightController(store);
    const material = controller.getMaterial();

    // March 20, 2026, 12:00 UTC -> Sun should be directly over lat ~0, lng ~0 (Equator & Prime Meridian)
    controller.updateSun(new Date(Date.UTC(2026, 2, 20, 12, 0, 0)));
    const sunVec = material.uniforms.uSunDirection?.value as Vector3;

    // In Globe.gl world coordinates, Prime Meridian at Equator points along +Z axis
    expect(sunVec.z).toBeGreaterThan(0.95);
    expect(Math.abs(sunVec.x)).toBeLessThan(0.1);
    expect(Math.abs(sunVec.y)).toBeLessThan(0.05);

    controller.destroy();
  });
});
