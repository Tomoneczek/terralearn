import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampServiceWorker } from './stampServiceWorker.js';
import { getFeatureCoords, type ObjectFacts } from './buildSearchAndFacts.js';
import {
  CATEGORY_METRIC,
  RANKING_CATEGORIES,
  RankingsDataSchema,
  type RankingCategory,
  type RankingRow,
  type RankingsData,
} from '../../src/rankings/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../public/data');

interface SourceFeature {
  properties: {
    id: string;
    kind: string;
    name_pl: string;
    name_en: string;
    landformType?: string;
    marineType?: string;
    rank: { area?: number; length?: number; elevation?: number; order?: number };
    labelLat?: number;
    labelLng?: number;
  };
  geometry: { type: string; coordinates: unknown };
}

/** Where each category comes from: the data file and the `kind` of its features. */
const SOURCES: Readonly<Record<RankingCategory, { file: string; kind: string }>> = {
  countriesTopN: { file: 'countries.json', kind: 'country' },
  lakes: { file: 'lakes.json', kind: 'lake' },
  rivers: { file: 'rivers.json', kind: 'river' },
  mountains: { file: 'regions.json', kind: 'mountain' },
  peaks: { file: 'places.json', kind: 'peak' },
  deserts: { file: 'regions.json', kind: 'desert' },
  landforms: { file: 'landforms.json', kind: 'landform' },
  marine: { file: 'marine.json', kind: 'marine' },
};

function readJson<T>(file: string, dir: string): T {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as T;
}

/** Two decimals (about 1 km) is plenty for flying the camera to an object. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Rough size of an object in km: how far the camera should stand back to see it whole. */
function extentKm(f: SourceFeature): number {
  const { area, length } = f.properties.rank;
  if (length) return Math.round(length);
  if (area) return Math.round(Math.sqrt(area));
  return 0;
}

/**
 * Ranking tables for the UI, built from the finished layer files (no geometry). The order follows
 * the pipeline's own `rank.order` where it exists; categories without it (peaks) are ordered by
 * the metric. Rows keep every object of the layer, not only the Top N shown on the globe.
 */
export function buildRankings(dir = DATA_DIR): RankingsData {
  const facts = readJson<Record<string, ObjectFacts>>('facts.json', dir);
  const countryNames: RankingsData['countries'] = {};
  const usedCountryIds = new Set<string>();

  const categories = {} as RankingsData['categories'];
  for (const category of RANKING_CATEGORIES) {
    const { file, kind } = SOURCES[category];
    const metric = CATEGORY_METRIC[category];
    const features = readJson<{ features: SourceFeature[] }>(file, dir).features.filter(
      f => f.properties.kind === kind,
    );

    const rows = features.map(f => {
      const p = f.properties;
      const { lat, lng } = getFeatureCoords(f as Parameters<typeof getFeatureCoords>[0]);
      const countries = facts[p.id]?.relations?.countries?.map(c => {
        usedCountryIds.add(c.id);
        return c.id;
      });
      const row: Omit<RankingRow, 'order'> & { order?: number } = {
        id: p.id,
        order: p.rank.order,
        value: p.rank[metric] ?? null,
        name_pl: p.name_pl,
        name_en: p.name_en,
        lat: round2(lat),
        lng: round2(lng),
        extentKm: extentKm(f),
        ...(countries?.length ? { countries } : {}),
        ...(p.landformType || p.marineType ? { subtype: p.landformType ?? p.marineType } : {}),
      };
      return row;
    });

    rows.sort(
      (a, b) =>
        (a.order ?? Infinity) - (b.order ?? Infinity) ||
        (b.value ?? -1) - (a.value ?? -1) ||
        a.name_en.localeCompare(b.name_en),
    );
    categories[category] = rows.map((row, index) => ({ ...row, order: row.order ?? index + 1 }));
  }

  for (const f of readJson<{ features: SourceFeature[] }>('countries.json', dir).features) {
    if (usedCountryIds.has(f.properties.id)) {
      countryNames[f.properties.id] = { pl: f.properties.name_pl, en: f.properties.name_en };
    }
  }

  return RankingsDataSchema.parse({ countries: countryNames, categories });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rankings = buildRankings();
  fs.writeFileSync(path.join(DATA_DIR, 'rankings.json'), JSON.stringify(rankings));
  const counts = RANKING_CATEGORIES.map(c => `${c}=${rankings.categories[c].length}`).join(' ');
  console.log(`Built rankings.json (${counts})`);
  console.log(`Service worker cache version: ${stampServiceWorker()}`);
}
