import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

export interface ObjectFacts {
  id: string;
  name_pl: string;
  name_en: string;
  kind: string;
  kind_pl: string;
  stats: FactStat[];
  trivia?: string;
  comparison?: string;
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

function getKindPl(kind: string): string {
  switch (kind) {
    case 'country':
      return 'Państwo';
    case 'lake':
      return 'Jezioro';
    case 'river':
      return 'Rzeka';
    case 'mountain_range':
      return 'Pasmo górskie';
    case 'desert':
      return 'Pustynia';
    case 'capital':
      return 'Stolica państwa';
    case 'megacity':
      return 'Metropolia';
    case 'peak':
      return 'Szczyt górski';
    default:
      return 'Obiekt geograficzny';
  }
}

function generateFacts(f: RawGeoFeature): ObjectFacts {
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
      const ratio = area / 312696;
      if (ratio >= 1) {
        comparison = `Powierzchnia równa ok. ${ratio.toFixed(1)}x terytorium Polski`;
      } else {
        comparison = `Powierzchnia stanowi ok. ${(ratio * 100).toFixed(1)}% powierzchni Polski`;
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
      comparison = `Długość równa ok. ${wislaRatio.toFixed(1)}x długości Wisły`;
    }
    if (p.rank?.order) {
      stats.push({ label: 'Ranking rzek', value: `#${p.rank.order} na świecie` });
    }
  } else if (p.kind === 'mountain_range') {
    if (elev) {
      stats.push({ label: 'Maks. wysokość', value: `${elev.toLocaleString('pl-PL')} m n.p.m.` });
      const rysyRatio = elev / 2499;
      comparison = `Wysokość najwyższego szczytu: ok. ${rysyRatio.toFixed(1)}x Rysy`;
    }
    if (area) {
      stats.push({ label: 'Obszar', value: `${area.toLocaleString('pl-PL')} km²` });
    }
  } else if (p.kind === 'desert') {
    if (area) {
      stats.push({ label: 'Powierzchnia', value: `${area.toLocaleString('pl-PL')} km²` });
      const ratio = area / 312696;
      comparison = `Obszar równy ok. ${ratio.toFixed(1)}x terytorium Polski`;
    }
  } else if (p.kind === 'capital' || p.kind === 'megacity') {
    if (pop) {
      stats.push({ label: 'Ludność', value: `${pop.toLocaleString('pl-PL')} mieszkańców` });
      const warsawRatio = pop / 1790000;
      comparison = `Populacja równa ok. ${warsawRatio.toFixed(1)}x Warszawa`;
    }
    if (p.countryName) {
      stats.push({ label: 'Kraj', value: p.countryName });
    }
  } else if (p.kind === 'peak') {
    if (elev) {
      stats.push({ label: 'Wysokość', value: `${elev.toLocaleString('pl-PL')} m n.p.m.` });
      const rysyRatio = elev / 2499;
      comparison = `Wysokość równa ok. ${rysyRatio.toFixed(1)}x Rysy`;
    }
  }

  return {
    id: p.id,
    name_pl: p.name_pl,
    name_en: p.name_en,
    kind: p.kind,
    kind_pl: getKindPl(p.kind),
    stats,
    comparison,
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
    { filename: 'places.json', layerId: 'capitals' },
  ];

  const searchIndex: SearchIndexItem[] = [];
  const facts: Record<string, ObjectFacts> = {};
  const seenIds = new Set<string>();

  for (const { filename, layerId } of files) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as RawFeatureCollection;

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
