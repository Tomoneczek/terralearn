import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '@/i18n';
import {
  getPolygonAltitude,
  getPolygonCapColor,
  getPolygonSideColor,
  getPolygonStrokeColor,
  getPathColor,
  getPathStroke,
  getPathAltitude,
  getPointColor,
  getPointRadius,
  getPointAltitude,
} from '@/layers/styles';
import {
  formatLabelText,
  getLabelSize,
  getLabelDotRadius,
  getLabelAltitude,
  selectVisibleLabels,
} from '@/globe/labels';
import { getLayer } from '@/layers/registry';
import type { GeoFeature } from '@/globe/data-loader';

// The app defaults to English; these tests assert Polish copy, so pin the locale explicitly.
beforeEach(() => setLocale('pl'));

describe('Layer Styling and Altitude Layering', () => {
  const mockCountry: GeoFeature = {
    type: 'Feature',
    properties: {
      id: 'c1',
      layerId: 'countriesTopN',
      kind: 'country',
      name_pl: 'Polska',
      name_en: 'Poland',
      rank: { order: 1, area: 312696 },
    },
    geometry: { type: 'Polygon', coordinates: [] },
  };

  const mockBorder: GeoFeature = {
    type: 'Feature',
    properties: {
      id: 'b1',
      layerId: 'borders',
      kind: 'country',
      name_pl: 'Niemcy',
      name_en: 'Germany',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  };

  const mockLake: GeoFeature = {
    type: 'Feature',
    properties: {
      id: 'l1',
      layerId: 'lakes',
      kind: 'lake',
      name_pl: 'Bajkał',
      name_en: 'Baikal',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  };

  const mockDesert: GeoFeature = {
    type: 'Feature',
    properties: {
      id: 'd1',
      layerId: 'deserts',
      kind: 'desert',
      name_pl: 'Sahara',
      name_en: 'Sahara',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  };

  const mockEverest: GeoFeature = {
    type: 'Feature',
    properties: {
      id: 'm1',
      layerId: 'mountains',
      kind: 'mountain',
      name_pl: 'Himalaje',
      name_en: 'Himalayas',
      rank: { elevation: 8848 },
    },
    geometry: { type: 'Polygon', coordinates: [] },
  };

  const mockAlps: GeoFeature = {
    type: 'Feature',
    properties: {
      id: 'm2',
      layerId: 'mountains',
      kind: 'mountain',
      name_pl: 'Alpy',
      name_en: 'Alps',
      rank: { elevation: 4808 },
    },
    geometry: { type: 'Polygon', coordinates: [] },
  };

  const mockRiver: GeoFeature = {
    type: 'Feature',
    properties: {
      id: 'r1',
      layerId: 'rivers',
      kind: 'river',
      name_pl: 'Nil',
      name_en: 'Nile',
    },
    geometry: { type: 'LineString', coordinates: [] },
  };

  const mockTokyo: GeoFeature = {
    type: 'Feature',
    properties: {
      id: 'city-1',
      layerId: 'megacities',
      kind: 'megacity',
      name_pl: 'Tokio',
      name_en: 'Tokyo',
      rank: { population: 37400000 },
    },
    geometry: { type: 'Point', coordinates: [139.69, 35.68] },
  };

  const mockWarsaw: GeoFeature = {
    type: 'Feature',
    properties: {
      id: 'city-2',
      layerId: 'capitals',
      kind: 'capital',
      name_pl: 'Warszawa',
      name_en: 'Warsaw',
      rank: { population: 1800000 },
    },
    geometry: { type: 'Point', coordinates: [21.01, 52.23] },
  };

  const mockPeak: GeoFeature = {
    type: 'Feature',
    properties: {
      id: 'p1',
      layerId: 'peaks',
      kind: 'peak',
      name_pl: 'Mount Everest',
      name_en: 'Mount Everest',
      rank: { elevation: 8848 },
    },
    geometry: { type: 'Point', coordinates: [86.92, 27.98] },
  };

  describe('Polygon Altitude Stacking (Anti Z-Fighting)', () => {
    it('enforces strict altitude hierarchy across physical and political layers', () => {
      const borderAlt = getPolygonAltitude(mockBorder, false, false, getLayer('borders'));
      const desertAlt = getPolygonAltitude(mockDesert, false, false, getLayer('deserts'));
      const lakeAlt = getPolygonAltitude(mockLake, false, false, getLayer('lakes'));
      const countryAlt = getPolygonAltitude(mockCountry, false, false, getLayer('countriesTopN'));
      const mountainAlt = getPolygonAltitude(mockEverest, false, false, getLayer('mountains'));

      expect(borderAlt).toBe(0.004);
      expect(desertAlt).toBe(0.005);
      expect(lakeAlt).toBe(0.007);
      expect(countryAlt).toBe(0.012);
      expect(mountainAlt).toBeGreaterThan(countryAlt);

      // Hierarchy: border < desert < lake < country < mountain
      expect(borderAlt).toBeLessThan(desertAlt);
      expect(desertAlt).toBeLessThan(lakeAlt);
      expect(lakeAlt).toBeLessThan(countryAlt);
      expect(countryAlt).toBeLessThan(mountainAlt);
    });

    it('scales mountain altitude proportionally by elevation', () => {
      const everestAlt = getPolygonAltitude(mockEverest, false, false, getLayer('mountains'));
      const alpsAlt = getPolygonAltitude(mockAlps, false, false, getLayer('mountains'));

      expect(everestAlt).toBeGreaterThan(alpsAlt);
      expect(everestAlt).toBeCloseTo(0.048, 2);
      expect(alpsAlt).toBeCloseTo(0.033, 2);
    });

    it('elevates polygon on selection and hover', () => {
      const base = getPolygonAltitude(mockCountry, false, false, getLayer('countriesTopN'));
      const hovered = getPolygonAltitude(mockCountry, false, true, getLayer('countriesTopN'));
      const selected = getPolygonAltitude(mockCountry, true, false, getLayer('countriesTopN'));

      expect(hovered).toBe(base + 0.004);
      expect(selected).toBe(base + 0.012);
    });
  });

  describe('Polygon Color Accessors', () => {
    it('returns highlighted fill, border, and side colors when selected', () => {
      const cap = getPolygonCapColor(mockCountry, true, false, getLayer('countriesTopN'));
      const side = getPolygonSideColor(mockCountry, true, false, getLayer('countriesTopN'));
      const stroke = getPolygonStrokeColor(mockCountry, true, false, getLayer('countriesTopN'));

      expect(cap).toContain('hsla(180, 100%, 70%');
      expect(side).toContain('hsla(180, 100%, 50%');
      expect(stroke).toBe('hsl(50, 100%, 65%)'); // Gold accent
    });

    it('returns cyan glow when hovered', () => {
      const cap = getPolygonCapColor(mockCountry, false, true, getLayer('countriesTopN'));
      const stroke = getPolygonStrokeColor(mockCountry, false, true, getLayer('countriesTopN'));

      expect(cap).toContain('hsla(180, 100%, 80%');
      expect(stroke).toBe('hsl(180, 100%, 80%)');
    });

    it('falls back to layer definition styles when idle', () => {
      const cap = getPolygonCapColor(mockLake, false, false, getLayer('lakes'));
      const stroke = getPolygonStrokeColor(mockLake, false, false, getLayer('lakes'));

      expect(cap).toContain('hsla(190, 100%, 60%');
      expect(stroke).toContain('hsl(190, 100%, 75%)');
    });
  });

  describe('Path and River Styling', () => {
    it('returns river color and highlights', () => {
      const idle = getPathColor(mockRiver, false, false, getLayer('rivers'));
      const hovered = getPathColor(mockRiver, false, true, getLayer('rivers'));
      const selected = getPathColor(mockRiver, true, false, getLayer('rivers'));

      expect(idle).toContain('hsl(190, 100%, 65%)');
      expect(hovered).toContain('hsl(180, 100%, 85%)');
      expect(selected).toBe('hsl(50, 100%, 70%)');
    });

    it('returns stroke width and elevated altitude', () => {
      expect(getPathStroke(mockRiver, getLayer('rivers'))).toBe(1.5);
      expect(getPathAltitude()).toBe(0.014);

      // Regression: rivers sat below the country caps, so the caps won every pointer pick.
      for (const layerId of [
        'countriesTopN',
        'borders',
        'lakes',
        'landforms',
        'deserts',
        'marine',
      ]) {
        const feat = { ...mockCountry, properties: { ...mockCountry.properties, layerId } };
        expect(getPathAltitude()).toBeGreaterThan(getPolygonAltitude(feat, false, false));
      }
    });

    it('scales river stroke width and color brightness by length rank', () => {
      const longRiver: GeoFeature = {
        type: 'Feature',
        properties: {
          id: 'r-long',
          layerId: 'rivers',
          kind: 'river',
          name_pl: 'Amazonka',
          name_en: 'Amazon',
          rank: { length: 6400, order: 1 },
        },
        geometry: { type: 'LineString', coordinates: [] },
      };

      const shortRiver: GeoFeature = {
        type: 'Feature',
        properties: {
          id: 'r-short',
          layerId: 'rivers',
          kind: 'river',
          name_pl: 'Krótka Rzeka',
          name_en: 'Short River',
          rank: { length: 900, order: 48 },
        },
        geometry: { type: 'LineString', coordinates: [] },
      };

      const longStroke = getPathStroke(longRiver, getLayer('rivers'));
      const shortStroke = getPathStroke(shortRiver, getLayer('rivers'));
      expect(longStroke).toBeGreaterThan(shortStroke);
      expect(longStroke).toBeGreaterThanOrEqual(2.2);
      expect(shortStroke).toBeLessThanOrEqual(1.2);

      const longColor = getPathColor(longRiver, false, false, getLayer('rivers'));
      const shortColor = getPathColor(shortRiver, false, false, getLayer('rivers'));
      // Extract lightness percentages
      const matchLong = longColor.match(/(\d+)%\)/);
      const matchShort = shortColor.match(/(\d+)%\)/);
      const longL = Number(matchLong?.[1]);
      const shortL = Number(matchShort?.[1]);

      expect(longL).toBeGreaterThan(shortL);
      expect(longL).toBeGreaterThanOrEqual(75);
      expect(shortL).toBeLessThanOrEqual(60);
    });
  });

  describe('Point and Settlement Styling', () => {
    it('scales megacity radius logarithmically with population', () => {
      const tokyoRadius = getPointRadius(mockTokyo, getLayer('megacities'));
      const warsawRadius = getPointRadius(mockWarsaw, getLayer('capitals'));
      const peakRadius = getPointRadius(mockPeak, getLayer('peaks'));

      expect(tokyoRadius).toBeGreaterThan(warsawRadius);
      expect(warsawRadius).toBe(0.28);
      expect(peakRadius).toBe(0.24);
    });

    it('elevates peaks above standard settlements', () => {
      const peakAlt = getPointAltitude(mockPeak);
      const cityAlt = getPointAltitude(mockWarsaw);

      expect(peakAlt).toBe(0.026);
      expect(cityAlt).toBe(0.01);
      expect(peakAlt).toBeGreaterThan(cityAlt);
    });

    it('returns point colors with selection and hover states', () => {
      const idle = getPointColor(mockTokyo, false, false, getLayer('megacities'));
      const hovered = getPointColor(mockTokyo, false, true, getLayer('megacities'));
      const selected = getPointColor(mockTokyo, true, false, getLayer('megacities'));

      expect(idle).toContain('hsl(45, 100%, 62%)');
      expect(hovered).toBe('hsl(180, 100%, 80%)');
      expect(selected).toBe('hsl(50, 100%, 70%)');
    });
  });

  describe('Label Formatting and Decluttering', () => {
    it('formats names with altitude suffix for mountains and peaks', () => {
      // English is the default locale; Polish names are used when asked for explicitly
      expect(formatLabelText(mockEverest)).toBe('Himalayas (8848 m)');
      expect(formatLabelText(mockEverest, 'pl')).toBe('Himalaje (8848 m)');
      expect(formatLabelText(mockPeak)).toBe('Mount Everest (8848 m)');
    });

    it('formats population in millions for megacities', () => {
      expect(formatLabelText(mockTokyo)).toBe('Tokyo (37.4M)');
      expect(formatLabelText(mockTokyo, 'pl')).toBe('Tokio (37.4M)');
      expect(formatLabelText(mockWarsaw, 'pl')).toBe('Warszawa');
    });

    it('returns typography scale and dot sizes based on feature kind', () => {
      expect(getLabelSize(mockCountry)).toBe(0.45);
      expect(getLabelSize(mockWarsaw)).toBe(0.38);
      expect(getLabelDotRadius(mockCountry)).toBe(0); // No dot for country polygons
      // Capitals draw their own marker (CapitalsLayer), so the label carries no dot
      expect(getLabelDotRadius(mockWarsaw)).toBe(0);
      expect(getLabelDotRadius(mockTokyo)).toBeGreaterThan(0); // megacities keep the dot
      expect(getLabelAltitude(mockPeak)).toBe(0.03);
    });

    it('prioritizes labels by category and rank order', () => {
      const candidates = [mockPeak, mockTokyo, mockCountry, mockWarsaw, mockEverest];
      const visible = selectVisibleLabels(candidates, { hiddenLabels: false, maxLabels: 3 });

      expect(visible.length).toBe(3);
      // Priority: country (1) -> capital (2) -> megacity (3)
      expect(visible[0]?.properties.kind).toBe('country');
      expect(visible[1]?.properties.kind).toBe('capital');
      expect(visible[2]?.properties.kind).toBe('megacity');
    });

    it('hides labels in quiz/study mode unless selected or hovered', () => {
      const candidates = [mockCountry, mockWarsaw, mockTokyo];

      // Idle study mode -> 0 labels shown
      const hiddenIdle = selectVisibleLabels(candidates, { hiddenLabels: true });
      expect(hiddenIdle).toHaveLength(0);

      // Selected item -> revealed
      const revealedSelected = selectVisibleLabels(candidates, {
        hiddenLabels: true,
        selectedId: 'c1',
      });
      expect(revealedSelected).toHaveLength(1);
      expect(revealedSelected[0]?.properties.id).toBe('c1');

      // Hovered item -> revealed
      const revealedHovered = selectVisibleLabels(candidates, {
        hiddenLabels: true,
        hoveredId: 'city-2',
      });
      expect(revealedHovered).toHaveLength(1);
      expect(revealedHovered[0]?.properties.id).toBe('city-2');
    });

    it('ensures selected item is included even if it falls beyond maxLabels slice', () => {
      const manyCountries: GeoFeature[] = Array.from({ length: 60 }, (_, idx) => ({
        type: 'Feature',
        properties: {
          id: `country-${idx}`,
          layerId: 'countriesTopN',
          kind: 'country',
          name_pl: `Kraj ${idx}`,
          name_en: `Country ${idx}`,
          rank: { order: idx + 1 },
        },
        geometry: { type: 'Polygon', coordinates: [] },
      }));

      const visible = selectVisibleLabels(manyCountries, {
        hiddenLabels: false,
        maxLabels: 10,
        selectedId: 'country-55',
      });

      expect(visible.some(f => f.properties.id === 'country-55')).toBe(true);
    });

    it('avoids colliding labels that are geographically adjacent', () => {
      // Two cities located very close to each other (e.g. 1 degree apart)
      const cityA: GeoFeature = {
        type: 'Feature',
        properties: {
          id: 'city-a',
          layerId: 'capitals',
          kind: 'capital',
          name_pl: 'Miasto A',
          name_en: 'City A',
          rank: { order: 1 },
        },
        geometry: { type: 'Point', coordinates: [21.0, 52.0] },
      };
      const cityB: GeoFeature = {
        type: 'Feature',
        properties: {
          id: 'city-b',
          layerId: 'capitals',
          kind: 'capital',
          name_pl: 'Miasto B',
          name_en: 'City B',
          rank: { order: 2 },
        },
        geometry: { type: 'Point', coordinates: [21.5, 52.3] }, // Only ~0.6 deg apart
      };

      const result = selectVisibleLabels([cityA, cityB], {
        hiddenLabels: false,
        maxLabels: 10,
      });

      // City A (higher rank) is accepted, City B is suppressed to avoid text overlap
      expect(result).toHaveLength(1);
      expect(result[0]?.properties.id).toBe('city-a');
    });
  });
});
