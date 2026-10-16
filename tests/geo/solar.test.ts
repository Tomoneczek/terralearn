import { describe, it, expect } from 'vitest';
import { calculateSubSolarPoint, calculateSunDirection, getJulianDate } from '@/geo/solar';

describe('Solar Astronomical Calculations', () => {
  it('calculates Julian Date correctly for known epochs', () => {
    // J2000.0 epoch: Jan 1, 2000 12:00 UTC = 2451545.0
    const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    expect(getJulianDate(j2000)).toBeCloseTo(2451545.0, 4);
  });

  it('determines sub-solar latitude near equator on Spring Equinox', () => {
    // March 20, 2026, 12:00 UTC
    const date = new Date(Date.UTC(2026, 2, 20, 12, 0, 0));
    const { lat, lng } = calculateSubSolarPoint(date);

    expect(lat).toBeGreaterThanOrEqual(-1.5);
    expect(lat).toBeLessThanOrEqual(1.5);
    expect(lng).toBeGreaterThanOrEqual(-5);
    expect(lng).toBeLessThanOrEqual(5);
  });

  it('determines sub-solar latitude at Tropic of Cancer on Summer Solstice', () => {
    // June 21, 2026, 12:00 UTC
    const date = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
    const { lat, lng } = calculateSubSolarPoint(date);

    expect(lat).toBeGreaterThan(23.0);
    expect(lat).toBeLessThan(23.6);
    expect(lng).toBeGreaterThanOrEqual(-5);
    expect(lng).toBeLessThanOrEqual(5);
  });

  it('determines sub-solar latitude near equator on Autumn Equinox', () => {
    // Sept 22, 2026, 12:00 UTC
    const date = new Date(Date.UTC(2026, 8, 22, 12, 0, 0));
    const { lat, lng } = calculateSubSolarPoint(date);

    expect(lat).toBeGreaterThanOrEqual(-1.5);
    expect(lat).toBeLessThanOrEqual(1.5);
    expect(lng).toBeGreaterThanOrEqual(-5);
    expect(lng).toBeLessThanOrEqual(5);
  });

  it('determines sub-solar latitude at Tropic of Capricorn on Winter Solstice', () => {
    // Dec 21, 2026, 12:00 UTC
    const date = new Date(Date.UTC(2026, 11, 21, 12, 0, 0));
    const { lat, lng } = calculateSubSolarPoint(date);

    expect(lat).toBeLessThan(-23.0);
    expect(lat).toBeGreaterThan(-23.6);
    expect(lng).toBeGreaterThanOrEqual(-5);
    expect(lng).toBeLessThanOrEqual(5);
  });

  it('shifts subsolar longitude as Earth rotates through the day', () => {
    // 06:00 UTC -> Sun is East (+90 deg lng)
    const morning = new Date(Date.UTC(2026, 5, 21, 6, 0, 0));
    const { lng: lngMorning } = calculateSubSolarPoint(morning);
    expect(lngMorning).toBeGreaterThan(80);
    expect(lngMorning).toBeLessThan(100);

    // 18:00 UTC -> Sun is West (-90 deg lng)
    const evening = new Date(Date.UTC(2026, 5, 21, 18, 0, 0));
    const { lng: lngEvening } = calculateSubSolarPoint(evening);
    expect(lngEvening).toBeLessThan(-80);
    expect(lngEvening).toBeGreaterThan(-100);
  });

  it('generates a normalized 3D sun direction unit vector', () => {
    const dir = calculateSunDirection(new Date(Date.UTC(2026, 5, 21, 12, 0, 0)));
    const magnitude = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
    expect(magnitude).toBeCloseTo(1.0, 5);
  });
});
