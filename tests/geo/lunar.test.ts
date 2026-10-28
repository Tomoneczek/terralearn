import { describe, it, expect } from 'vitest';
import {
  calculateEclipticPoleDirection,
  calculateMoonEcliptic,
  calculateMoonPosition,
  calculateMoonScenePosition,
} from '@/geo/lunar';
import { eclipticToEquatorial, kmToScene } from '@/geo/astro';
import { calculateSunEclipticLongitude } from '@/geo/solar';
import { LUNAR_LAT_TERMS, LUNAR_LON_DIST_TERMS } from '@/geo/lunar-terms';

describe('Moon position (Meeus, chapter 47)', () => {
  it('has the complete periodic term tables', () => {
    expect(LUNAR_LON_DIST_TERMS).toHaveLength(60);
    expect(LUNAR_LAT_TERMS).toHaveLength(60);
  });

  it('reproduces Meeus example 47.a (1992-04-12 0h TD)', () => {
    const moon = calculateMoonEcliptic(2448724.5);
    expect(moon.lon).toBeCloseTo(133.162655, 4);
    expect(moon.lat).toBeCloseTo(-3.229126, 4);
    expect(Math.abs(moon.distanceKm - 368409.7)).toBeLessThan(1);

    // The book's α/δ include nutation (Δψ ≈ 0.0046°), which the model leaves out
    const eq = eclipticToEquatorial(moon.lon, moon.lat, 23.440636);
    expect(Math.abs(eq.ra - 134.68847)).toBeLessThan(0.01);
    expect(Math.abs(eq.dec - 13.768368)).toBeLessThan(0.01);
  });

  it('keeps the Earth–Moon distance between perigee and apogee limits through 2026', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 6 * 3600e3) {
      const { distanceKm } = calculateMoonPosition(new Date(t));
      min = Math.min(min, distanceKm);
      max = Math.max(max, distanceKm);
    }
    expect(min).toBeGreaterThan(356_000);
    expect(min).toBeLessThan(358_500);
    expect(max).toBeGreaterThan(405_500);
    expect(max).toBeLessThan(407_000);
  });

  it('repeats new moons every synodic month (29.53 days)', () => {
    // Elongation λ_moon − λ_sun crosses 0° (mod 360) at each new moon
    const elongation = (t: number): number => {
      const d = new Date(t);
      const e = calculateMoonPosition(d).ecliptic.lon - calculateSunEclipticLongitude(d);
      return (((e % 360) + 540) % 360) - 180;
    };
    const newMoons: number[] = [];
    let prev = elongation(Date.UTC(2026, 0, 1));
    for (let t = Date.UTC(2026, 0, 1) + 3600e3; t < Date.UTC(2026, 6, 1); t += 3600e3) {
      const e = elongation(t);
      if (prev < 0 && e >= 0) newMoons.push(t);
      prev = e;
    }
    expect(newMoons.length).toBeGreaterThanOrEqual(5);
    const gaps = newMoons.slice(1).map((t, i) => (t - newMoons[i]!) / 86_400_000);
    for (const gap of gaps) expect(Math.abs(gap - 29.53)).toBeLessThan(0.4);
    // 2026-01-18 ~19:52 UTC new moon (to the hour)
    expect(Math.abs(newMoons[0]! - Date.UTC(2026, 0, 18, 19, 52)) / 3600e3).toBeLessThan(1.5);
  });

  it('places the Moon in scene units at its real distance', () => {
    const date = new Date(Date.UTC(2026, 9, 28, 12));
    const [x, y, z] = calculateMoonScenePosition(date);
    const expected = kmToScene(calculateMoonPosition(date).distanceKm);
    expect(Math.hypot(x, y, z)).toBeCloseTo(expected, 6);
    expect(expected).toBeGreaterThan(5500);
    expect(expected).toBeLessThan(6500);
  });

  it('points the ecliptic pole 23.44° from the north pole', () => {
    const [, y] = calculateEclipticPoleDirection(new Date(Date.UTC(2026, 9, 28)));
    expect(Math.acos(y) * (180 / Math.PI)).toBeCloseTo(23.436, 2);
  });
});
