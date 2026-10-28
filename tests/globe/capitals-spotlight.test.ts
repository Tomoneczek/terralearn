import { describe, it, expect } from 'vitest';
import {
  CAPITALS_SPOTLIGHT_DEFAULTS as P,
  HOVERED_MIN_OPACITY,
  computeCapitalOpacity,
  computeFacing,
  computePointScale,
  computeRankScale,
  computeZoomFade,
  findNearestCapital,
  smoothstep,
  type ScreenCapital,
} from '@/globe/capitals-spotlight';

const VIEWPORT_MIN = 800;
const base = { viewportMinPx: VIEWPORT_MIN, rankScale: 1, zoomFade: 1, facing: 1 } as const;

describe('smoothstep', () => {
  it('is 0 below, 1 above and monotonic in between', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 6);
    expect(smoothstep(0, 1, 0.3)).toBeLessThan(smoothstep(0, 1, 0.6));
  });

  it('degrades to a step for equal edges', () => {
    expect(smoothstep(1, 1, 0.5)).toBe(0);
    expect(smoothstep(1, 1, 1.5)).toBe(1);
  });
});

describe('computeZoomFade', () => {
  it('hides everything when the whole globe is in view', () => {
    expect(computeZoomFade(2.2, P)).toBe(0);
    expect(computeZoomFade(P.zoomHideAltitude, P)).toBe(0);
  });

  it('is fully on when zoomed in and continuous in between', () => {
    expect(computeZoomFade(P.zoomFullAltitude, P)).toBe(1);
    expect(computeZoomFade(0.5, P)).toBe(1);
    const mid = computeZoomFade((P.zoomHideAltitude + P.zoomFullAltitude) / 2, P);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('computePointScale', () => {
  // Regression: markers kept a fixed ~7 px size at every zoom and disappeared on busy textures.
  it('is 1 where capitals become visible and grows towards the close zoom', () => {
    expect(computePointScale(P.zoomFullAltitude, P)).toBe(1);
    expect(computePointScale(P.zoomHideAltitude, P)).toBe(1);
    expect(computePointScale(P.pointScaleCloseAltitude, P)).toBeCloseTo(P.pointZoomScale, 6);
    expect(computePointScale(0.05, P)).toBeCloseTo(P.pointZoomScale, 6);
  });

  it('increases monotonically as the camera approaches', () => {
    let previous = 0;
    for (
      let altitude = P.zoomFullAltitude;
      altitude >= P.pointScaleCloseAltitude;
      altitude -= 0.05
    ) {
      const scale = computePointScale(altitude, P);
      expect(scale).toBeGreaterThanOrEqual(previous);
      previous = scale;
    }
  });

  it('makes the on-screen marker clearly larger at close zoom', () => {
    const far = P.pointSize * computePointScale(P.zoomFullAltitude, P);
    const close = P.pointSize * computePointScale(0.3, P);
    expect(close).toBeGreaterThan(far * 1.8);
  });
});

describe('computeRankScale', () => {
  it('stays within [min, max] and grows with population', () => {
    const small = computeRankScale(1_000, P);
    const medium = computeRankScale(1_000_000, P);
    const huge = computeRankScale(35_000_000, P);
    expect(small).toBeCloseTo(P.rankScaleMin, 6);
    expect(huge).toBeCloseTo(P.rankScaleMax, 6);
    expect(medium).toBeGreaterThan(small);
    expect(medium).toBeLessThan(huge);
  });

  it('falls back to a neutral scale without usable population', () => {
    expect(computeRankScale(undefined, P)).toBe(1);
    expect(computeRankScale(0, P)).toBe(1);
    expect(computeRankScale(Number.NaN, P)).toBe(1);
  });
});

describe('computeFacing', () => {
  it('hides points behind the horizon and shows those facing the camera', () => {
    // camera at 3 radii: the horizon is at cos = 1/3
    expect(computeFacing(0.1, 100, 300)).toBe(0);
    expect(computeFacing(1, 100, 300)).toBe(1);
  });
});

describe('computeCapitalOpacity', () => {
  it('is fully opaque at the screen center and invisible beyond the fade radius', () => {
    expect(computeCapitalOpacity({ ...base, distPx: 0 }, P)).toBe(1);
    expect(computeCapitalOpacity({ ...base, distPx: P.fadeRadius * VIEWPORT_MIN + 1 }, P)).toBe(0);
  });

  it('decreases monotonically with the distance from the center', () => {
    let previous = 2;
    for (let d = 0; d <= 400; d += 20) {
      const o = computeCapitalOpacity({ ...base, distPx: d }, P);
      expect(o).toBeLessThanOrEqual(previous);
      previous = o;
    }
  });

  it('lights larger capitals in a wider circle', () => {
    const distPx = 250;
    const small = computeCapitalOpacity({ ...base, distPx, rankScale: P.rankScaleMin }, P);
    const large = computeCapitalOpacity({ ...base, distPx, rankScale: P.rankScaleMax }, P);
    expect(large).toBeGreaterThan(small);
  });

  it('scales the circle with the viewport', () => {
    const distPx = 150;
    const small = computeCapitalOpacity({ ...base, viewportMinPx: 400, distPx }, P);
    const large = computeCapitalOpacity({ ...base, viewportMinPx: 1200, distPx }, P);
    expect(large).toBeGreaterThan(small);
  });

  it('is zero when zoomed out or behind the globe', () => {
    expect(computeCapitalOpacity({ ...base, distPx: 0, zoomFade: 0 }, P)).toBe(0);
    expect(computeCapitalOpacity({ ...base, distPx: 0, facing: 0 }, P)).toBe(0);
  });

  it('keeps hovered and selected capitals visible, but still hides them behind the globe', () => {
    const far = { ...base, distPx: 10_000 };
    expect(computeCapitalOpacity({ ...far, state: 2 }, P)).toBe(1);
    expect(computeCapitalOpacity({ ...far, state: 1 }, P)).toBe(HOVERED_MIN_OPACITY);
    expect(computeCapitalOpacity({ ...far, state: 0 }, P)).toBe(0);
    expect(computeCapitalOpacity({ ...far, state: 2, zoomFade: 0 }, P)).toBe(1);
    expect(computeCapitalOpacity({ ...far, state: 2, facing: 0 }, P)).toBe(0);
  });
});

function screen(id: string, x: number, y: number, distPx: number, opacity: number): ScreenCapital {
  return { id, x, y, distPx, opacity };
}

describe('findNearestCapital', () => {
  const items = [
    screen('a', 100, 100, 0, 1),
    screen('b', 108, 100, 0, 1),
    screen('hidden', 200, 200, 0, 0.05),
  ];

  it('returns the nearest capital within the hit radius', () => {
    expect(findNearestCapital(items, { x: 105, y: 100 }, P)).toBe('b');
    expect(findNearestCapital(items, { x: 99, y: 100 }, P)).toBe('a');
  });

  it('ignores capitals that are too faint to interact with', () => {
    expect(findNearestCapital(items, { x: 200, y: 200 }, P)).toBeNull();
  });

  // Regression: zoomed out to a whole continent (zoom fade ~0.15) every capital is drawn faint but
  // visible; a 0.3 threshold made Warsaw unclickable and the click selected Poland underneath.
  it('lets every clearly visible capital be clicked, also at the continent zoom', () => {
    const altitude = 1.65;
    const zoomFade = computeZoomFade(altitude, P);
    const opacity = computeCapitalOpacity({ ...base, distPx: 0, zoomFade }, P);
    // Drawn faint but visible: below the old 0.3 threshold that swallowed the click.
    expect(opacity).toBeGreaterThan(0.12);
    expect(opacity).toBeLessThan(0.3);
    expect(
      findNearestCapital([screen('capital-warsaw', 300, 300, 0, opacity)], { x: 302, y: 301 }, P),
    ).toBe('capital-warsaw');
  });

  it('returns null outside the hit radius', () => {
    expect(findNearestCapital(items, { x: 100 + P.hitRadiusPx + 50, y: 100 }, P)).toBeNull();
  });
});
