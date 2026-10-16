import { describe, it, expect } from 'vitest';
import { haversineDistanceKm, getDistanceColor } from '@/geo/spherical';

describe('Spherical Geometry & Haversine Distance', () => {
  it('calculates accurate distance between Warsaw and Krakow (~252 km)', () => {
    // Warsaw: 52.23, 21.01; Krakow: 50.06, 19.94
    const dist = haversineDistanceKm(52.23, 21.01, 50.06, 19.94);
    expect(dist).toBeGreaterThanOrEqual(250);
    expect(dist).toBeLessThanOrEqual(255);
  });

  it('calculates accurate trans-atlantic distance between Paris and New York (~5837 km)', () => {
    // Paris: 48.8566, 2.3522; New York: 40.7128, -74.006
    const dist = haversineDistanceKm(48.8566, 2.3522, 40.7128, -74.006);
    expect(dist).toBeGreaterThanOrEqual(5820);
    expect(dist).toBeLessThanOrEqual(5860);
  });

  it('returns 0 km distance for identical coordinates', () => {
    const dist = haversineDistanceKm(52.0, 19.0, 52.0, 19.0);
    expect(dist).toBe(0);
  });

  it('returns appropriate color thresholds for distance errors', () => {
    // <= 100 km: Emerald green
    expect(getDistanceColor(35)).toContain('0, 255, 170');
    // <= 500 km: Amber yellow
    expect(getDistanceColor(250)).toContain('255, 200, 50');
    // > 500 km: Coral red
    expect(getDistanceColor(1200)).toContain('255, 80, 80');
  });
});
