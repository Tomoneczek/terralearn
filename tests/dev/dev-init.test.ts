import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Scene, Vector3 } from 'three';
import { AtmosphereController } from '@/globe/atmosphere';
import { SunController, DEFAULT_SUN_PARAMS } from '@/globe/sun';
import { MoonController, DEFAULT_MOON_PARAMS } from '@/globe/moon';
import { DayNightController } from '@/globe/day-night';
import { SkyClock } from '@/globe/sky-clock';
import { CapitalsLayer } from '@/globe/capitals-layer';
import { HoverArbiter } from '@/globe/hover-arbiter';
import { CAPITALS_SPOTLIGHT_DEFAULTS } from '@/globe/capitals-spotlight';
import { createStore, createInitialState } from '@/state/store';
import type { GlobeContext } from '@/globe';
import {
  initDevPanel,
  registerCapitalsDevParams,
  registerRenderDevParams,
  registerSunDevParams,
  registerSkyDevParams,
} from '@/dev';
import { SpotlightDebugOverlay } from '@/dev/spotlight-debug';
import { loadDevPanel } from '@/dev/load-dev-panel';
import { clearDevParams, listDevParams, resetAllDevParams, setDevParam } from '@/dev/dev-params';

function fakeContext(): {
  context: GlobeContext;
  atmosphere: AtmosphereController;
  capitals: CapitalsLayer;
  sun: SunController;
  moon: MoonController;
  dayNight: DayNightController;
  skyClock: SkyClock;
  container: HTMLElement;
} {
  const store = createStore(createInitialState());
  const atmosphere = new AtmosphereController(new Scene(), store);
  const sun = new SunController(null, store, { sunDirection: new Vector3(0, 0, 1) });
  const skyClock = new SkyClock({ realNow: () => Date.UTC(2026, 9, 28, 12) });
  const dayNight = new DayNightController(store, { date: skyClock.now() });
  skyClock.onTick(date => dayNight.updateSun(date));
  const moon = new MoonController(null, store, {
    moonPosition: dayNight.getMoonPosition(),
    sunDirection: dayNight.getSunDirection(),
  });
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({ width: 1000, height: 600 }) as DOMRect;
  const capitals = new CapitalsLayer({
    scene: null,
    store,
    arbiter: new HoverArbiter(store),
    container,
    getCamera: () => null,
  });
  const context = {
    atmosphere,
    capitals,
    sun,
    moon,
    dayNight,
    skyClock,
    fpsMonitor: { getFps: () => 60 },
    quality: { getActiveTier: () => 'high' },
    camera: { getPointOfView: () => ({ lat: 0, lng: 0, altitude: 2 }) },
    globe: {
      renderer: () => {
        throw new Error('no renderer');
      },
    },
  } as unknown as GlobeContext;
  return { context, atmosphere, capitals, sun, moon, dayNight, skyClock, container };
}

describe('initDevPanel', () => {
  beforeEach(() => {
    clearDevParams();
    document.body.innerHTML = '';
  });

  it('registers atmosphere twilight params that drive the shader uniforms', () => {
    const { context, atmosphere } = fakeContext();
    const panel = initDevPanel(document.body, context);

    expect(listDevParams().map(p => p.id)).toEqual(
      expect.arrayContaining([
        'atmosphere.twilightStrength',
        'atmosphere.facingMin',
        'atmosphere.facingMax',
        'render.pointerPicking',
        'render.pixelRatio',
        'capitals.fullRadius',
      ]),
    );
    setDevParam('atmosphere.twilightStrength', 0.9);
    expect(atmosphere.getMaterial().uniforms.uTwilightStrength?.value).toBe(0.9);
    expect(document.querySelector('.tl-dev-stats')?.textContent).toContain('draw calls n/a');

    panel.destroy();
    expect(listDevParams()).toHaveLength(0);
    atmosphere.destroy();
  });
});

