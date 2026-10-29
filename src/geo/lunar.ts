import {
  DEG2RAD,
  daysSinceJ2000,
  eclipticToEquatorial,
  equatorialToGeographic,
  geographicToSceneDirection,
  getJulianEphemerisDate,
  kmToScene,
  normalizeDeg,
  obliquityDeg,
  type EquatorialCoords,
  type GeoPoint,
} from './astro';
import { LUNAR_LAT_TERMS, LUNAR_LON_DIST_TERMS } from './lunar-terms';
import { calculateSunEclipticLongitude } from './solar';

/** Mean lunar radius, km. */
export const MOON_RADIUS_KM = 1737.4;
/** Speed of light, km/s (light travel time Earth–Moon). */
export const SPEED_OF_LIGHT_KM_S = 299_792.458;

export type MoonPhaseName =
  | 'new'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'full'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent';

export interface MoonPhase {
  /** Moon − Sun ecliptic longitude, degrees in [0, 360): 0 new, 90 first quarter, 180 full. */
  elongationDeg: number;
  /** Illuminated fraction of the disc, 0…1. */
  illuminatedFraction: number;
  waxing: boolean;
  phase: MoonPhaseName;
}

export interface LunarEcliptic {
  /** Geocentric ecliptic longitude, degrees in [0, 360). */
  lon: number;
  /** Geocentric ecliptic latitude, degrees. */
  lat: number;
  /** Distance between the centers of Earth and Moon, km. */
  distanceKm: number;
}

export interface MoonPosition extends GeoPoint {
  /** Distance between the centers of Earth and Moon, km. */
  distanceKm: number;
  ecliptic: LunarEcliptic;
  equatorial: EquatorialCoords;
}

/**
 * Geocentric ecliptic position of the Moon (Meeus, chapter 47; ~10″ in longitude, ~4″ in latitude).
 * Nutation is not applied, consistently with the Sun model, so the result is referred to the
 * mean equinox of date.
 *
 * @param jde Julian Ephemeris Date (TT).
 */
export function calculateMoonEcliptic(jde: number): LunarEcliptic {
  const T = (jde - 2451545.0) / 36525;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  const Lp = normalizeDeg(
    218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000,
  );
  const D = normalizeDeg(
    297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000,
  );
  const M = normalizeDeg(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  const Mp = normalizeDeg(
    134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000,
  );
  const F = normalizeDeg(
    93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000,
  );
  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479264.29 * T;
  const A3 = 313.45 + 481266.484 * T;
  // Eccentricity of Earth's orbit decreases; terms containing M are scaled by E^|M|
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const eccentricity = (m: number): number => (m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E);

  let sumL = 0;
  let sumR = 0;
  for (const [d, m, mp, f, l, r] of LUNAR_LON_DIST_TERMS) {
    const arg = (d * D + m * M + mp * Mp + f * F) * DEG2RAD;
    const e = eccentricity(m);
    sumL += l * e * Math.sin(arg);
    sumR += r * e * Math.cos(arg);
  }

  let sumB = 0;
  for (const [d, m, mp, f, b] of LUNAR_LAT_TERMS) {
    const arg = (d * D + m * M + mp * Mp + f * F) * DEG2RAD;
    sumB += b * eccentricity(m) * Math.sin(arg);
  }

  // Additive terms: Venus (A1), Jupiter (A2) and the flattening of the Earth (L′ − F)
  const sin = (deg: number): number => Math.sin(deg * DEG2RAD);
  sumL += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  sumB +=
    -2235 * sin(Lp) +
    382 * sin(A3) +
    175 * sin(A1 - F) +
    175 * sin(A1 + F) +
    127 * sin(Lp - Mp) -
    115 * sin(Lp + Mp);

  return {
    lon: normalizeDeg(Lp + sumL / 1e6),
    lat: sumB / 1e6,
    distanceKm: 385000.56 + sumR / 1000,
  };
}

/** Moon position for a UTC instant: ecliptic, equatorial and the point below it on Earth. */
export function calculateMoonPosition(date: Date = new Date()): MoonPosition {
  const ecliptic = calculateMoonEcliptic(getJulianEphemerisDate(date));
  const equatorial = eclipticToEquatorial(
    ecliptic.lon,
    ecliptic.lat,
    obliquityDeg(daysSinceJ2000(date)),
  );
  const subLunar = equatorialToGeographic(equatorial, date);
  return { ...subLunar, distanceKm: ecliptic.distanceKm, ecliptic, equatorial };
}

/** Moon center in scene units (Earth center at the origin, globe radius 100). */
export function calculateMoonScenePosition(
  date: Date = new Date(),
  globeRadius?: number,
): [number, number, number] {
  const position = calculateMoonPosition(date);
  const distance = kmToScene(position.distanceKm, globeRadius);
  const [x, y, z] = geographicToSceneDirection(position);
  return [x * distance, y * distance, z * distance];
}

/**
 * Direction of the north ecliptic pole in scene axes. The scene is Earth-fixed, so the pole
 * (α = 270°, δ = 90° − ε) sweeps around the Y axis once per sidereal day.
 */
export function calculateEclipticPoleDirection(date: Date = new Date()): [number, number, number] {
  const pole = equatorialToGeographic(
    { ra: 270, dec: 90 - obliquityDeg(daysSinceJ2000(date)) },
    date,
  );
  return geographicToSceneDirection(pole);
}

const PHASE_NAMES: readonly MoonPhaseName[] = [
  'new',
  'waxingCrescent',
  'firstQuarter',
  'waxingGibbous',
  'full',
  'waningGibbous',
  'lastQuarter',
  'waningCrescent',
];

/**
 * Phase of the Moon from the difference of the Moon's and Sun's ecliptic longitudes. The
 * illuminated fraction uses that elongation as the phase angle supplement (error < 1%, the
 * Moon's ecliptic latitude is ignored). Named phases split the cycle into eight 45° sectors
 * centred on new, quarters and full.
 */
export function calculateMoonPhase(date: Date = new Date()): MoonPhase {
  const moonLon = calculateMoonEcliptic(getJulianEphemerisDate(date)).lon;
  const elongationDeg = normalizeDeg(moonLon - calculateSunEclipticLongitude(date));
  const illuminatedFraction = (1 - Math.cos(elongationDeg * DEG2RAD)) / 2;
  const sector = Math.floor(normalizeDeg(elongationDeg + 22.5) / 45) % 8;
  return {
    elongationDeg,
    illuminatedFraction,
    waxing: elongationDeg < 180,
    phase: PHASE_NAMES[sector] ?? 'new',
  };
}
