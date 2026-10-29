import type { GlobeContext } from '@/globe';
import { registerDevParam } from './dev-params';
import { DevPanel, type DevStats } from './dev-panel';
import { FrameStats } from './frame-stats';
import { countDrawCalls, formatDrawCalls } from './draw-calls';
import { SpotlightDebugOverlay } from './spotlight-debug';
import type { SpotlightParams } from '@/globe/capitals-spotlight';
import type { SunParams } from '@/globe/sun';
import type { MoonParams } from '@/globe/moon';
import type { MoonLabelParams } from '@/globe/moon-label';

function readDrawCalls(context: GlobeContext): number | null {
  try {
    return context.globe.renderer()?.info.render.calls ?? null;
  } catch {
    return null;
  }
}

function readAltitude(context: GlobeContext): number | null {
  try {
    return context.camera.getPointOfView().altitude;
  } catch {
    return null;
  }
}

function readDrawCallBreakdown(context: GlobeContext): string | undefined {
  try {
    return formatDrawCalls(countDrawCalls(context.globe.scene()));
  } catch {
    return undefined;
  }
}

/** Registers the tunable parameters of the existing globe modules. */
export function registerGlobeDevParams(context: GlobeContext): () => void {
  const uniforms = context.atmosphere.getMaterial().uniforms;
  const uniformParam = (
    id: string,
    uniform: string,
    label: string,
    min: number,
    max: number,
    step: number,
  ): (() => void) =>
    registerDevParam({
      id,
      label,
      group: 'Atmosphere twilight',
      min,
      max,
      step,
      get: () => Number(uniforms[uniform]?.value ?? 0),
      set: value => {
        const u = uniforms[uniform];
        if (u) u.value = value;
      },
    });

  const unregister = [
    uniformParam('atmosphere.twilightStrength', 'uTwilightStrength', 'Strength', 0, 1, 0.01),
    uniformParam('atmosphere.facingMin', 'uTwilightFacingMin', 'Facing fade start', -0.5, 1, 0.01),
    uniformParam('atmosphere.facingMax', 'uTwilightFacingMax', 'Facing fade end', -0.5, 1, 0.01),
  ];
  return () => unregister.forEach(fn => fn());
}

const SUN_SPECS: readonly {
  key: keyof SunParams;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: 'discScale', label: 'Disc size × (1 = real 0.53°)', min: 1, max: 20, step: 0.5 },
  { key: 'glowStrength', label: 'Glow strength', min: 0, max: 2, step: 0.05 },
  { key: 'glowFalloff', label: 'Glow falloff (disc radii)', min: 0.5, max: 10, step: 0.25 },
  { key: 'glowExtent', label: 'Glow extent (disc radii)', min: 2, max: 40, step: 1 },
];

/** Solar disc and glow tuning; the disc defaults to its real angular size. */
export function registerSunDevParams(context: GlobeContext): () => void {
  const sun = context.sun;
  const unregister = SUN_SPECS.map(spec =>
    registerDevParam({
      id: `sun.${spec.key}`,
      label: spec.label,
      group: 'Sun',
      min: spec.min,
      max: spec.max,
      step: spec.step,
      get: () => sun.params[spec.key],
      set: value => {
        sun.params[spec.key] = value;
        sun.applyParams();
      },
    }),
  );
  return () => unregister.forEach(fn => fn());
}

const MOON_SPECS: readonly {
  key: keyof MoonParams;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: 'earthshine', label: 'Earthshine', group: 'Moon', min: 0, max: 1, step: 0.01 },
  {
    key: 'shadowWidening',
    label: "Earth's shadow widening (atmosphere)",
    group: 'Eclipses',
    min: 1,
    max: 1.05,
    step: 0.005,
  },
  { key: 'umbraGlow', label: 'Red light in umbra', group: 'Eclipses', min: 0, max: 1, step: 0.01 },
];

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/**
 * Moon look, eclipse switches and the sky clock offset (days + hours), for previewing phases
 * and eclipses at any moment; `?time=` (see load-dev-panel) freezes the sky at an exact instant.
 */
