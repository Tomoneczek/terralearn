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

    // Mountains used to be extruded by elevation into orange blocks (and hid the rivers inside
    // them from the pointer). They are now a flat outline layer.
    it('keeps mountain ranges flat, between the country caps and the paths', () => {
      const everestAlt = getPolygonAltitude(mockEverest, false, false, getLayer('mountains'));
      const alpsAlt = getPolygonAltitude(mockAlps, false, false, getLayer('mountains'));
      const countryAlt = getPolygonAltitude(mockCountry, false, false, getLayer('countriesTopN'));

      expect(everestAlt).toBe(alpsAlt);
      expect(everestAlt).toBeGreaterThan(countryAlt);
      expect(everestAlt).toBeLessThan(getPathAltitude());
    });

    it('draws mountains as a delicate outline: faint fill, no sides, muted stroke', () => {
      const def = getLayer('mountains');
      expect(getPolygonSideColor(mockEverest, false, false, def)).toBe('transparent');
      const alpha = (color: string): number => Number(/,\s*([\d.]+)\)$/.exec(color)?.[1] ?? 1);
      expect(alpha(getPolygonCapColor(mockEverest, false, false, def))).toBeLessThanOrEqual(0.15);
      expect(alpha(getPolygonStrokeColor(mockEverest, false, false, def))).toBeLessThan(1);
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
});
