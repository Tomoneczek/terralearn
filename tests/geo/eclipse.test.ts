import { describe, it, expect } from 'vitest';
import { angleBetween, discOcclusionFraction, shadowAxisDistance } from '@/geo/eclipse';
import { calculateMoonScenePosition } from '@/geo/lunar';
import { calculateSunDirection } from '@/geo/solar';
import { GLOBE_RADIUS } from '@/geo/astro';

/** Smallest Moon–shadow-axis distance (Earth radii) on `side` within ±3 h of `iso`. */
function minGamma(iso: string, side: 1 | -1): { gamma: number; at: Date } {
  const t0 = Date.parse(iso);
  let best = { gamma: Infinity, at: new Date(t0) };
  for (let t = t0 - 3 * 3600e3; t <= t0 + 3 * 3600e3; t += 30e3) {
    const d = new Date(t);
    const axis = shadowAxisDistance(
      calculateMoonScenePosition(d),
      calculateSunDirection(d),
      GLOBE_RADIUS,
    );
    if (axis.side === side && axis.distance < best.gamma) best = { gamma: axis.distance, at: d };
  }
  return best;
}

describe('discOcclusionFraction', () => {
  const rs = 0.00466;

  it('is 0 for separated discs and 1 for a total eclipse', () => {
    expect(discOcclusionFraction(0.02, rs, 0.0045)).toBe(0);
    expect(discOcclusionFraction(rs + 0.0045, rs, 0.0045)).toBe(0);
    expect(discOcclusionFraction(0, rs, 0.0049)).toBe(1);
    expect(discOcclusionFraction(0.0002, rs, 0.0049)).toBe(1);
  });

  it('gives (r/R)² for a centred annular eclipse', () => {
    expect(discOcclusionFraction(0, rs, 0.0044)).toBeCloseTo((0.0044 / rs) ** 2, 10);
  });

  it('is continuous and decreasing with separation', () => {
    let prev = 1;
    for (let d = 0; d <= 0.0096; d += 0.00005) {
      const f = discOcclusionFraction(d, rs, 0.0048);
      expect(f).toBeLessThanOrEqual(prev + 1e-9);
      expect(prev - f).toBeLessThan(0.02);
      prev = f;
    }
    // Two equal discs, centres one radius apart: lens area / circle area
    const lens = (2 * Math.acos(0.5) - 0.5 * Math.sqrt(3)) / Math.PI;
    expect(discOcclusionFraction(rs, rs, rs)).toBeCloseTo(lens, 9);
  });

  it('is symmetric in the sign of the separation', () => {
    expect(discOcclusionFraction(-0.003, rs, 0.0047)).toBe(
      discOcclusionFraction(0.003, rs, 0.0047),
    );
  });
});

describe('angleBetween', () => {
  it('stays accurate for tiny angles where acos would not', () => {
    const tiny = 1e-6;
    expect(angleBetween([1, 0, 0], [Math.cos(tiny), Math.sin(tiny), 0])).toBeCloseTo(tiny, 12);
    expect(angleBetween([0, 0, 2], [0, 3, 0])).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe('eclipses of 2026 (NASA catalogue)', () => {
  it('total solar eclipse 2026-08-12: Moon shadow axis passes 0.898 Earth radii from the center', () => {
    const { gamma, at } = minGamma('2026-08-12T17:46:00Z', 1);
    expect(Math.abs(gamma - 0.8977)).toBeLessThan(0.03);
    expect(Math.abs(at.getTime() - Date.parse('2026-08-12T17:46:00Z'))).toBeLessThan(10 * 60e3);
  });

  it("total lunar eclipse 2026-03-03: Moon passes 0.377 Earth radii from Earth's shadow axis", () => {
    const { gamma, at } = minGamma('2026-03-03T11:33:00Z', -1);
    expect(Math.abs(gamma - 0.3765)).toBeLessThan(0.03);
    expect(Math.abs(at.getTime() - Date.parse('2026-03-03T11:33:00Z'))).toBeLessThan(10 * 60e3);
  });

  it('full moon of 2026-04-02 misses the Earth shadow entirely', () => {
    // Penumbra radius at the Moon's distance is ~1.3 Earth radii (+ Moon radius 0.27)
    expect(minGamma('2026-04-02T02:12:00Z', -1).gamma).toBeGreaterThan(1.6);
  });
});
