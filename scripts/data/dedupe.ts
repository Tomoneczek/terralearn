import type { GeoFeature } from './schema.js';

type Ring = number[][];
type PolygonCoords = Ring[];

function toPolygons(geometry: GeoFeature['geometry']): PolygonCoords[] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as PolygonCoords];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as PolygonCoords[];
  return [];
}

/** Great-circle distance in degrees between two [lng, lat] points. */
function angularDistanceDeg(a: [number, number], b: [number, number]): number {
  const toRad = Math.PI / 180;
  const [lng1, lat1] = [a[0] * toRad, a[1] * toRad];
  const [lng2, lat2] = [b[0] * toRad, b[1] * toRad];
  const cos =
    Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / toRad;
}

function labelPoint(f: GeoFeature): [number, number] {
  return [Number(f.properties.labelLng) || 0, Number(f.properties.labelLat) || 0];
}

/**
 * Natural Earth sometimes splits one lake or region into several polygons with the same name
 * (e.g. four "Tikchik" lakes, two "Brazilian Highlands"). Features with the same English name
 * whose label points lie within `maxDistanceDeg` are merged into one MultiPolygon: properties
 * and id come from the largest piece, areas are summed. Distant namesakes (Sierra Nevada in
 * the USA and in Spain) stay separate.
 */
export function mergeNearbyNamesakes(
  features: readonly GeoFeature[],
  maxDistanceDeg: number,
): GeoFeature[] {
  const byArea = [...features].sort(
    (a, b) => (b.properties.rank.area ?? 0) - (a.properties.rank.area ?? 0),
  );
  const merged: GeoFeature[] = [];
  const consumed = new Set<GeoFeature>();

  for (const main of byArea) {
    if (consumed.has(main)) continue;
    const pieces = byArea.filter(
      other =>
        other !== main &&
        !consumed.has(other) &&
        other.properties.name_en === main.properties.name_en &&
        angularDistanceDeg(labelPoint(main), labelPoint(other)) <= maxDistanceDeg,
    );
    if (pieces.length === 0) {
      merged.push(main);
      continue;
    }

    for (const piece of pieces) consumed.add(piece);
    const all = [main, ...pieces];
    const area = all.reduce((sum, f) => sum + (f.properties.rank.area ?? 0), 0);
    merged.push({
      ...main,
      properties: { ...main.properties, rank: { ...main.properties.rank, area } },
      geometry: {
        type: 'MultiPolygon',
        coordinates: all.flatMap(f => toPolygons(f.geometry)),
      },
    });
  }

  return merged;
}
