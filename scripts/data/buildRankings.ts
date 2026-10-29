import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampServiceWorker } from './stampServiceWorker.js';
import { buildExtras } from './wikidataExtras.js';
import { MIN_CITY_POPULATION } from './rankingRules.js';
import { buildCountryCities } from './countryCities.js';
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
    partOf?: string;
    rank: {
      area?: number;
      length?: number;
      elevation?: number;
      population?: number;
      order?: number;
      unranked?: boolean;
    };
    labelLat?: number;
    labelLng?: number;
  };
  geometry: { type: string; coordinates: unknown };
}

interface Source {
  file: string;
  /** Feature kinds that make up the category. */
  kinds: string[];
  /** Objects below this value of the category metric are left out. */
  minValue?: number;
}

/** Where each category comes from: the data file, the `kind`s of its features and a size floor. */
const SOURCES: Readonly<Record<RankingCategory, Source>> = {
  countriesTopN: { file: 'countries.json', kinds: ['country'] },
  countriesPopulation: { file: 'countries.json', kinds: ['country'] },
  capitals: { file: 'places.json', kinds: ['capital'] },
  cities: { file: 'places.json', kinds: ['capital', 'megacity'], minValue: MIN_CITY_POPULATION },
  // Filled from the GeoNames top three of every country, not from layer features
  countryCities: { file: 'places.json', kinds: [] },
  lakes: { file: 'lakes.json', kinds: ['lake'] },
  rivers: { file: 'rivers.json', kinds: ['river'] },
  mountains: { file: 'regions.json', kinds: ['mountain'] },
  peaks: { file: 'places.json', kinds: ['peak'] },
  deserts: { file: 'regions.json', kinds: ['desert'] },
  landforms: { file: 'landforms.json', kinds: ['landform'] },
  marine: { file: 'marine.json', kinds: ['marine'] },
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

type UnorderedRow = Omit<RankingRow, 'order'> & { unranked: boolean };

/**
 * Sorts rows by value, biggest first (unknown values last, then the layer's own rank, then id) and
 * numbers them. Unranked objects keep their place in the list but take no number, so the next
 * object is not pushed down by them. Same ordering as the world rank on the cards (`wikidataExtras`).
 */
export function numberRows(rows: UnorderedRow[]): RankingRow[] {
  rows.sort(
    (a, b) =>
      (b.value ?? -1) - (a.value ?? -1) ||
      (a.layerOrder ?? Infinity) - (b.layerOrder ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
  let counted = 0;
  return rows.map(({ unranked, ...row }) => ({
    ...row,
    order: unranked ? null : ++counted,
  }));
}

/**
 * Ranking tables for the UI, built from the finished layer files (no geometry). Rows keep every
 * object of the layer, not only the Top N shown on the globe.
 */
export function buildRankings(dir = DATA_DIR): RankingsData {
  const facts = readJson<Record<string, ObjectFacts>>('facts.json', dir);
  const countryNames: RankingsData['countries'] = {};
  const usedCountryIds = new Set<string>();

  const countryCodes = new Set(
    readJson<{ features: SourceFeature[] }>('countries.json', dir).features.map(
      f => f.properties.id,
    ),
  );
  const riverExtras = buildExtras(dir).river;

  const categories = {} as RankingsData['categories'];
  for (const category of RANKING_CATEGORIES) {
    const { file, kinds, minValue } = SOURCES[category];
    const metric = CATEGORY_METRIC[category];
    const features = readJson<{ features: SourceFeature[] }>(file, dir).features.filter(f =>
      kinds.includes(f.properties.kind),
    );

    const rows: UnorderedRow[] = [];
    for (const f of features) {
      const p = f.properties;
      const value = p.rank[metric] ?? null;
      if (minValue !== undefined && (value ?? 0) < minValue) continue;
      const { lat, lng } = getFeatureCoords(f as Parameters<typeof getFeatureCoords>[0]);
      const countries = facts[p.id]?.relations?.countries?.map(c => {
        usedCountryIds.add(c.id);
        return c.id;
      });
      rows.push({
        id: p.id,
        // A country is drawn according to its area rank, whatever the table is sorted by
        layerOrder: p.rank.order ?? 1,
        unranked: p.rank.unranked === true,
        value,
        name_pl: p.name_pl,
        name_en: p.name_en,
        lat: round2(lat),
        lng: round2(lng),
        extentKm: extentKm(f),
        ...(category === 'cities' ? { kind: p.kind } : {}),
        ...(p.partOf ? { partOf: p.partOf } : {}),
        ...(countries?.length ? { countries } : {}),
        ...(p.landformType || p.marineType ? { subtype: p.landformType ?? p.marineType } : {}),
      });
    }

    if (category === 'countryCities') {
      for (const city of buildCountryCities(dir)) {
        usedCountryIds.add(city.countryId);
        rows.push({
          id: city.id,
          ...(city.onGlobe ? { layerOrder: 1 } : {}),
          unranked: false,
          value: city.population,
          name_pl: city.name_pl,
          name_en: city.name_en,
          lat: city.lat,
          lng: city.lng,
          extentKm: 0,
          kind: city.kind,
          countries: [city.countryId],
          countryRank: city.countryRank,
        });
      }
    }

    if (category === 'rivers') {
      for (const extra of riverExtras.extras) {
        const codes = extra.countries.filter(code => countryCodes.has(code));
        codes.forEach(code => usedCountryIds.add(code));
        rows.push({
          id: extra.id,
          unranked: false,
          value: extra.value,
          name_pl: extra.name_pl,
          name_en: extra.name_en,
          lat: extra.lat,
          lng: extra.lng,
          extentKm: extra.value,
          ...(codes.length ? { countries: codes } : {}),
        });
      }
    }

    categories[category] = numberRows(rows);
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
