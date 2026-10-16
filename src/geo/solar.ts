export interface SubSolarPoint {
  lat: number;
  lng: number;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Calculates the Julian Date from a JavaScript Date.
 */
export function getJulianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Calculates the sub-solar coordinates (latitude and longitude on Earth where
 * the Sun is at its zenith) for any UTC time using Meeus solar position formulas.
 */
export function calculateSubSolarPoint(date: Date = new Date()): SubSolarPoint {
  const jd = getJulianDate(date);
  const n = jd - 2451545.0; // Days since J2000.0

  // Mean anomaly of the Sun (degrees)
  const M = (357.5291 + 0.98560028 * n) % 360;
  const mRad = M * DEG2RAD;

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
