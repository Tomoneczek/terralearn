import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoContains, type GeoGeometryObjects } from 'd3-geo';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../public/data');

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'l')
    .trim();
}

interface RawGeoFeature {
  type: string;
  id: string;
  properties: {
    id: string;
    kind: string;
    layerId: string;
    name_pl: string;
    name_en: string;
    aliases?: string[];
    countryCode?: string;
    countryName?: string;
    landformType?: string;
    marineType?: string;
    rank?: {
      area?: number;
      population?: number;
      elevation?: number;
      length?: number;
      order?: number;
    };
    labelLat?: number;
    labelLng?: number;
    description?: string;
  };
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

interface RawFeatureCollection {
  type: string;
  features: RawGeoFeature[];
}

export interface SearchIndexItem {
  id: string;
  name_pl: string;
  name_en: string;
  normalized_name: string;
  kind: string;
  layerId: string;
  lat: number;
  lng: number;
  rank?: number;
}

export interface FactStat {
  label: string;
  value: string;
}

export interface GeographicRelationItem {
  id: string;
  name_pl: string;
  name_en: string;
  kind: string;
  layerId: string;
  lat: number;
  lng: number;
}

export interface GeographicRelations {
  countries?: GeographicRelationItem[];
  capital?: GeographicRelationItem;
  mountainRange?: GeographicRelationItem;
  neighbors?: GeographicRelationItem[];
}

export interface ObjectFacts {
  id: string;
  name_pl: string;
  name_en: string;
  kind: string;
  kind_pl: string;
  stats: FactStat[];
  trivia?: string;
  comparison?: string;
  relations?: GeographicRelations;
}

function getFeatureCoords(f: RawGeoFeature): { lat: number; lng: number } {
  if (typeof f.properties.labelLat === 'number' && typeof f.properties.labelLng === 'number') {
    return { lat: f.properties.labelLat, lng: f.properties.labelLng };
  }

  if (f.geometry.type === 'Point') {
    const coords = f.geometry.coordinates as [number, number];
    return { lat: coords[1], lng: coords[0] };
  }

  if (f.geometry.type === 'LineString') {
    const coords = f.geometry.coordinates as [number, number][];
    const mid = coords[Math.floor(coords.length / 2)] ?? [0, 0];
    return { lat: mid[1], lng: mid[0] };
  }

  if (f.geometry.type === 'MultiLineString') {
    const firstLine = (f.geometry.coordinates as [number, number][][])[0] ?? [];
    const mid = firstLine[Math.floor(firstLine.length / 2)] ?? [0, 0];
    return { lat: mid[1], lng: mid[0] };
  }

  if (f.geometry.type === 'Polygon') {
    const ring = (f.geometry.coordinates as [number, number][][])[0] ?? [];
    const mid = ring[0] ?? [0, 0];
    return { lat: mid[1], lng: mid[0] };
  }

  if (f.geometry.type === 'MultiPolygon') {
    const firstPoly = (f.geometry.coordinates as [number, number][][][])[0] ?? [];
    const ring = firstPoly[0] ?? [];
    const mid = ring[0] ?? [0, 0];
    return { lat: mid[1], lng: mid[0] };
  }

  return { lat: 0, lng: 0 };
}

function getKindPl(kind: string, subType?: string): string {
  switch (kind) {
    case 'country':
      return 'Państwo';
    case 'lake':
      return 'Jezioro';
    case 'river':
      return 'Rzeka';
    case 'mountain_range':
    case 'mountain':
      return 'Pasmo górskie';
    case 'desert':
      return 'Pustynia';
    case 'capital':
      return 'Stolica państwa';
    case 'megacity':
      return 'Metropolia';
    case 'peak':
      return 'Szczyt górski';
    case 'landform':
      switch (subType) {
        case 'plateau':
          return 'Wyżyna / Płaskowyż';
        case 'plain':
          return 'Nizina / Równina';
        case 'basin':
          return 'Kotlina / Basen';
        case 'delta':
          return 'Delta rzeczna';
        case 'peninsula':
          return 'Półwysep';
        default:
          return 'Forma terenu';
      }
    case 'marine':
      switch (subType) {
        case 'sea':
          return 'Morze';
        case 'gulf':
        case 'bay':
          return 'Zatoka';
        case 'strait':
          return 'Cieśnina';
        case 'channel':
          return 'Kanał morski';
        case 'sound':
        case 'fjord':
          return 'Fiord / Cieśnina';
        case 'ocean':
          return 'Ocean';
        default:
          return 'Akwen morski';
      }
    default:
      return 'Obiekt geograficzny';
  }
}

/** Poland's total area, used as the reference for "x times Poland" comparisons. */
const POLAND_AREA_KM2 = 312_696;
const POLAND_ID = 'PL';

/** Formats a number with a Polish decimal comma, e.g. 98.9 -> "98,9". */
export function formatDecimalPl(value: number, digits = 1): string {
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function generateFacts(f: RawGeoFeature): ObjectFacts {
  const p = f.properties;
  const stats: FactStat[] = [];
  let comparison: string | undefined;

  const area = p.rank?.area;
  const pop = p.rank?.population;
  const elev = p.rank?.elevation;
  const len = p.rank?.length;

  if (p.kind === 'country') {
    if (area) {
      stats.push({ label: 'Powierzchnia', value: `${area.toLocaleString('pl-PL')} km²` });
      const ratio = area / POLAND_AREA_KM2;
      // Comparing Poland with itself is meaningless (and the dataset area differs slightly).
      if (p.id === POLAND_ID) {
        comparison = undefined;
      } else if (ratio >= 1) {
        comparison = `Powierzchnia równa ok. ${formatDecimalPl(ratio)}x terytorium Polski`;
      } else {
        comparison = `Powierzchnia stanowi ok. ${formatDecimalPl(ratio * 100)}% powierzchni Polski`;
      }
    }
    if (pop) {
      stats.push({ label: 'Ludność', value: `${pop.toLocaleString('pl-PL')} os.` });
    }
    if (p.rank?.order) {
      stats.push({ label: 'Miejsce wg powierzchni', value: `#${p.rank.order} na świecie` });
    }
  } else if (p.kind === 'lake') {
    if (area) {
      stats.push({ label: 'Powierzchnia', value: `${area.toLocaleString('pl-PL')} km²` });
      const sniardwyRatio = Math.round(area / 113.8);
      comparison = `Powierzchnia równa ok. ${sniardwyRatio.toLocaleString('pl-PL')}x Jezioro Śniardwy`;
    }
    if (p.rank?.order) {
      stats.push({ label: 'Ranking jezior', value: `#${p.rank.order} na świecie` });
    }
  } else if (p.kind === 'river') {
    if (len) {
      stats.push({ label: 'Długość', value: `${Math.round(len).toLocaleString('pl-PL')} km` });
      const wislaRatio = len / 1047;
      comparison = `Długość równa ok. ${formatDecimalPl(wislaRatio)}x długości Wisły`;
    }
    if (p.rank?.order) {
      stats.push({ label: 'Ranking rzek', value: `#${p.rank.order} na świecie` });
    }
  } else if (p.kind === 'mountain_range' || p.kind === 'mountain') {
    if (elev) {
      stats.push({ label: 'Maks. wysokość', value: `${elev.toLocaleString('pl-PL')} m n.p.m.` });
      const rysyRatio = elev / 2499;
      comparison = `Wysokość najwyższego szczytu: ok. ${formatDecimalPl(rysyRatio)}x Rysy`;
    }
    if (area) {
      stats.push({ label: 'Obszar', value: `${area.toLocaleString('pl-PL')} km²` });
    }
  } else if (p.kind === 'desert') {
    if (area) {
      stats.push({ label: 'Powierzchnia', value: `${area.toLocaleString('pl-PL')} km²` });
      const ratio = area / POLAND_AREA_KM2;
      comparison = `Obszar równy ok. ${formatDecimalPl(ratio)}x terytorium Polski`;
    }
  } else if (p.kind === 'landform') {
    if (area) {
      stats.push({ label: 'Powierzchnia', value: `${area.toLocaleString('pl-PL')} km²` });
      const ratio = area / POLAND_AREA_KM2;
      if (ratio >= 1) {
        comparison = `Obszar równy ok. ${formatDecimalPl(ratio)}x terytorium Polski`;
      } else {
        comparison = `Obszar stanowi ok. ${formatDecimalPl(ratio * 100)}% powierzchni Polski`;
      }
    }
    if (p.rank?.order) {
      stats.push({ label: 'Ranking form terenu', value: `#${p.rank.order} na świecie` });
    }
  } else if (p.kind === 'marine') {
    if (area) {
      stats.push({ label: 'Powierzchnia', value: `${area.toLocaleString('pl-PL')} km²` });
      const balticRatio = area / 377000;
      if (balticRatio >= 1) {
        comparison = `Powierzchnia równa ok. ${formatDecimalPl(balticRatio)}x Morze Bałtyckie`;
      } else {
        comparison = `Powierzchnia stanowi ok. ${formatDecimalPl(balticRatio * 100)}% Morza Bałtyckiego`;
      }
    }
    if (p.rank?.order) {
      stats.push({ label: 'Ranking akwenów morskich', value: `#${p.rank.order} na świecie` });
    }
  } else if (p.kind === 'capital' || p.kind === 'megacity') {
    if (pop) {
      stats.push({ label: 'Ludność', value: `${pop.toLocaleString('pl-PL')} mieszkańców` });
      const warsawRatio = pop / 1790000;
      comparison = `Populacja równa ok. ${formatDecimalPl(warsawRatio)}x Warszawa`;
    }
    if (p.countryName) {
      stats.push({ label: 'Kraj', value: p.countryName });
    }
  } else if (p.kind === 'peak') {
    if (elev) {
      stats.push({ label: 'Wysokość', value: `${elev.toLocaleString('pl-PL')} m n.p.m.` });
      const rysyRatio = elev / 2499;
      comparison = `Wysokość równa ok. ${formatDecimalPl(rysyRatio)}x Rysy`;
    }
  }

  return {
    id: p.id,
    name_pl: p.name_pl,
    name_en: p.name_en,
    kind: p.kind,
    kind_pl: getKindPl(p.kind, p.landformType || p.marineType),
    stats,
    comparison,
  };
}

interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

function computeBBox(coordinates: unknown): BBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  function walk(coords: unknown) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      const lng = coords[0] as number;
      const lat = (coords[1] as number) ?? 0;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const item of coords) walk(item);
    }
  }

  walk(coordinates);
  return { minLng, minLat, maxLng, maxLat };
}

