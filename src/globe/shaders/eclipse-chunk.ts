/**
 * GLSL twin of `discOcclusionFraction` / `angleBetween` from `@/geo/eclipse` (keep both in sync;
 * the TypeScript version is the unit-tested one). Pasted into the Moon and globe shaders.
 */
export const ECLIPSE_GLSL = /* glsl */ `
  // Angle between two vectors, accurate for tiny angles (acos loses precision near 1.0)
  float eclipseAngleBetween(vec3 a, vec3 b) {
    return atan(length(cross(a, b)), dot(a, b));
  }

  // Fraction of the solar disc (angular radius rs) covered by a disc of angular radius ro
  // whose center is d away; planar intersection of two circles over the Sun's area.
  float eclipseDiscOcclusion(float d, float rs, float ro) {
    if (d >= rs + ro) return 0.0;
    if (d <= abs(ro - rs)) return ro >= rs ? 1.0 : (ro * ro) / (rs * rs);
    float d2 = d * d;
    float rs2 = rs * rs;
    float ro2 = ro * ro;
    float a1 = rs2 * acos(clamp((d2 + rs2 - ro2) / (2.0 * d * rs), -1.0, 1.0));
    float a2 = ro2 * acos(clamp((d2 + ro2 - rs2) / (2.0 * d * ro), -1.0, 1.0));
    float k = 0.5 * sqrt(max(0.0, (-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro)));
    return clamp((a1 + a2 - k) / (3.14159265 * rs2), 0.0, 1.0);
  }
`;
