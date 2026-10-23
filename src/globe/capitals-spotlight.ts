/**
 * Pure math of the capitals "spotlight": a capital is visible only near the screen center
 * (a circle that scales with the viewport and with the city's rank) and only when zoomed in.
 * The same formulas run in the vertex shader (see capitals-layer.ts) and on the CPU (hit-testing), so they are kept here as the single reference implementation.
 */

export interface SpotlightParams {
  /** Radius (fraction of min(viewport w, h)) inside which a capital is fully opaque. */
  fullRadius: number;
  /** Radius (same unit) beyond which a capital is invisible. */
  fadeRadius: number;
  /** Camera altitude (globe radii) at/above which no capital is visible. */
  zoomHideAltitude: number;
  /** Camera altitude at/below which the zoom factor is 1. */
  zoomFullAltitude: number;
  /** Radius multiplier of the least / most populous capital. */
  rankScaleMin: number;
  rankScaleMax: number;
  /** Marker diameter in CSS pixels at the zoom where capitals become fully visible. */
  pointSize: number;
  /** Marker size multiplier reached at `pointScaleCloseAltitude` (bigger when zoomed in). */
  pointZoomScale: number;
  /** Camera altitude (globe radii) at/below which the marker has its largest size. */
  pointScaleCloseAltitude: number;
  /** Pointer hit radius in CSS pixels. */
  hitRadiusPx: number;
  /** A capital below this opacity cannot be hovered or clicked. */
  hitMinOpacity: number;
}

export const CAPITALS_SPOTLIGHT_DEFAULTS: Readonly<SpotlightParams> = {
  fullRadius: 0.12,
  fadeRadius: 0.38,
  zoomHideAltitude: 1.8,
  zoomFullAltitude: 1.2,
  rankScaleMin: 0.6,
  rankScaleMax: 1.4,
  pointSize: 9,
  pointZoomScale: 2.2,
  pointScaleCloseAltitude: 0.25,
  hitRadiusPx: 12,
  hitMinOpacity: 0.3,
};

/** Population range (log10) mapped onto [rankScaleMin, rankScaleMax]. */
const POPULATION_LOG_MIN = 4.5; // ~30k
const POPULATION_LOG_MAX = 7.2; // ~16M

/** 0 = normal, 1 = hovered, 2 = selected. */
export type CapitalState = 0 | 1 | 2;

export const HOVERED_MIN_OPACITY = 0.85;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 0 when the whole globe is in view, 1 when zoomed in close enough to show capitals. */
export function computeZoomFade(altitude: number, p: SpotlightParams): number {
  return 1 - smoothstep(p.zoomFullAltitude, p.zoomHideAltitude, altitude);
}

/**
 * Marker size multiplier: 1 where capitals become fully visible, growing to `pointZoomScale`
 * as the camera gets close. Keeps the markers readable on busy textures when zoomed in.
 */
export function computePointScale(altitude: number, p: SpotlightParams): number {
  return (
    1 +
    (p.pointZoomScale - 1) *
      (1 - smoothstep(p.pointScaleCloseAltitude, p.zoomFullAltitude, altitude))
  );
}

/** Larger capitals light up in a wider circle. Unknown population → neutral scale 1. */
export function computeRankScale(population: number | undefined, p: SpotlightParams): number {
  if (typeof population !== 'number' || !(population > 0)) return 1;
  const t = smoothstep(POPULATION_LOG_MIN, POPULATION_LOG_MAX, Math.log10(population));
  return p.rankScaleMin + t * (p.rankScaleMax - p.rankScaleMin);
}

/**
 * Smooth fade of points near the globe horizon (1 when clearly on the visible hemisphere).
 * `cosAngle` = dot(pointDir, cameraDir), `cameraDistance` in the same units as `globeRadius`.
 */
export function computeFacing(
  cosAngle: number,
  globeRadius: number,
  cameraDistance: number,
): number {
  return smoothstep(0, 0.08, cosAngle - globeRadius / cameraDistance);
}

export interface OpacityInput {
  /** Distance from the screen center, CSS px. */
  distPx: number;
  /** min(viewport width, height), CSS px. */
  viewportMinPx: number;
  rankScale: number;
  zoomFade: number;
  /** See computeFacing. */
  facing: number;
  state?: CapitalState;
}

export function computeCapitalOpacity(input: OpacityInput, p: SpotlightParams): number {
  const { distPx, viewportMinPx, rankScale, zoomFade, facing, state = 0 } = input;
  const rFull = p.fullRadius * viewportMinPx * rankScale;
  const rFade = p.fadeRadius * viewportMinPx * rankScale;
  const spotlight = (1 - smoothstep(rFull, rFade, distPx)) * zoomFade;

  let opacity = spotlight;
  if (state === 2) opacity = 1;
  else if (state === 1) opacity = Math.max(spotlight, HOVERED_MIN_OPACITY);
  return opacity * facing;
}

export interface ScreenCapital {
  id: string;
  /** Screen position in CSS px, relative to the canvas. */
  x: number;
  y: number;
  distPx: number;
  opacity: number;
}

/** Nearest visible-enough capital within the hit radius of a pointer position (canvas px). */
export function findNearestCapital(
  items: readonly ScreenCapital[],
  pointer: { x: number; y: number },
  p: SpotlightParams,
): string | null {
  let bestId: string | null = null;
  let bestDist = p.hitRadiusPx;
  for (const item of items) {
    if (item.opacity < p.hitMinOpacity) continue;
    const d = Math.hypot(item.x - pointer.x, item.y - pointer.y);
    if (d <= bestDist) {
      bestDist = d;
      bestId = item.id;
    }
  }
  return bestId;
}
