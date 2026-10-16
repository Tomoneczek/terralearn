export const EARTH_RADIUS_KM = 6371;

/**
 * Calculates great-circle distance between two points on Earth in kilometers using Haversine formula.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
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

export interface ArcItem {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
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
