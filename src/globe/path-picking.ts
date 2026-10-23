import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { Intersection, Object3D, Raycaster } from 'three';

/** Minimum pointer hit width (CSS px) for globe.gl paths; their drawn stroke is only ~1–2 px. */
export const MIN_PATH_HIT_WIDTH_PX = 12;

type RaycastFn = (this: LineSegments2, raycaster: Raycaster, intersects: Intersection[]) => void;

const PATCHED = Symbol.for('terralearn.pathPickingPatched');

function isGlobePath(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, '__globeObjType')) {
      return (current as Object3D & { __globeObjType?: string }).__globeObjType === 'path';
    }
    current = current.parent;
  }
  return false;
}

/**
 * globe.gl draws paths as screen-space fat lines whose pick tolerance equals the drawn width,
 * which makes rivers practically impossible to hover. This widens the hit area of path objects
 * only (other fat lines, e.g. the highlight overlay, keep their own behaviour). Idempotent.
 */
export function installPathHitTolerance(minWidthPx = MIN_PATH_HIT_WIDTH_PX): void {
  const proto = LineSegments2.prototype as LineSegments2 & { [PATCHED]?: number };
  if (proto[PATCHED] !== undefined) {
    proto[PATCHED] = minWidthPx;
    return;
  }

  const original = proto.raycast as RaycastFn;
  proto[PATCHED] = minWidthPx;
  proto.raycast = function (this: LineSegments2, raycaster, intersects) {
    const width = (LineSegments2.prototype as { [PATCHED]?: number })[PATCHED] ?? 0;
    if (!isGlobePath(this)) {
      original.call(this, raycaster, intersects);
      return;
    }
    const material = this.material as { linewidth: number };
    const drawn = material.linewidth;
    material.linewidth = Math.max(drawn, width);
    try {
      original.call(this, raycaster, intersects);
    } finally {
      material.linewidth = drawn;
    }
  };
}
