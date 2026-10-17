import { describe, it, expect } from 'vitest';
import { identifyOcean, detectLocationAtCoords } from '@/geo/antipodes-detector';
import type { GeoFeatureCollection } from '@/globe/data-loader';

describe('antipodes-detector', () => {
  describe('identifyOcean', () => {
    it('identifies Arctic Ocean near north pole', () => {
      const res = identifyOcean(75, 0);
      expect(res).toBe('arctic');
    });

    it('identifies Southern Ocean near Antarctica', () => {
      const res = identifyOcean(-65, 0);
      expect(res).toBe('southern');
    });

    it('identifies Atlantic Ocean between -70 and 20 longitude', () => {
      const res = identifyOcean(10, -30);
      expect(res).toBe('atlantic');
    });

    it('identifies Indian Ocean between 20 and 147 longitude', () => {
      const res = identifyOcean(-15, 75);
      expect(res).toBe('indian');
    });

    it('identifies Pacific Ocean in the remaining longitudes', () => {
      const res = identifyOcean(-25, -140);
      expect(res).toBe('pacific');
    });
  });

  describe('detectLocationAtCoords', () => {
    const mockCountries: GeoFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: 'PL',
            name_pl: 'Polska',
            name_en: 'Poland',
            layerId: 'borders',
            kind: 'country',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [14, 49],
                [14, 55],
                [24, 55],
                [24, 49],
                [14, 49],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: {
            id: 'NZ',
            name_pl: 'Nowa Zelandia',
            name_en: 'New Zealand',
            layerId: 'borders',
            kind: 'country',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [170, -45],
                [170, -35],
                [180, -35],
                [180, -45],
                [170, -45],
              ],
            ],
          },
        },
      ],
    };

    it('detects country when point is on land', () => {
      const res = detectLocationAtCoords(52.23, 21.01, mockCountries);
      expect(res.isLand).toBe(true);
      expect(res.countryName_pl).toBe('Polska');
      expect(res.countryName_en).toBe('Poland');
    });

    it('detects ocean when point is outside land polygons', () => {
      // Antipode of Warsaw: -52.23, -158.99 (Pacific Ocean)
      const res = detectLocationAtCoords(-52.23, -158.99, mockCountries);
      expect(res.isLand).toBe(false);
      expect(res.oceanId).toBe('pacific');
    });

    it('detects New Zealand land at Madrid antipode', () => {
      // Madrid antipode approx -40.41, 176.3
      const res = detectLocationAtCoords(-40.41, 176.3, mockCountries);
      expect(res.isLand).toBe(true);
      expect(res.countryName_pl).toBe('Nowa Zelandia');
      expect(res.countryName_en).toBe('New Zealand');
    });

    it('falls back to ocean classifier when no countries data provided', () => {
      const res = detectLocationAtCoords(0, 0);
      expect(res.isLand).toBe(false);
      expect(res.oceanId).toBe('atlantic');
    });
  });
});
