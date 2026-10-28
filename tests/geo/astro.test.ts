import { describe, it, expect } from 'vitest';
import {
  eclipticToEquatorial,
  equatorialToGeographic,
  geographicToSceneDirection,
  getJulianEphemerisDate,
  getJulianDate,
  gmstDeg,
  kmToScene,
  normalizeLng,
} from '@/geo/astro';

describe('astro helpers', () => {
  it('converts ecliptic to equatorial coordinates (Meeus example 13.a, Pollux)', () => {
    const eq = eclipticToEquatorial(113.21563, 6.68417, 23.4392911);
    expect(eq.ra).toBeCloseTo(116.328942, 4);
    expect(eq.dec).toBeCloseTo(28.026183, 4);
  });

  it('computes Greenwich mean sidereal time (Meeus example 12.a)', () => {
    // 1987-04-10 0h UT → 13h10m46.3668s = 197.693195°
    expect(gmstDeg(new Date(Date.UTC(1987, 3, 10)))).toBeCloseTo(197.693195, 3);
  });

  it('places a body at α = GMST over the prime meridian', () => {
    const date = new Date(Date.UTC(2026, 9, 28, 12));
    const point = equatorialToGeographic({ ra: gmstDeg(date), dec: 10 }, date);
    expect(point.lat).toBe(10);
    expect(Math.abs(point.lng)).toBeLessThan(1e-9);
  });

  it('uses globe.gl axes: Y north, Z prime meridian, X 90° E', () => {
    const near = (v: number[], e: number[]): void =>
      v.forEach((c, i) => expect(c).toBeCloseTo(e[i]!, 12));
    near(geographicToSceneDirection({ lat: 0, lng: 0 }), [0, 0, 1]);
    near(geographicToSceneDirection({ lat: 0, lng: 90 }), [1, 0, 0]);
    near(geographicToSceneDirection({ lat: 90, lng: 0 }), [0, 1, 0]);
  });

  it('handles time scales, longitudes and scene units', () => {
    const date = new Date(Date.UTC(2000, 0, 1, 12));
    expect(getJulianDate(date)).toBe(2451545);
    expect((getJulianEphemerisDate(date) - 2451545) * 86400).toBeCloseTo(69, 3);
    expect(normalizeLng(190)).toBe(-170);
    expect(normalizeLng(-180)).toBe(180);
    expect(kmToScene(6371)).toBe(100);
  });
});
