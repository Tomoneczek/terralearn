import { geoCentroid } from 'd3-geo';

export const EARTH_RADIUS_KM = 6371;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ArcItem {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
}

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

export function toRad(deg: number): number {
  return deg * TO_RAD;
}

export function toDeg(rad: number): number {
  return rad * TO_DEG;
}

/**
 * Converts spherical (lat, lng) in degrees to a 3D unit vector [x, y, z].
 */
export function latLngToVector3(lat: number, lng: number): [number, number, number] {
  const phi = toRad(lat);
  const lambda = toRad(lng);
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)];
}

/**
 * Converts a 3D vector [x, y, z] back to spherical LatLng in degrees.
 */
export function vector3ToLatLng(x: number, y: number, z: number): LatLng {
  const r = Math.sqrt(x * x + y * y + z * z);
  if (r === 0) {
    return { lat: 0, lng: 0 };
  }
  const normZ = Math.max(-1, Math.min(1, z / r));
  const lat = Math.asin(normZ) * TO_DEG;
  const lng = Math.atan2(y, x) * TO_DEG;
  return { lat, lng };
}

/**
 * Calculates great-circle distance between two points on Earth in kilometers using Haversine formula.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_KM * c);
}

/**
 * Returns color representation for error distance:
 * - < 100 km: Emerald Neon
 * - < 500 km: Amber Gold
 * - >= 500 km: Coral Red
 */
export function getDistanceColor(distanceKm: number): string {
  if (distanceKm <= 100) {
    return 'rgba(0, 255, 170, 0.95)';
  }
  if (distanceKm <= 500) {
    return 'rgba(255, 200, 50, 0.95)';
  }
  return 'rgba(255, 80, 80, 0.95)';
}

/**
 * Generates an array of points along the great circle (orthodrome) between start and end.
 * Uses Spherical Linear Interpolation (SLERP).
 */
export function greatCircle(start: LatLng, end: LatLng, steps = 50): LatLng[] {
  const count = Math.max(2, steps);
  const v1 = latLngToVector3(start.lat, start.lng);
  const v2 = latLngToVector3(end.lat, end.lng);

  const dot = Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
  const omega = Math.acos(dot);

  if (omega < 1e-6) {
    return Array.from({ length: count }, () => ({ ...start }));
  }

  const result: LatLng[] = [];

  if (omega > Math.PI - 1e-6) {
    // Exact antipodes: rotate around an arbitrary orthogonal axis
    const axis = getOrthogonalVector(v1);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const angle = t * Math.PI;
      const rot = rodriguesRotation(v1, axis, angle);
      result.push(vector3ToLatLng(rot[0], rot[1], rot[2]));
    }
    return result;
  }

  const sinOmega = Math.sin(omega);

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const a = Math.sin((1 - t) * omega) / sinOmega;
    const b = Math.sin(t * omega) / sinOmega;

    const x = a * v1[0] + b * v2[0];
    const y = a * v1[1] + b * v2[1];
    const z = a * v1[2] + b * v2[2];

    result.push(vector3ToLatLng(x, y, z));
  }

  return result;
}

/**
 * Generates an array of points along the rhumb line (loxodrome) between start and end.
 * On a Mercator projection, this is a straight line of constant compass bearing.
 */
export function rhumbLine(start: LatLng, end: LatLng, steps = 50): LatLng[] {
  const count = Math.max(2, steps);

  // Clamp latitudes to avoid infinities near poles in Mercator space
  const lat1 = Math.max(-89.5, Math.min(89.5, start.lat));
  const lat2 = Math.max(-89.5, Math.min(89.5, end.lat));

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);

  // Projected Mercator latitudes: y = ln(tan(pi/4 + phi/2))
  const y1 = Math.log(Math.tan(Math.PI / 4 + phi1 / 2));
  const y2 = Math.log(Math.tan(Math.PI / 4 + phi2 / 2));

  let dLng = end.lng - start.lng;
  // Shortest wrap around meridian
  while (dLng > 180) dLng -= 360;
  while (dLng < -180) dLng += 360;

  const dy = y2 - y1;
  const isParallel = Math.abs(lat2 - lat1) < 1e-6;
  const isMeridian = Math.abs(dLng) < 1e-6;

  const result: LatLng[] = [];

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);

    // Latitude
    let lat: number;
    if (isParallel) {
      lat = start.lat;
    } else {
      const y = y1 + t * dy;
      lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * TO_DEG;
    }

    // Longitude
    let lng: number;
    if (isMeridian) {
      lng = start.lng;
    } else {
      lng = start.lng + t * dLng;
      while (lng > 180) lng -= 360;
      while (lng < -180) lng += 360;
    }

    result.push({ lat, lng });
  }

  return result;
}

