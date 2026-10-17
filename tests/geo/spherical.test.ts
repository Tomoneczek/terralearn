import { describe, it, expect } from 'vitest';
import { geoArea, geoCentroid } from 'd3-geo';
import {
  haversineDistanceKm,
  getDistanceColor,
  latLngToVector3,
  vector3ToLatLng,
  greatCircle,
  rhumbLine,
  antipode,
  movePolygonTo,
  toRad,
  toDeg,
} from '@/geo/spherical';

describe('Spherical Geometry module', () => {
  describe('toRad & toDeg conversions', () => {
    it('converts degrees to radians and vice versa', () => {
      expect(toRad(180)).toBeCloseTo(Math.PI);
      expect(toRad(90)).toBeCloseTo(Math.PI / 2);
      expect(toDeg(Math.PI)).toBeCloseTo(180);
      expect(toDeg(Math.PI / 2)).toBeCloseTo(90);
    });
  });

  describe('latLngToVector3 & vector3ToLatLng', () => {
    it('roundtrips arbitrary coordinates accurately', () => {
      const coords = [
        { lat: 52.23, lng: 21.01 }, // Warsaw
        { lat: 0, lng: 0 }, // Null Island
        { lat: 90, lng: 0 }, // North Pole
        { lat: -90, lng: 0 }, // South Pole
        { lat: -33.86, lng: 151.2 }, // Sydney
        { lat: 35.68, lng: 139.76 }, // Tokyo
      ];

      for (const pt of coords) {
        const v = latLngToVector3(pt.lat, pt.lng);
        const res = vector3ToLatLng(v[0], v[1], v[2]);
        expect(res.lat).toBeCloseTo(pt.lat, 4);
        if (Math.abs(pt.lat) < 89.9) {
          expect(res.lng).toBeCloseTo(pt.lng, 4);
        }
      }
    });

    it('handles zero vector safely', () => {
      const res = vector3ToLatLng(0, 0, 0);
      expect(res).toEqual({ lat: 0, lng: 0 });
    });
  });

  describe('haversineDistanceKm & getDistanceColor', () => {
    it('calculates accurate distance between Warsaw and Krakow (~252 km)', () => {
      const dist = haversineDistanceKm(52.23, 21.01, 50.06, 19.94);
      expect(dist).toBeGreaterThanOrEqual(250);
      expect(dist).toBeLessThanOrEqual(255);
    });

    it('calculates accurate trans-atlantic distance between Paris and New York (~5837 km)', () => {
      const dist = haversineDistanceKm(48.8566, 2.3522, 40.7128, -74.006);
      expect(dist).toBeGreaterThanOrEqual(5820);
      expect(dist).toBeLessThanOrEqual(5860);
    });

    it('returns 0 km distance for identical coordinates', () => {
      const dist = haversineDistanceKm(52.0, 19.0, 52.0, 19.0);
      expect(dist).toBe(0);
    });

    it('returns appropriate color thresholds for distance errors', () => {
      expect(getDistanceColor(35)).toContain('0, 255, 170');
      expect(getDistanceColor(250)).toContain('255, 200, 50');
      expect(getDistanceColor(1200)).toContain('255, 80, 80');
    });
  });

  describe('greatCircle (orthodrome)', () => {
    it('samples orthodrome path with requested number of steps', () => {
      const start = { lat: 52.23, lng: 21.01 }; // Warsaw
      const end = { lat: 35.68, lng: 139.76 }; // Tokyo

      const path = greatCircle(start, end, 20);
      expect(path.length).toBe(20);

      expect(path[0]!.lat).toBeCloseTo(start.lat, 2);
      expect(path[0]!.lng).toBeCloseTo(start.lng, 2);
      expect(path[path.length - 1]!.lat).toBeCloseTo(end.lat, 2);
      expect(path[path.length - 1]!.lng).toBeCloseTo(end.lng, 2);
    });

    it('shows characteristic northward curvature over high latitudes', () => {
      // Warsaw (52.2° N) to Tokyo (35.7° N)
      // The orthodrome reaches ~65-70° N over Siberia, significantly higher than both endpoints!
      const start = { lat: 52.23, lng: 21.01 };
      const end = { lat: 35.68, lng: 139.76 };

      const path = greatCircle(start, end, 30);
      const maxLat = Math.max(...path.map(p => p.lat));
      expect(maxLat).toBeGreaterThan(63);
    });

    it('handles identical start and end points', () => {
      const pt = { lat: 10, lng: 20 };
      const path = greatCircle(pt, pt, 5);
      expect(path.length).toBe(5);
      expect(path[0]!.lat).toBe(10);
      expect(path[0]!.lng).toBe(20);
    });

    it('handles exact antipodal points without NaN or breakdown', () => {
      const start = { lat: 40, lng: 50 };
      const end = { lat: -40, lng: -130 }; // exact antipode

      const path = greatCircle(start, end, 10);
      expect(path.length).toBe(10);
      for (const pt of path) {
        expect(Number.isFinite(pt.lat)).toBe(true);
        expect(Number.isFinite(pt.lng)).toBe(true);
      }
    });
  });

  describe('rhumbLine (loxodrome)', () => {
    it('maintains constant latitude when traveling along a parallel', () => {
      const start = { lat: 45, lng: 10 };
      const end = { lat: 45, lng: 80 };

      const path = rhumbLine(start, end, 15);
      expect(path.length).toBe(15);

      for (const pt of path) {
        expect(pt.lat).toBeCloseTo(45, 5);
      }
      expect(path[path.length - 1]!.lng).toBeCloseTo(80, 5);
    });

    it('maintains constant longitude when traveling along a meridian', () => {
      const start = { lat: -20, lng: 30 };
      const end = { lat: 60, lng: 30 };

      const path = rhumbLine(start, end, 10);
      expect(path.length).toBe(10);

      for (const pt of path) {
        expect(pt.lng).toBeCloseTo(30, 5);
      }
      expect(path[0]!.lat).toBeCloseTo(-20, 5);
      expect(path[path.length - 1]!.lat).toBeCloseTo(60, 5);
    });

    it('chooses shortest path across the 180th meridian', () => {
      // 170°E to 170°W (-170°): shortest distance is 20° eastwards, not 340° westwards
      const start = { lat: 10, lng: 170 };
      const end = { lat: 10, lng: -170 };

      const path = rhumbLine(start, end, 5);
      expect(path.length).toBe(5);
      // Midpoint should cross 180 / -180
      const mid = path[2]!;
      expect(Math.abs(mid.lng)).toBeCloseTo(180, 1);
    });
  });

  describe('antipode', () => {
    it('computes opposite point on the globe', () => {
      // Warsaw (52.23°N, 21.01°E) -> 52.23°S, 158.99°W
      const antiWarsaw = antipode({ lat: 52.23, lng: 21.01 });
      expect(antiWarsaw.lat).toBeCloseTo(-52.23, 2);
      expect(antiWarsaw.lng).toBeCloseTo(-158.99, 2);

      // Equator point (0, 100) -> (0, -80)
      const antiEquator = antipode({ lat: 0, lng: 100 });
      expect(antiEquator.lat).toBe(0);
      expect(antiEquator.lng).toBe(-80);

      // Prime meridian (15, 0) -> (-15, 180)
      const antiPrime = antipode({ lat: 15, lng: 0 });
      expect(antiPrime.lat).toBe(-15);
      expect(antiPrime.lng).toBe(180);

      // Date line (0, 180) -> (0, 0)
      const antiDateLine = antipode({ lat: 0, lng: 180 });
      expect(antiDateLine.lat).toBe(0);
      expect(antiDateLine.lng).toBe(0);

      // Poles
      expect(antipode({ lat: 90, lng: 45 })).toEqual({ lat: -90, lng: 0 });
      expect(antipode({ lat: -90, lng: -70 })).toEqual({ lat: 90, lng: 0 });
    });
  });

  describe('movePolygonTo', () => {
    // Greenland-like sample polygon in high northern latitudes
    const samplePolygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-45, 60],
          [-30, 60],
          [-30, 75],
          [-45, 75],
          [-45, 60],
        ],
      ],
    };

    it('moves polygon to equator while preserving spherical surface area', () => {
      const areaBefore = geoArea(samplePolygon);

      // Move to equator (lat: 0, lng: 20)
      const moved = movePolygonTo(samplePolygon, 0, 20);
      const areaAfter = geoArea(moved);

      // Area on unit sphere must be preserved within floating point precision
      expect(areaAfter).toBeCloseTo(areaBefore, 5);

      // Centroid must now be at the target location (within 0.1°)
      const centroid = geoCentroid(moved);
      expect(centroid[0]).toBeCloseTo(20, 1);
      expect(centroid[1]).toBeCloseTo(0, 1);
    });

    it('returns identical copy when target centroid matches original centroid', () => {
      const [cLng, cLat] = geoCentroid(samplePolygon);
      const moved = movePolygonTo(samplePolygon, cLat, cLng);

      expect(moved.coordinates[0]?.length).toBe(samplePolygon.coordinates[0]?.length);
      for (let i = 0; i < samplePolygon.coordinates[0]!.length; i++) {
        expect(moved.coordinates[0]![i]![0]).toBeCloseTo(samplePolygon.coordinates[0]![i]![0]!, 4);
        expect(moved.coordinates[0]![i]![1]).toBeCloseTo(samplePolygon.coordinates[0]![i]![1]!, 4);
      }
    });

    it('moves to exact antipode without distortion', () => {
      const [cLng, cLat] = geoCentroid(samplePolygon);
      const anti = antipode({ lat: cLat, lng: cLng });

      const moved = movePolygonTo(samplePolygon, anti.lat, anti.lng);
      const areaBefore = geoArea(samplePolygon);
      const areaAfter = geoArea(moved);

      expect(areaAfter).toBeCloseTo(areaBefore, 5);

      const centroid = geoCentroid(moved);
      expect(centroid[0]).toBeCloseTo(anti.lng, 1);
      expect(centroid[1]).toBeCloseTo(anti.lat, 1);
    });

    it('supports MultiPolygon geometries and preserves altitudes if present', () => {
      const multi: GeoJSON.MultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [10, 10, 100],
              [20, 10, 100],
              [20, 20, 100],
              [10, 20, 100],
              [10, 10, 100],
            ],
          ],
        ],
      };

      const moved = movePolygonTo(multi, -30, -50);
      expect(moved.type).toBe('MultiPolygon');
      expect(moved.coordinates[0]![0]![0]![2]).toBe(100);

      const areaBefore = geoArea(multi);
      const areaAfter = geoArea(moved);
      expect(areaAfter).toBeCloseTo(areaBefore, 5);
    });
  });
});
