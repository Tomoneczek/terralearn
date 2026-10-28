/**
 * Eclipse geometry shared by the tests and (as a GLSL twin in `globe/shaders/eclipse-chunk.ts`)
 * by the Moon and globe shaders.
 */

type Vec3 = readonly [number, number, number];

/**
 * Fraction of the solar disc (angular radius `rSun`) covered by an occluding disc (angular radius
 * `rOccluder`) whose center lies `separation` away. All angles in the same unit; small-angle
 * (planar) approximation: the area of the intersection of two circles over the area of the Sun.
 *
 * 0 = no overlap, 1 = total; an annular eclipse gives (rOccluder / rSun)².
 */
export function discOcclusionFraction(separation: number, rSun: number, rOccluder: number): number {
  const d = Math.abs(separation);
  if (d >= rSun + rOccluder) return 0;
  if (d <= Math.abs(rOccluder - rSun)) {
    return rOccluder >= rSun ? 1 : (rOccluder * rOccluder) / (rSun * rSun);
  }
  const d2 = d * d;
  const rs2 = rSun * rSun;
  const ro2 = rOccluder * rOccluder;
  const clamp1 = (x: number): number => Math.max(-1, Math.min(1, x));
  const a1 = rs2 * Math.acos(clamp1((d2 + rs2 - ro2) / (2 * d * rSun)));
  const a2 = ro2 * Math.acos(clamp1((d2 + ro2 - rs2) / (2 * d * rOccluder)));
  const k =
    0.5 *
    Math.sqrt(
      Math.max(
        0,
        (-d + rSun + rOccluder) *
          (d + rSun - rOccluder) *
          (d - rSun + rOccluder) *
          (d + rSun + rOccluder),
      ),
    );
  return Math.max(0, Math.min(1, (a1 + a2 - k) / (Math.PI * rs2)));
}

/** Angle between two vectors in radians, accurate for tiny angles (atan2 of |a×b| and a·b). */
export function angleBetween(a: Vec3, b: Vec3): number {
  const cx = a[1] * b[2] - a[2] * b[1];
  const cy = a[2] * b[0] - a[0] * b[2];
  const cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.hypot(cx, cy, cz), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}

/**
 * Distance of `point` from the line through the Earth center along `sunDirection`, in units of
 * `unit` (e.g. the globe radius). With `point` = Moon center this is the eclipse "gamma":
 * for a solar eclipse it is measured on the sunward side (the Moon's shadow axis passes the Earth
 * center at this distance), for a lunar eclipse on the anti-sun side (Moon vs Earth's shadow axis).
 * Returns the side as well: +1 sunward, −1 away from the Sun.
 */
export function shadowAxisDistance(
  point: Vec3,
  sunDirection: Vec3,
  unit: number,
): { distance: number; side: 1 | -1 } {
  const len = Math.hypot(...sunDirection);
  const s: Vec3 = [sunDirection[0] / len, sunDirection[1] / len, sunDirection[2] / len];
  const cx = point[1] * s[2] - point[2] * s[1];
  const cy = point[2] * s[0] - point[0] * s[2];
  const cz = point[0] * s[1] - point[1] * s[0];
  const along = point[0] * s[0] + point[1] * s[1] + point[2] * s[2];
  return { distance: Math.hypot(cx, cy, cz) / unit, side: along >= 0 ? 1 : -1 };
}