export function registerSkyDevParams(context: GlobeContext): () => void {
  const { moon, dayNight, skyClock } = context;
  const unregister = MOON_SPECS.map(spec =>
    registerDevParam({
      id: `moon.${spec.key}`,
      label: spec.label,
      group: spec.group,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      get: () => moon.params[spec.key],
      set: value => {
        moon.params[spec.key] = value;
        moon.applyParams();
      },
    }),
  );

  const label = context.moonLabel;
  const LABEL_SPECS: readonly {
    key: keyof MoonLabelParams;
    label: string;
    min: number;
    max: number;
    step: number;
  }[] = [
    { key: 'nearPx', label: 'Fully visible within (px)', min: 0, max: 200, step: 5 },
    { key: 'farPx', label: 'Faded beyond (px)', min: 50, max: 800, step: 10 },
    { key: 'minOpacity', label: 'Resting opacity', min: 0, max: 1, step: 0.05 },
    { key: 'maxRadiusPx', label: 'Hide when Moon radius ≥ (px)', min: 4, max: 60, step: 1 },
  ];
  for (const spec of LABEL_SPECS) {
    unregister.push(
      registerDevParam({
        id: `moonLabel.${spec.key}`,
        label: spec.label,
        group: 'Moon label',
        min: spec.min,
        max: spec.max,
        step: spec.step,
        get: () => label.params[spec.key],
        set: value => {
          label.params[spec.key] = value;
        },
      }),
    );
  }

  let eclipsesOn = true;
  unregister.push(
    registerDevParam({
      id: 'eclipses.enabled',
      label: 'Eclipse shadows (0 = off, 1 = on)',
      group: 'Eclipses',
      min: 0,
      max: 1,
      step: 1,
      get: () => (eclipsesOn ? 1 : 0),
      set: value => {
        eclipsesOn = value >= 0.5;
        moon.setEclipsesEnabled(eclipsesOn);
        dayNight.setEclipsesEnabled(eclipsesOn);
      },
    }),
  );

  let offsetDays = 0;
  let offsetHours = 0;
  const applyOffset = (): void => skyClock.setOffsetMs(offsetDays * DAY_MS + offsetHours * HOUR_MS);
  unregister.push(
    registerDevParam({
      id: 'sky.offsetDays',
      label: 'Time offset (days)',
      group: 'Sky clock',
      min: -400,
      max: 400,
      step: 1,
      get: () => offsetDays,
      set: value => {
        offsetDays = value;
        applyOffset();
      },
    }),
    registerDevParam({
      id: 'sky.offsetHours',
      label: 'Time offset (hours)',
      group: 'Sky clock',
      min: -24,
      max: 24,
      step: 0.25,
      get: () => offsetHours,
      set: value => {
        offsetHours = value;
        applyOffset();
      },
    }),
  );
  return () => unregister.forEach(fn => fn());
}

