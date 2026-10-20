import type { GlobeContext } from '@/globe';
import { registerDevParam } from './dev-params';
import { DevPanel, type DevStats } from './dev-panel';

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

export function initDevPanel(root: HTMLElement, context: GlobeContext): DevPanel {
  const unregister = registerGlobeDevParams(context);
  const stats = (): DevStats => ({
    fps: context.fpsMonitor.getFps(),
    tier: context.quality.getActiveTier(),
    drawCalls: readDrawCalls(context),
    altitude: readAltitude(context),
  });
  const panel = new DevPanel({ container: root, stats });
  panel.onDestroy(unregister);
  return panel;
}
