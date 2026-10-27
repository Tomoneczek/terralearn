import { geoContains, type GeoGeometryObjects } from 'd3-geo';

type Geometry = GeoGeometryObjects;

export interface RawPeak {
  geometry: { coordinates: [number, number] };
  properties: { elevation?: number | string | null };
}

/**
 * Highest summits (m) of well-known ranges that have no elevation point inside their outline
 * in Natural Earth. Keyed by the English range name.
 */
export const KNOWN_RANGE_ELEVATIONS: Readonly<Record<string, number>> = {
  'Taurus mountains': 3756,
  Pindus: 2637,
  'Altyn-Tagh': 6295,
  'Chugach Mountains': 4016,
  'Wasatch Range': 3638,
  'Sierra Morena': 1323,
  'Vosges Mountains': 1424,
  'Ore Mountains': 1244,
  Böhmerwald: 1456,
  'Saharan Atlas': 2236,
  'Asir Mountains': 3000,
  'Aravalli Range': 1722,
  'Satpura Range': 1350,
  'Vindhya Range': 752,
  'Cambrian Mountains': 905,
  'Hamersley Range': 1249,
  'Dzhugdzhur Mountains': 1906,
};

/**
 * Natural Earth marks the Caspian Sea as a "sea", but it is an endorheic lake
 * (the largest in the world). Such bodies are listed with lakes, not marine bodies.
 */
export const SEAS_LISTED_AS_LAKES: ReadonlySet<string> = new Set(['Caspian Sea']);

/** Natural Earth English names that are not the common name of the lake. */
const LAKE_NAME_EN_OVERRIDES: Readonly<Record<string, string>> = {
  'Lake Victoria': 'Victoria',
};

export function lakeEnglishName(raw: { name?: string | null; name_en?: string | null }): string {
  const name = raw.name ?? '';
  return LAKE_NAME_EN_OVERRIDES[name] ?? raw.name_en ?? name;
}

/**
 * Highest elevation point lying inside a range outline. Spatial containment is used instead of
 * name matching, because the range and peak datasets spell region names differently
 * (e.g. the Himalayas matched no peak and fell back to the default elevation).
 * Returns `undefined` when the elevation is unknown, so no made-up height is shown.
 */
export function maxElevationInRange(
  rangeGeometry: Geometry,
  peaks: readonly RawPeak[],
  rangeName?: string,
): number | undefined {
  let best = 0;
  for (const peak of peaks) {
    const elevation = Number(peak.properties.elevation) || 0;
    if (elevation <= best) continue;
    if (geoContains(rangeGeometry, peak.geometry.coordinates)) best = elevation;
  }
  return best || (rangeName ? KNOWN_RANGE_ELEVATIONS[rangeName] : undefined);
}

/** Ranges with a known elevation first (highest first), the rest by area. */
export function compareRanges(
  a: { elevation?: number; area?: number },
  b: { elevation?: number; area?: number },
): number {
  const ea = a.elevation ?? -1;
  const eb = b.elevation ?? -1;
  if (ea !== eb) return eb - ea;
  return (b.area ?? 0) - (a.area ?? 0);
}

/** Natural Earth classes many natural lakes (Issyk-Kul, Turkana, Dead Sea) as "Reservoir". */
const RESERVOIR_NAME = /reservoir|r[ée]servoir|represa|\br[ée]s\.|bögeni/i;

/** Well-known artificial lakes whose names do not say "reservoir". */
const KNOWN_RESERVOIRS: ReadonlySet<string> = new Set([
  'Lake Volta',
  'Lake Kariba',
  'Lake Nasser',
  'Lake Mead',
  'Lake Powell',
  'Lake Oahe',
  'Lake Sakakawea',
  'Fort Peck Lake',
  'Ft. Peck Lake',
  'Lake Francis Case',
  'Williston Lake',
  'Kinbasket Lake',
  'Lower Arrow Lake',
  'Lake Argyle',
  'Kentucky Lake',
  'Wheeler Lake',
  'Shasta Lake',
  'Millerton Lake',
  'Falcon Lake',
  'J. Strom Thurmond Lake',
  'Van Blommestein Meer',
]);

/** True for artificial reservoirs, which are not listed among the largest lakes. */
export function isReservoir(raw: { name?: string | null; featurecla?: string | null }): boolean {
  if (raw.featurecla !== 'Reservoir') return false;
  const name = raw.name ?? '';
  return RESERVOIR_NAME.test(name) || KNOWN_RESERVOIRS.has(name);
}
