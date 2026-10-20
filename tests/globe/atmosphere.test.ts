import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scene, Vector3, Color, BackSide, AdditiveBlending, Mesh } from 'three';
import {
  AtmosphereController,
  ATMOSPHERE_FRAGMENT_SHADER,
  TWILIGHT_FACING_MIN,
  TWILIGHT_FACING_MAX,
  TWILIGHT_STRENGTH,
} from '@/globe/atmosphere';
import { DayNightController } from '@/globe/day-night';
import { createStore, createInitialState } from '@/state/store';

describe('AtmosphereController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates atmosphere mesh with BackSide, AdditiveBlending, and raycast bypass', () => {
    const scene = new Scene();
    const store = createStore(createInitialState());
    const atmosphere = new AtmosphereController(scene, store, {
      altitude: 0.15,
      globeRadius: 100,
    });

    const mesh = atmosphere.getMesh();
    expect(mesh).toBeDefined();
    expect(mesh).toBeInstanceOf(Mesh);
    expect(mesh?.name).toBe('atmosphere-shell');

    const material = atmosphere.getMaterial();
    expect(material.side).toBe(BackSide);
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);

    // CRITICAL: raycast bypass must be present
    expect(typeof mesh?.raycast).toBe('function');
    const fakeRaycaster = {} as unknown;
    const intersects: unknown[] = [];
    // @ts-expect-error verifying no-op
    mesh?.raycast(fakeRaycaster, intersects);
    expect(intersects).toHaveLength(0);

    atmosphere.destroy();
  });

  it('shares Vector3 reference with DayNightController as single source of truth', () => {
    const store = createStore(createInitialState());
    const dayNight = new DayNightController(store);
    const scene = new Scene();

    const sunDir = dayNight.getSunDirection();
    const atmosphere = new AtmosphereController(scene, store, {
      sunDirection: sunDir,
    });

    const atmoSunUniform = atmosphere.getMaterial().uniforms.uSunDirection?.value as Vector3;
    expect(atmoSunUniform).toBe(sunDir);

    // Mutating dayNight sun direction mutates atmosphere uniform directly
    dayNight.updateSun(new Date('2026-06-21T12:00:00Z'));
    expect(atmoSunUniform.x).toBeCloseTo(sunDir.x, 5);
    expect(atmoSunUniform.y).toBeCloseTo(sunDir.y, 5);
    expect(atmoSunUniform.z).toBeCloseTo(sunDir.z, 5);

    atmosphere.destroy();
    dayNight.destroy();
  });

  it('reacts to AppState.dayNight store toggles', () => {
    const store = createStore({ ...createInitialState(), dayNight: true });
    const atmosphere = new AtmosphereController(new Scene(), store);

    const uniform = atmosphere.getMaterial().uniforms.uDayNight;
    expect(uniform?.value).toBe(1.0);

    store.set({ dayNight: false });
    expect(uniform?.value).toBe(0.0);

    store.set({ dayNight: true });
    expect(uniform?.value).toBe(1.0);

    atmosphere.destroy();
  });

  it('calculates day Rayleigh scattering, golden terminator, and night shadow darkening', () => {
    const dayColor = new Color('#4aa3ff'); // rgb(0.29, 0.64, 1.0)
    const twilightColor = new Color('#ff8833'); // rgb(1.0, 0.53, 0.2)
    const nightColor = new Color('#050814'); // rgb(0.02, 0.03, 0.08)

    // Helper evaluating shader color logic in JS matching GLSL
    function evaluateAtmosphereColor(sunDot: number, dayNightEnabled: boolean) {
      if (!dayNightEnabled) {
        return dayColor;
      }
      const smoothstep = (min: number, max: number, x: number) => {
        const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
        return t * t * (3 - 2 * t);
      };

      const dayFactor = smoothstep(-0.08, 0.08, sunDot);
      const atmo = new Color().lerpColors(nightColor, dayColor, dayFactor);

      const twilight = smoothstep(-0.12, 0.0, sunDot) * (1.0 - smoothstep(0.0, 0.12, sunDot));
      atmo.lerp(twilightColor, twilight * 0.85);

      return atmo;
    }

    // 1. Day side (sunDot = 0.8): bright azure blue
    const dayResult = evaluateAtmosphereColor(0.8, true);
    expect(dayResult.b).toBeGreaterThan(0.9);
    expect(dayResult.b).toBeGreaterThan(dayResult.r);

    // 2. Terminator (sunDot = 0.0): golden-amber hue (red/green dominate blue)
    const twilightResult = evaluateAtmosphereColor(0.0, true);
    expect(twilightResult.r).toBeGreaterThan(twilightResult.b);
    expect(twilightResult.r).toBeGreaterThan(0.7);

    // 3. Night side (sunDot = -0.8): deep darkness (< 10% luminance of day)
    const nightResult = evaluateAtmosphereColor(-0.8, true);
    const dayLum = 0.2126 * dayResult.r + 0.7152 * dayResult.g + 0.0722 * dayResult.b;
    const nightLum = 0.2126 * nightResult.r + 0.7152 * nightResult.g + 0.0722 * nightResult.b;
    expect(nightLum / dayLum).toBeLessThan(0.1);

    // 4. Day/Night disabled: uniform day color even at negative sunDot
    const disabledResult = evaluateAtmosphereColor(-0.8, false);
    expect(disabledResult.b).toBeCloseTo(dayColor.b, 3);
  });

  it('cleans up resources and unbinds subscriptions on destroy', () => {
    const scene = new Scene();
    const store = createStore(createInitialState());
    const atmosphere = new AtmosphereController(scene, store);

    const mesh = atmosphere.getMesh();
    expect(scene.children).toContain(mesh);

    atmosphere.destroy();
    expect(scene.children).not.toContain(mesh);

    // Store updates after destroy should not throw
    expect(() => {
      store.set({ dayNight: false });
    }).not.toThrow();
  });

  // Regression: the twilight band used to be drawn on shell points behind the visible horizon,
  // producing orange crescents on the globe limb unrelated to the surface terminator.
  describe('twilight band', () => {
    const smoothstep = (a: number, b: number, x: number): number => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    // Reference implementation of the GLSL mix weight.
    const twilightWeight = (sunDot: number, facingDot: number): number => {
      const band = smoothstep(-0.12, 0.0, sunDot) * (1 - smoothstep(0.0, 0.12, sunDot));
      const facing = smoothstep(
        Number(TWILIGHT_FACING_MIN),
        Number(TWILIGHT_FACING_MAX),
        facingDot,
      );
      return band * facing * Number(TWILIGHT_STRENGTH);
    };

    it('shader applies the facing fade and the reduced strength', () => {
      expect(ATMOSPHERE_FRAGMENT_SHADER).toContain('normalize(cameraPosition)');
      expect(ATMOSPHERE_FRAGMENT_SHADER).toContain(
        `smoothstep(${TWILIGHT_FACING_MIN}, ${TWILIGHT_FACING_MAX}`,
      );
      expect(ATMOSPHERE_FRAGMENT_SHADER).toContain(`twilight * facing * ${TWILIGHT_STRENGTH}`);
      expect(ATMOSPHERE_FRAGMENT_SHADER).not.toContain('twilight * 0.85');
    });

    it('is fully suppressed for shell points that do not face the camera', () => {
      expect(twilightWeight(0.0, -0.3)).toBe(0);
      expect(twilightWeight(0.0, 0.0)).toBe(0);
    });

    it('stays visible at the terminator when facing the camera, below full strength', () => {
      const w = twilightWeight(0.0, 0.9);
      expect(w).toBeGreaterThan(0.3);
      expect(w).toBeLessThanOrEqual(Number(TWILIGHT_STRENGTH));
    });

    it('is zero away from the terminator regardless of facing', () => {
      expect(twilightWeight(0.5, 0.9)).toBe(0);
      expect(twilightWeight(-0.5, 0.9)).toBe(0);
    });
  });
});
