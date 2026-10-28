import {
  DEG2RAD,
  RAD2DEG,
  daysSinceJ2000,
  eclipticToEquatorial,
  equatorialToGeographic,
  geographicToSceneDirection,
  obliquityDeg,
  type GeoPoint,
} from './astro';

export { getJulianDate } from './astro';

export type SubSolarPoint = GeoPoint;

/** Mean solar radius (IAU 2015 nominal value), km. */
export const SUN_RADIUS_KM = 695_700;
/** Astronomical unit (IAU 2012), km. */
export const AU_KM = 149_597_870.7;

/** Mean anomaly of the Sun in degrees for `n` days since J2000.0. */
function solarMeanAnomalyDeg(n: number): number {
  return (357.5291 + 0.98560028 * n) % 360;
}

/** Apparent ecliptic longitude of the Sun in degrees (its ecliptic latitude is ~0). */
export function calculateSunEclipticLongitude(date: Date = new Date()): number {
  const n = daysSinceJ2000(date);
  const mRad = solarMeanAnomalyDeg(n) * DEG2RAD;
  // Mean longitude + equation of center
  const L = (280.4665 + 0.98564736 * n) % 360;
  return L + 1.9148 * Math.sin(mRad) + 0.02 * Math.sin(2 * mRad);
}

/**
 * Calculates the sub-solar coordinates (latitude and longitude on Earth where
 * the Sun is at its zenith) for any UTC time using Meeus solar position formulas.
 */
export function calculateSubSolarPoint(date: Date = new Date()): SubSolarPoint {
  const lambda = calculateSunEclipticLongitude(date);
  const equatorial = eclipticToEquatorial(lambda, 0, obliquityDeg(daysSinceJ2000(date)));
  return equatorialToGeographic(equatorial, date);
}

/**
 * Calculates the unit 3D direction vector pointing from the Earth center towards the Sun
 * in Three.js coordinate space.
 * Globe.gl orientation:
 * - Y is North
 * - X / Z correspond to Equator plane (Z is Prime Meridian, X is 90° East)
 */
export function calculateSunDirection(date: Date = new Date()): [number, number, number] {
  return geographicToSceneDirection(calculateSubSolarPoint(date));
}

/**
 * Earth–Sun distance in astronomical units (Meeus, low-precision series in the mean anomaly).
 * Ranges from ~0.9833 AU at perihelion (early January) to ~1.0167 AU at aphelion (early July).
 */
export function calculateSunDistanceAu(date: Date = new Date()): number {
  const mRad = solarMeanAnomalyDeg(daysSinceJ2000(date)) * DEG2RAD;
  return 1.00014 - 0.01671 * Math.cos(mRad) - 0.00014 * Math.cos(2 * mRad);
}

/**
 * Apparent angular diameter of the solar disc seen from Earth, in degrees
 * (~0.542° at perihelion, ~0.524° at aphelion).
 */
export function calculateSunAngularDiameterDeg(date: Date = new Date()): number {
  const distanceKm = calculateSunDistanceAu(date) * AU_KM;
  return 2 * Math.atan(SUN_RADIUS_KM / distanceKm) * RAD2DEG;
}