function pointInBBox(pt: [number, number], bbox: BBox): boolean {
  return (
    pt[0] >= bbox.minLng - 0.01 &&
    pt[0] <= bbox.maxLng + 0.01 &&
    pt[1] >= bbox.minLat - 0.01 &&
    pt[1] <= bbox.maxLat + 0.01
  );
}

function extractPoints(coordinates: unknown): [number, number][] {
  const result: [number, number][] = [];
  function walk(coords: unknown) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      result.push([coords[0] as number, (coords[1] as number) ?? 0]);
    } else {
      for (const item of coords) walk(item);
    }
  }
  walk(coordinates);
  return result;
}

function toRelationItem(f: RawGeoFeature, layerId: string): GeographicRelationItem {
  const coords = getFeatureCoords(f);
  return {
    id: f.properties.id,
    name_pl: f.properties.name_pl,
    name_en: f.properties.name_en,
    kind: f.properties.kind,
    layerId,
    lat: Number(coords.lat.toFixed(3)),
    lng: Number(coords.lng.toFixed(3)),
  };
}

export function buildSearchIndexAndFacts(): {
  searchIndex: SearchIndexItem[];
  facts: Record<string, ObjectFacts>;
} {
  const files: { filename: string; layerId: string }[] = [
    { filename: 'countries.json', layerId: 'countriesTopN' },
    { filename: 'lakes.json', layerId: 'lakes' },
    { filename: 'rivers.json', layerId: 'rivers' },
    { filename: 'regions.json', layerId: 'mountains' },
    { filename: 'landforms.json', layerId: 'landforms' },
    { filename: 'marine.json', layerId: 'marine' },
    { filename: 'places.json', layerId: 'capitals' },
  ];

  const searchIndex: SearchIndexItem[] = [];
  const facts: Record<string, ObjectFacts> = {};
  const seenIds = new Set<string>();
  const featuresByLayer: Record<string, RawGeoFeature[]> = {};

  for (const { filename, layerId } of files) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as RawFeatureCollection;
    featuresByLayer[filename] = data.features;

    for (const feat of data.features) {
      const p = feat.properties;
      if (!p.id || seenIds.has(p.id)) continue;
      seenIds.add(p.id);

      const coords = getFeatureCoords(feat);
      let targetLayerId = layerId;
      if (p.kind === 'desert') targetLayerId = 'deserts';
      if (p.kind === 'megacity') targetLayerId = 'megacities';
      if (p.kind === 'peak') targetLayerId = 'peaks';
      if (p.kind === 'capital') targetLayerId = 'capitals';
      if (p.kind === 'landform') targetLayerId = 'landforms';
      if (p.kind === 'marine') targetLayerId = 'marine';

      searchIndex.push({
        id: p.id,
        name_pl: p.name_pl,
        name_en: p.name_en,
        normalized_name: normalizeText(`${p.name_pl} ${p.name_en} ${p.aliases?.join(' ') ?? ''}`),
        kind: p.kind,
        layerId: targetLayerId,
        lat: Number(coords.lat.toFixed(3)),
        lng: Number(coords.lng.toFixed(3)),
        rank: p.rank?.order ?? 999,
      });

      facts[p.id] = generateFacts(feat);
    }
  }

  // --- Calculate Spatial Geographic Relations ---
  const countryFeatures = (featuresByLayer['countries.json'] ?? []).map(f => ({
    feature: f,
    bbox: computeBBox(f.geometry.coordinates),
    geom: f.geometry as GeoGeometryObjects,
  }));

  const countryByCode = new Map<string, RawGeoFeature>();
  for (const { feature } of countryFeatures) {
    if (feature.properties.countryCode) {
      countryByCode.set(feature.properties.countryCode, feature);
    }
    if (feature.properties.id) {
      countryByCode.set(feature.properties.id, feature);
    }
  }

  // 1. Country Neighbors via shared border vertices
  const vertexMap = new Map<string, Set<string>>();
  for (const { feature } of countryFeatures) {
    const pts = extractPoints(feature.geometry.coordinates);
    for (const pt of pts) {
      const key = `${pt[0].toFixed(3)}:${pt[1].toFixed(3)}`;
      let set = vertexMap.get(key);
      if (!set) {
        set = new Set();
        vertexMap.set(key, set);
      }
      set.add(feature.properties.id);
    }
  }

  for (const { feature } of countryFeatures) {
    const cid = feature.properties.id;
    const pts = extractPoints(feature.geometry.coordinates);
    const neighborHits = new Map<string, number>();

    for (const pt of pts) {
      const key = `${pt[0].toFixed(3)}:${pt[1].toFixed(3)}`;
      for (const otherId of vertexMap.get(key) || []) {
        if (otherId !== cid) {
          neighborHits.set(otherId, (neighborHits.get(otherId) ?? 0) + 1);
        }
      }
    }

    const neighbors: GeographicRelationItem[] = [];
    for (const [nid, count] of neighborHits.entries()) {
      if (count >= 2) {
        const otherFeat = countryByCode.get(nid);
        if (otherFeat) {
          neighbors.push(toRelationItem(otherFeat, 'countriesTopN'));
        }
      }
    }

    neighbors.sort((a, b) => a.name_pl.localeCompare(b.name_pl, 'pl'));
    if (neighbors.length > 0 && facts[cid]) {
      facts[cid].relations = {
        ...(facts[cid].relations ?? {}),
        neighbors,
      };
    }
  }

  // 2. Places: Capitals, Megacities and Peaks
  const placesFeatures = featuresByLayer['places.json'] ?? [];
  const mountainFeatures = (featuresByLayer['regions.json'] ?? [])
    .filter(f => f.properties.kind === 'mountain')
    .map(f => ({
      feature: f,
      bbox: computeBBox(f.geometry.coordinates),
      geom: f.geometry as GeoGeometryObjects,
    }));

  for (const place of placesFeatures) {
    const p = place.properties;
    const coords = getFeatureCoords(place);
    const pt: [number, number] = [coords.lng, coords.lat];
    const fact = facts[p.id];
    if (!fact) continue;

    if (p.kind === 'capital' || p.kind === 'megacity') {
      let country = p.countryCode ? countryByCode.get(p.countryCode) : undefined;
      if (!country) {
        const found = countryFeatures.find(c => pointInBBox(pt, c.bbox) && geoContains(c.geom, pt));
        country = found?.feature;
      }
      if (country) {
        fact.relations = {
          ...(fact.relations ?? {}),
          countries: [toRelationItem(country, 'countriesTopN')],
        };
        // If it's a capital, link it back to the country
        const countryFact = facts[country.properties.id];
        if (p.kind === 'capital' && countryFact) {
          countryFact.relations = {
            ...(countryFact.relations ?? {}),
            capital: toRelationItem(place, 'capitals'),
          };
        }
      }
    } else if (p.kind === 'peak') {
      // Find country for peak
      const foundCountry = countryFeatures.find(
        c => pointInBBox(pt, c.bbox) && geoContains(c.geom, pt),
      );
      if (foundCountry) {
        fact.relations = {
          ...(fact.relations ?? {}),
          countries: [toRelationItem(foundCountry.feature, 'countriesTopN')],
        };
      }
      // Find mountain range for peak
      const foundMountain = mountainFeatures.find(
        m => pointInBBox(pt, m.bbox) && geoContains(m.geom, pt),
      );
      if (foundMountain) {
        fact.relations = {
          ...(fact.relations ?? {}),
          mountainRange: toRelationItem(foundMountain.feature, 'mountains'),
        };
      }
    }
  }

  // 3. Rivers: Countries through which the river flows
  const riverFeatures = featuresByLayer['rivers.json'] ?? [];
  for (const river of riverFeatures) {
    const fact = facts[river.properties.id];
    if (!fact) continue;

    const pts = extractPoints(river.geometry.coordinates);
    if (pts.length === 0) continue;

    const step = Math.max(1, Math.floor(pts.length / 50));
    const flowCountries: GeographicRelationItem[] = [];
    const seenCountryIds = new Set<string>();

    for (let i = 0; i < pts.length; i += step) {
      const pt = pts[i];
      if (!pt) continue;
      for (const { feature, bbox, geom } of countryFeatures) {
        if (pointInBBox(pt, bbox) && geoContains(geom, pt)) {
          if (!seenCountryIds.has(feature.properties.id)) {
            seenCountryIds.add(feature.properties.id);
            flowCountries.push(toRelationItem(feature, 'countriesTopN'));
          }
          break;
        }
      }
    }

    if (flowCountries.length > 0) {
      fact.relations = {
        ...(fact.relations ?? {}),
        countries: flowCountries,
      };
    }
  }

  // 4. Lakes: Countries containing or bordering the lake
  const lakeFeatures = featuresByLayer['lakes.json'] ?? [];
  for (const lake of lakeFeatures) {
    const fact = facts[lake.properties.id];
    if (!fact) continue;

    const centerCoords = getFeatureCoords(lake);
    const pts = extractPoints(lake.geometry.coordinates);
    const testPoints: [number, number][] = [[centerCoords.lng, centerCoords.lat]];

    // Add sampled points from boundary
    const step = Math.max(1, Math.floor(pts.length / 20));
    for (let i = 0; i < pts.length; i += step) {
      const pt = pts[i];
      if (pt) testPoints.push(pt);
    }

    const lakeCountries: GeographicRelationItem[] = [];
    const seenLakeCountryIds = new Set<string>();

    for (const pt of testPoints) {
      if (!pt) continue;
      for (const { feature, bbox, geom } of countryFeatures) {
        if (!seenLakeCountryIds.has(feature.properties.id)) {
          if (pointInBBox(pt, bbox) && geoContains(geom, pt)) {
            seenLakeCountryIds.add(feature.properties.id);
            lakeCountries.push(toRelationItem(feature, 'countriesTopN'));
          }
        }
      }
    }

    if (lakeCountries.length > 0) {
      fact.relations = {
        ...(fact.relations ?? {}),
        countries: lakeCountries,
      };
    }
  }

  // Sort search index by rank
  searchIndex.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  return { searchIndex, facts };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { searchIndex, facts } = buildSearchIndexAndFacts();

  fs.writeFileSync(path.join(DATA_DIR, 'search-index.json'), JSON.stringify(searchIndex));
  fs.writeFileSync(path.join(DATA_DIR, 'facts.json'), JSON.stringify(facts));

  console.log(
    `Built search-index.json (${searchIndex.length} items) and facts.json (${Object.keys(facts).length} items)`,
  );
}
