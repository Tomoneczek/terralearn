import { describe, it, expect } from 'vitest';
import { mergeNearbyNamesakes } from '../../scripts/data/dedupe';
import type { GeoFeature } from '../../scripts/data/schema';

function lake(id: string, nameEn: string, lng: number, lat: number, area: number): GeoFeature {
  return {
    type: 'Feature',
    id,
    properties: {
      id,
      kind: 'lake',
      layerId: 'physical-lakes',
      name_pl: nameEn,
      name_en: nameEn,
      aliases: [],
      rank: { area },
      labelLng: lng,
      labelLat: lat,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng, lat],
          [lng + 0.1, lat],
          [lng, lat + 0.1],
          [lng, lat],
        ],
      ],
    },
  };
}

describe('mergeNearbyNamesakes', () => {
  it('merges split pieces of one lake into a MultiPolygon (Tikchik regression)', () => {
    const merged = mergeNearbyNamesakes(
      [
        lake('lake-tikchik', 'Tikchik', -159, 60, 100),
        lake('lake-tikchik-2', 'Tikchik', -159.2, 60.1, 300),
        lake('lake-tikchik-3', 'Tikchik', -158.9, 59.8, 50),
      ],
      2,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.properties.id).toBe('lake-tikchik-2');
    expect(merged[0]!.properties.rank.area).toBe(450);
    expect(merged[0]!.geometry.type).toBe('MultiPolygon');
    expect(merged[0]!.geometry.coordinates).toHaveLength(3);
  });

  it('keeps distant namesakes separate (Sierra Nevada in the USA and Spain)', () => {
    const merged = mergeNearbyNamesakes(
      [lake('a', 'Sierra Nevada', -120, 38, 10), lake('b', 'Sierra Nevada', -3, 37, 5)],
      12,
    );
    expect(merged).toHaveLength(2);
  });

  it('does not merge different names that lie close together', () => {
    const merged = mergeNearbyNamesakes(
      [lake('a', 'Huron', -82, 44, 10), lake('b', 'Michigan', -87, 44, 5)],
      12,
    );
    expect(merged).toHaveLength(2);
  });
});
