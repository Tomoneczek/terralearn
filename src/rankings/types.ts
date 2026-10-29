import { z } from 'zod';
import type { LayerId } from '@/layers/types';

/** Layers that have a ranking table; the ids are layer ids so a row maps straight to a layer. */
export const RANKING_CATEGORIES = [
  'countriesTopN',
  'countriesPopulation',
  'capitals',
  'cities',
  'countryCities',
  'lakes',
  'rivers',
  'mountains',
  'peaks',
  'deserts',
  'landforms',
  'marine',
] as const;

export type RankingCategory = (typeof RANKING_CATEGORIES)[number];

export function isRankingCategory(value: unknown): value is RankingCategory {
  return (RANKING_CATEGORIES as readonly unknown[]).includes(value);
}

/** What a category is ranked by: km² (area), km (length), m (elevation) or inhabitants. */
export type RankingMetric = 'area' | 'length' | 'elevation' | 'population';

export const RankingRowSchema = z.object({
  id: z.string().min(1),
  /**
   * World rank within the category (1 = the biggest). `null` = listed with its value, but not
   * counted (Antarctica among countries, a part of a larger desert): no number, nobody pushed down.
   */
  order: z.number().int().positive().nullable(),
  /**
   * Rank used by the layer's Top N slider. Absent for objects that exist only in the table
   * (rivers taken from Wikidata): they have no geometry to draw on the globe.
   */
  layerOrder: z.number().int().positive().optional(),
  /** Value of the category metric; null when it is unknown (e.g. a range without a height). */
  value: z.number().nonnegative().nullable(),
  name_pl: z.string().min(1),
  name_en: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Rough size of the object in km (square root of the area, or the length); 0 for points. */
  extentKm: z.number().nonnegative(),
  /** ISO codes of the countries the object lies in; resolved through `countries`. */
  countries: z.array(z.string()).optional(),
  /** Landform or marine subtype (plateau, strait, ...). */
  subtype: z.string().optional(),
  /** Feature kind, only where one category mixes kinds (cities: capital or megacity). */
  kind: z.string().optional(),
  /** 1–3: place among the biggest cities of its own country (country-cities category only). */
  countryRank: z.number().int().min(1).optional(),
  /** Id of the larger object this one lies inside (a desert within the Sahara). */
  partOf: z.string().optional(),
});

export type RankingRow = z.infer<typeof RankingRowSchema>;

const CategoryShape = Object.fromEntries(
  RANKING_CATEGORIES.map(c => [c, z.array(RankingRowSchema)]),
) as Record<RankingCategory, z.ZodArray<typeof RankingRowSchema>>;

export const RankingsDataSchema = z.object({
  /** Names of the countries referenced by the rows, by ISO code. */
  countries: z.record(z.string(), z.object({ pl: z.string(), en: z.string() })),
  categories: z.object(CategoryShape),
});

export type RankingsData = z.infer<typeof RankingsDataSchema>;

export const CATEGORY_METRIC: Readonly<Record<RankingCategory, RankingMetric>> = {
  countriesTopN: 'area',
  countriesPopulation: 'population',
  capitals: 'population',
  cities: 'population',
  countryCities: 'population',
  lakes: 'area',
  rivers: 'length',
  mountains: 'elevation',
  peaks: 'elevation',
  deserts: 'area',
  landforms: 'area',
  marine: 'area',
};

/** Feature `kind` of the objects in each category (as in the layer data). */
export const CATEGORY_KIND: Readonly<Record<RankingCategory, string>> = {
  countriesTopN: 'country',
  countriesPopulation: 'country',
  capitals: 'capital',
  cities: 'megacity',
  countryCities: 'megacity',
  lakes: 'lake',
  rivers: 'river',
  mountains: 'mountain',
  peaks: 'peak',
  deserts: 'desert',
  landforms: 'landform',
  marine: 'marine',
};

/** Layer that draws a category's objects (several categories can share one layer). */
export const CATEGORY_LAYER: Readonly<Record<RankingCategory, LayerId>> = {
  countriesTopN: 'countriesTopN',
  countriesPopulation: 'countriesTopN',
  capitals: 'capitals',
  cities: 'megacities',
  countryCities: 'megacities',
  lakes: 'lakes',
  rivers: 'rivers',
  mountains: 'mountains',
  peaks: 'peaks',
  deserts: 'deserts',
  landforms: 'landforms',
  marine: 'marine',
};

/** Layer of a feature kind, for categories that mix kinds. */
const KIND_LAYER: Readonly<Record<string, LayerId>> = {
  capital: 'capitals',
  megacity: 'megacities',
};

/** The layer a row belongs to: its own kind decides in mixed categories, else the category's. */
export function rowLayer(row: Pick<RankingRow, 'kind'>, category: RankingCategory): LayerId {
  return (row.kind && KIND_LAYER[row.kind]) || CATEGORY_LAYER[category];
}