interface SpotlightParamSpec {
  key: keyof SpotlightParams;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SPOTLIGHT_SPECS: readonly SpotlightParamSpec[] = [
  { key: 'fullRadius', label: 'Full radius (× viewport min)', min: 0, max: 0.6, step: 0.01 },
  { key: 'fadeRadius', label: 'Fade radius (× viewport min)', min: 0.05, max: 1, step: 0.01 },
  { key: 'zoomHideAltitude', label: 'Hidden at altitude ≥', min: 1, max: 3, step: 0.05 },
  { key: 'zoomFullAltitude', label: 'Fully visible at altitude ≤', min: 0.3, max: 2, step: 0.05 },
  { key: 'rankScaleMin', label: 'Rank scale (smallest city)', min: 0.2, max: 1.5, step: 0.05 },
  { key: 'rankScaleMax', label: 'Rank scale (largest city)', min: 0.5, max: 3, step: 0.05 },
  { key: 'pointSize', label: 'Marker size (px)', min: 2, max: 24, step: 1 },
  { key: 'pointZoomScale', label: 'Marker size × when zoomed in', min: 1, max: 4, step: 0.1 },
  {
    key: 'pointScaleCloseAltitude',
    label: 'Largest marker at altitude ≤',
    min: 0.1,
    max: 1.2,
    step: 0.05,
  },
  { key: 'hitRadiusPx', label: 'Hit radius (px)', min: 4, max: 40, step: 1 },
  { key: 'hitMinOpacity', label: 'Min opacity to interact', min: 0, max: 1, step: 0.05 },
];

/** Capitals spotlight tuning, plus an on-screen preview of the two radii. */
export function registerCapitalsDevParams(context: GlobeContext): () => void {
  const layer = context.capitals;
  const group = 'Capitals spotlight';
  const unregister = SPOTLIGHT_SPECS.map(spec =>
    registerDevParam({
      id: `capitals.${spec.key}`,
      label: spec.label,
      group,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      get: () => layer.params[spec.key],
      set: value => {
        layer.params[spec.key] = value;
        if (spec.key === 'rankScaleMin' || spec.key === 'rankScaleMax') layer.refreshRankScales();
      },
    }),
  );

  const container = layer.getContainer();
  let overlay: SpotlightDebugOverlay | null = null;
  if (container) {
    overlay = new SpotlightDebugOverlay(container, layer.params);
    const debugOverlay = overlay;
    unregister.push(
      registerDevParam({
        id: 'capitals.showCircles',
        label: 'Show radii on screen (0/1)',
        group,
        min: 0,
        max: 1,
        step: 1,
        get: () => (debugOverlay.isVisible() ? 1 : 0),
        set: value => debugOverlay.setVisible(value >= 0.5),
      }),
    );
  }

  return () => {
    unregister.forEach(fn => fn());
    overlay?.destroy();
  };
}

/**
 * Switches for bisecting where frame time goes: pointer picking (a raycast over every globe
 * object every ~50 ms) and render resolution (GPU fill rate).
 */
export function registerRenderDevParams(context: GlobeContext): () => void {
  const group = 'Render bisect';
  const unregisterPicking = registerDevParam({
    id: 'render.pointerPicking',
    label: 'Pointer picking (0 = off, 1 = on)',
    group,
    min: 0,
    max: 1,
    step: 1,
    get: () => {
      try {
        return context.globe.enablePointerInteraction() ? 1 : 0;
      } catch {
        return 1;
      }
    },
    set: value => {
      try {
        context.globe.enablePointerInteraction(value >= 0.5);
      } catch {
        // Mock environment
      }
    },
  });
  const unregisterRatio = registerDevParam({
    id: 'render.pixelRatio',
    label: 'Pixel ratio',
    group,
    min: 0.5,
    max: 3,
    step: 0.25,
    get: () => {
      try {
        return context.globe.renderer()?.getPixelRatio() ?? 1;
      } catch {
        return 1;
      }
    },
    set: value => {
      try {
        context.globe.renderer()?.setPixelRatio(value);
      } catch {
        // Mock environment
      }
    },
  });
  return () => {
    unregisterPicking();
    unregisterRatio();
  };
}

export function initDevPanel(root: HTMLElement, context: GlobeContext): DevPanel {
  const unregisterGlobe = registerGlobeDevParams(context);
  const unregisterRender = registerRenderDevParams(context);
  const unregisterCapitals = registerCapitalsDevParams(context);
  const unregisterSun = registerSunDevParams(context);
  const unregisterSky = registerSkyDevParams(context);
  const frameStats = new FrameStats();
  frameStats.start();
  const stats = (): DevStats => ({
    fps: context.fpsMonitor.getFps(),
    tier: context.quality.getActiveTier(),
    drawCalls: readDrawCalls(context),
    altitude: readAltitude(context),
    frame: frameStats.getSummary(),
    drawCallBreakdown: readDrawCallBreakdown(context),
  });
  const panel = new DevPanel({ container: root, stats });
  panel.onDestroy(() => {
    frameStats.stop();
    unregisterGlobe();
    unregisterRender();
    unregisterCapitals();
    unregisterSun();
    unregisterSky();
  });
  return panel;
}
