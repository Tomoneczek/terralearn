/**
 * Shared astronomy helpers for the Sun and Moon models: time scales, sidereal time and the
 * conversion chain ecliptic → equatorial → geographic (point directly below the body) → scene.
 */

import { EARTH_RADIUS_KM } from './spherical';

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** Globe radius in scene units (globe.gl default); maps to {@link EARTH_RADIUS_KM}. */
export const GLOBE_RADIUS = 100;

/**
 * TT − UT (ΔT) in seconds, held constant at its 2020s value. Only the Moon needs it: it moves
 * ~0.5″ per second, so ignoring ΔT would shift it by ~35″.
 */
export const DELTA_T_SECONDS = 69;

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface EquatorialCoords {
  /** Right ascension, degrees in [0, 360). */
  ra: number;
  /** Declination, degrees. */
  dec: number;
}

/** Julian Date (UT) of a JavaScript Date. */
export function getJulianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Julian Ephemeris Date (TT) of a JavaScript Date, using the constant ΔT. */
export function getJulianEphemerisDate(date: Date): number {
  return getJulianDate(date) + DELTA_T_SECONDS / 86400;
}

/** Days (UT) since the J2000.0 epoch. */
export function daysSinceJ2000(date: Date): number {
  return getJulianDate(date) - 2451545.0;
}

/** Normalizes an angle to [0, 360). */
export function normalizeDeg(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Normalizes a longitude to (−180, 180]. */
export function normalizeLng(deg: number): number {
  const r = normalizeDeg(deg);
  return r > 180 ? r - 360 : r;
}

/** Mean obliquity of the ecliptic in degrees (low-precision, `n` days since J2000.0). */
export function obliquityDeg(n: number): number {
  return 23.43929 - 0.00000036 * n;
}

/** Greenwich Mean Sidereal Time in degrees. */
export function gmstDeg(date: Date): number {
  return normalizeDeg(280.46061837 + 360.98564736629 * daysSinceJ2000(date));
}

/** Ecliptic (λ, β) → equatorial (α, δ) for obliquity ε, all in degrees. */
export function eclipticToEquatorial(
  lambdaDeg: number,
  betaDeg: number,
  epsilonDeg: number,
): EquatorialCoords {
  const l = lambdaDeg * DEG2RAD;
  const b = betaDeg * DEG2RAD;
  const e = epsilonDeg * DEG2RAD;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const sinDec = Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l);
  return {
    ra: normalizeDeg(ra * RAD2DEG),
    dec: Math.asin(Math.max(-1, Math.min(1, sinDec))) * RAD2DEG,
  };
}

/** Point on Earth with the body at its zenith: latitude = δ, longitude = α − GMST. */
export function equatorialToGeographic(coords: EquatorialCoords, date: Date): GeoPoint {
  return { lat: coords.dec, lng: normalizeLng(coords.ra - gmstDeg(date)) };
}

/**
 * Unit vector from the Earth center towards a geographic point, in globe.gl scene axes:
 * Y is north, Z is the prime meridian, X is 90° E.
 */
export function geographicToSceneDirection(point: GeoPoint): [number, number, number] {
  const latRad = point.lat * DEG2RAD;
  const lngRad = point.lng * DEG2RAD;
  const cosLat = Math.cos(latRad);
  return [cosLat * Math.sin(lngRad), Math.sin(latRad), cosLat * Math.cos(lngRad)];
}

/** Converts kilometres to scene units (Earth radius = {@link GLOBE_RADIUS}). */
export function kmToScene(km: number, globeRadius: number = GLOBE_RADIUS): number {
  return (km / EARTH_RADIUS_KM) * globeRadius;
}