describe('sun params', () => {
  beforeEach(() => clearDevParams());

  it('exposes every sun parameter and pushes glow changes into the shader', () => {
    const { context, sun } = fakeContext();
    const unregister = registerSunDevParams(context);

    for (const key of Object.keys(DEFAULT_SUN_PARAMS)) {
      expect(listDevParams().some(p => p.id === `sun.${key}`)).toBe(true);
    }
    setDevParam('sun.glowStrength', 1.2);
    setDevParam('sun.discScale', 5);
    expect(sun.getMaterial().uniforms.uGlowStrength?.value).toBe(1.2);
    expect(sun.params.discScale).toBe(5);

    resetAllDevParams();
    expect(sun.params.discScale).toBe(1);

    unregister();
    expect(listDevParams()).toHaveLength(0);
    sun.destroy();
  });
});

describe('sky params', () => {
  beforeEach(() => clearDevParams());

  it('tunes the Moon, toggles eclipse shadows and shifts the sky clock', () => {
    const { context, moon, dayNight, skyClock } = fakeContext();
    const unregister = registerSkyDevParams(context);

    for (const key of Object.keys(DEFAULT_MOON_PARAMS)) {
      expect(listDevParams().some(p => p.id === `moon.${key}`)).toBe(true);
    }
    setDevParam('moon.scale', 4);
    expect(moon.getMesh().scale.x).toBe(4);
    setDevParam('moon.umbraGlow', 0.8);
    expect(moon.getMaterial().uniforms.uUmbraGlow?.value).toBe(0.8);

    setDevParam('eclipses.enabled', 0);
    expect(moon.getMaterial().uniforms.uEclipses?.value).toBe(0);
    expect(dayNight.getMaterial().uniforms.uEclipses?.value).toBe(0);

    const before = dayNight.getMoonPosition().clone();
    setDevParam('sky.offsetDays', 2);
    setDevParam('sky.offsetHours', 6);
    expect(skyClock.getOffsetMs()).toBe(2 * 86_400_000 + 6 * 3_600_000);
    // The Moon moves ~13°/day, so its position must have changed
    expect(dayNight.getMoonPosition().angleTo(before)).toBeGreaterThan(0.3);

    resetAllDevParams();
    expect(skyClock.getOffsetMs()).toBe(0);
    expect(moon.params.scale).toBe(1);

    unregister();
    expect(listDevParams()).toHaveLength(0);
    moon.destroy();
    dayNight.destroy();
    skyClock.destroy();
  });
});

describe('capitals spotlight params', () => {
  beforeEach(() => clearDevParams());

  it('exposes every spotlight parameter and writes through to the layer', () => {
    const { context, capitals } = fakeContext();
    const unregister = registerCapitalsDevParams(context);

    for (const key of Object.keys(CAPITALS_SPOTLIGHT_DEFAULTS)) {
      expect(listDevParams().some(p => p.id === `capitals.${key}`)).toBe(true);
    }
    setDevParam('capitals.fadeRadius', 0.5);
    setDevParam('capitals.hitRadiusPx', 20);
    expect(capitals.params.fadeRadius).toBe(0.5);
    expect(capitals.params.hitRadiusPx).toBe(20);

    // values are clamped to the slider range
    setDevParam('capitals.fullRadius', 99);
    expect(capitals.params.fullRadius).toBe(0.6);

    resetAllDevParams();
    expect(capitals.params.fadeRadius).toBe(CAPITALS_SPOTLIGHT_DEFAULTS.fadeRadius);

    unregister();
    expect(listDevParams()).toHaveLength(0);
    capitals.destroy();
  });

  it('recomputes rank scales when their range changes', () => {
    const { context, capitals } = fakeContext();
    const unregister = registerCapitalsDevParams(context);
    capitals.setFeatures([
      {
        type: 'Feature',
        properties: {
          id: 'big',
          kind: 'capital',
          layerId: 'capitals',
          name_pl: 'big',
          name_en: 'big',
          rank: { population: 30_000_000 },
        },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ]);
    const rank = capitals.getMesh().geometry.getAttribute('aRank');
    expect(rank.getX(0)).toBeCloseTo(CAPITALS_SPOTLIGHT_DEFAULTS.rankScaleMax, 5);

    setDevParam('capitals.rankScaleMax', 2.5);
    expect(rank.getX(0)).toBeCloseTo(2.5, 5);

    unregister();
    capitals.destroy();
  });

  it('toggles the on-screen radii preview and removes it on cleanup', () => {
    const { context, capitals, container } = fakeContext();
    const unregister = registerCapitalsDevParams(context);
    const overlay = container.querySelector<HTMLElement>('.tl-dev-spotlight')!;
    expect(overlay.style.display).toBe('none');

    setDevParam('capitals.showCircles', 1);
    expect(overlay.style.display).toBe('block');
    setDevParam('capitals.showCircles', 0);
    expect(overlay.style.display).toBe('none');

    unregister();
    expect(container.querySelector('.tl-dev-spotlight')).toBeNull();
    capitals.destroy();
  });
});

describe('SpotlightDebugOverlay', () => {
  it('sizes both circles from the container and the parameters', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ width: 1000, height: 600 }) as DOMRect;
    const params = { ...CAPITALS_SPOTLIGHT_DEFAULTS, fullRadius: 0.1, fadeRadius: 0.4 };
    const overlay = new SpotlightDebugOverlay(container, params);

    overlay.setVisible(true);
    const [full, fade] = [...overlay.element.children] as HTMLElement[];
    // diameter = 2 × radius × min(width, height)
    expect(full!.style.width).toBe('120px');
    expect(fade!.style.width).toBe('480px');

    params.fadeRadius = 0.5;
    overlay.update();
    expect(fade!.style.width).toBe('600px');

    overlay.destroy();
    expect(container.contains(overlay.element)).toBe(false);
  });
});

