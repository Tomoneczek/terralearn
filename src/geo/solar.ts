export interface SubSolarPoint {
  lat: number;
  lng: number;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Mean solar radius (IAU 2015 nominal value), km. */
export const SUN_RADIUS_KM = 695_700;
/** Astronomical unit (IAU 2012), km. */
export const AU_KM = 149_597_870.7;

/**
 * Calculates the Julian Date from a JavaScript Date.
 */
export function getJulianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function daysSinceJ2000(date: Date): number {
  return getJulianDate(date) - 2451545.0;
}

/** Mean anomaly of the Sun in degrees for `n` days since J2000.0. */
function solarMeanAnomalyDeg(n: number): number {
  return (357.5291 + 0.98560028 * n) % 360;
}

/**
 * Calculates the sub-solar coordinates (latitude and longitude on Earth where
 * the Sun is at its zenith) for any UTC time using Meeus solar position formulas.
 */
export function calculateSubSolarPoint(date: Date = new Date()): SubSolarPoint {
  const n = daysSinceJ2000(date);
  const mRad = solarMeanAnomalyDeg(n) * DEG2RAD;

  // Mean longitude of the Sun (degrees)
  const L = (280.4665 + 0.98564736 * n) % 360;

  // Ecliptic longitude of the Sun (degrees)
  const lambda = L + 1.9148 * Math.sin(mRad) + 0.02 * Math.sin(2 * mRad);
  const lambdaRad = lambda * DEG2RAD;

  // Obliquity of the ecliptic (degrees)
  const epsilon = 23.43929 - 0.00000036 * n;
  const epsRad = epsilon * DEG2RAD;

  // Solar declination (latitude in degrees)
  const sinDec = Math.sin(epsRad) * Math.sin(lambdaRad);
  const decRad = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const subSolarLat = decRad * RAD2DEG;

  // Right Ascension (degrees)
  const y = Math.cos(epsRad) * Math.sin(lambdaRad);
  const x = Math.cos(lambdaRad);
  let alpha = Math.atan2(y, x) * RAD2DEG;
  if (alpha < 0) alpha += 360;

  // Greenwich Mean Sidereal Time (GMST) in degrees
  // 280.46061837 + 360.98564736629 * n
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;

  // Greenwich Hour Angle (GHA) of Sun = GMST - Alpha
  let gha = (gmst - alpha) % 360;
  if (gha < 0) gha += 360;

  // Subsolar longitude = -GHA (normalized to -180..180)
  let subSolarLng = -gha;
  while (subSolarLng <= -180) subSolarLng += 360;
  while (subSolarLng > 180) subSolarLng -= 360;

  return {
    lat: subSolarLat,
    lng: subSolarLng,
  };
}

/**
 * Calculates the unit 3D direction vector pointing from the Earth center towards the Sun
 * in Three.js coordinate space.
 * Globe.gl orientation:
 * - Y is North
 * - X / Z correspond to Equator plane (Z is Prime Meridian, X is 90° East)
 */
export function calculateSunDirection(date: Date = new Date()): [number, number, number] {
  const { lat, lng } = calculateSubSolarPoint(date);
  const latRad = lat * DEG2RAD;
  const lngRad = lng * DEG2RAD;

  const y = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const x = cosLat * Math.sin(lngRad);
  const z = cosLat * Math.cos(lngRad);

  return [x, y, z];
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