/**
 * Calculates the exact antipodal point (opposite side of the Earth).
 */
export function antipode(point: LatLng): LatLng {
  const lat = point.lat === 0 ? 0 : -point.lat;
  if (Math.abs(point.lat) >= 90) {
    return { lat, lng: 0 };
  }

  let lng = point.lng + 180;
  while (lng > 180) lng -= 360;
  while (lng <= -180) lng += 360;
  if (Object.is(lng, -0)) lng = 0;

  return { lat, lng };
}

/**
 * Internal helper: returns an orthogonal unit vector to v.
 */
function getOrthogonalVector(v: [number, number, number]): [number, number, number] {
  const other: [number, number, number] = Math.abs(v[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cross: [number, number, number] = [
    v[1] * other[2] - v[2] * other[1],
    v[2] * other[0] - v[0] * other[2],
    v[0] * other[1] - v[1] * other[0],
  ];
  const len = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
  return [cross[0] / len, cross[1] / len, cross[2] / len];
}

/**
 * Internal helper: Rodrigues' rotation formula.
 * Rotates vector v around unit axis u by angle radians.
 */
function rodriguesRotation(
  v: [number, number, number],
  u: [number, number, number],
  angle: number,
): [number, number, number] {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const dot = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];

  const cross: [number, number, number] = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];

  const oneMinusCos = 1 - cosA;

  return [
    v[0] * cosA + cross[0] * sinA + u[0] * dot * oneMinusCos,
    v[1] * cosA + cross[1] * sinA + u[1] * dot * oneMinusCos,
    v[2] * cosA + cross[2] * sinA + u[2] * dot * oneMinusCos,
  ];
}

/**
 * Moves a GeoJSON Polygon or MultiPolygon to a new target centroid (targetLat, targetLng)
 * using an isometric rigid rotation on the unit sphere.
 * Preserves true shape and spherical surface area (geoArea) without Mercator distortion.
 */
export function movePolygonTo<T extends GeoJSON.Polygon | GeoJSON.MultiPolygon>(
  geometry: T,
  targetLat: number,
  targetLng: number,
): T {
  const [cLng, cLat] = geoCentroid(geometry);
  const v0 = latLngToVector3(cLat, cLng);
  const v1 = latLngToVector3(targetLat, targetLng);

  const dot = Math.max(-1, Math.min(1, v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2]));

  // If already at target position, return cloned geometry
  if (dot > 0.9999999) {
    return JSON.parse(JSON.stringify(geometry)) as T;
  }

  let u: [number, number, number];
  let angle: number;

  if (dot < -0.9999999) {
    // 180 degree rotation to antipode
    u = getOrthogonalVector(v0);
    angle = Math.PI;
  } else {
    const cross: [number, number, number] = [
      v0[1] * v1[2] - v0[2] * v1[1],
      v0[2] * v1[0] - v0[0] * v1[2],
      v0[0] * v1[1] - v0[1] * v1[0],
    ];
    const len = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
    u = [cross[0] / len, cross[1] / len, cross[2] / len];
    angle = Math.acos(dot);
  }

  const rotateCoord = (coord: GeoJSON.Position): GeoJSON.Position => {
    const lng = coord[0];
    const lat = coord[1];
    if (lng === undefined || lat === undefined) return coord;

    const v = latLngToVector3(lat, lng);
    const rot = rodriguesRotation(v, u, angle);
    const pos = vector3ToLatLng(rot[0], rot[1], rot[2]);

    const res: GeoJSON.Position = [pos.lng, pos.lat];
    if (coord.length > 2) {
      for (let i = 2; i < coord.length; i++) {
        const extra = coord[i];
        if (extra !== undefined) res.push(extra);
      }
    }
    return res;
  };

  if (geometry.type === 'Polygon') {
    const poly = geometry as GeoJSON.Polygon;
    const coordinates = poly.coordinates.map(ring => ring.map(rotateCoord));
    return {
      type: 'Polygon',
      coordinates,
    } as T;
  } else {
    const multi = geometry as GeoJSON.MultiPolygon;
    const coordinates = multi.coordinates.map(poly => poly.map(ring => ring.map(rotateCoord)));
    return {
      type: 'MultiPolygon',
      coordinates,
    } as T;
  }
}