describe('render bisect params', () => {
  beforeEach(() => clearDevParams());

  function renderContext() {
    let picking = true;
    let ratio = 2;
    const setPixelRatio = vi.fn((v: number) => {
      ratio = v;
    });
    const context = {
      globe: {
        enablePointerInteraction: vi.fn((v?: boolean) => {
          if (v === undefined) return picking;
          picking = v;
          return undefined;
        }),
        renderer: () => ({ getPixelRatio: () => ratio, setPixelRatio }),
      },
    } as unknown as GlobeContext;
    return { context, setPixelRatio, state: () => ({ picking, ratio }) };
  }

  it('toggles pointer picking and render resolution on the globe', () => {
    const { context, setPixelRatio, state } = renderContext();
    const unregister = registerRenderDevParams(context);

    setDevParam('render.pointerPicking', 0);
    expect(state().picking).toBe(false);
    setDevParam('render.pointerPicking', 1);
    expect(state().picking).toBe(true);

    setDevParam('render.pixelRatio', 1);
    expect(setPixelRatio).toHaveBeenCalledWith(1);

    unregister();
    expect(listDevParams()).toHaveLength(0);
  });

  it('reads current values as the reset defaults', () => {
    const { context, state } = renderContext();
    registerRenderDevParams(context);
    setDevParam('render.pointerPicking', 0);
    setDevParam('render.pixelRatio', 0.5);
    resetAllDevParams();
    expect(state()).toEqual({ picking: true, ratio: 2 });
  });
});

describe('loadDevPanel', () => {
  beforeEach(() => {
    clearDevParams();
    document.body.innerHTML = '';
  });

  it('does not import the dev module or touch the DOM without ?dev=true', async () => {
    const importer = vi.fn();
    const { context } = fakeContext();
    for (const search of ['', '?dev=false', '?dev=1']) {
      await loadDevPanel(search, document.body, context, importer);
    }
    expect(importer).not.toHaveBeenCalled();
    expect(document.querySelector('.tl-dev-panel')).toBeNull();
  });

  it('imports the dev module and mounts the panel with ?dev=true', async () => {
    const { context } = fakeContext();
    await loadDevPanel('?dev=true', document.body, context);
    expect(document.querySelector('.tl-dev-panel')).not.toBeNull();
  });

  it('freezes the sky clock at ?time= in dev mode only', async () => {
    const importer = vi.fn(() => Promise.resolve({ initDevPanel: vi.fn() }) as never);
    const { context, skyClock } = fakeContext();

    await loadDevPanel('?time=2026-08-12T17:46:00Z', document.body, context, importer);
    expect(skyClock.getFixedTime()).toBeNull();

    await loadDevPanel('?dev=true&time=2026-08-12T17:46:00Z', document.body, context, importer);
    expect(skyClock.now().toISOString()).toBe('2026-08-12T17:46:00.000Z');
    skyClock.destroy();
  });

  it('swallows import failures instead of breaking the app', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { context } = fakeContext();
    await expect(
      loadDevPanel('?dev=true', document.body, context, () => Promise.reject(new Error('boom'))),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
