import { z } from 'zod';

/** Layers that have a ranking table; the ids are layer ids so a row maps straight to a layer. */
export const RANKING_CATEGORIES = [
  'countriesTopN',
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

/** What a category is ranked by: km² (area), km (length) or m (elevation). */
export type RankingMetric = 'area' | 'length' | 'elevation';

export const RankingRowSchema = z.object({
  id: z.string().min(1),
  /** World rank within the category (1 = the biggest). */
  order: z.number().int().positive(),
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
  lakes: 'lake',
  rivers: 'river',
  mountains: 'mountain',
  peaks: 'peak',
  deserts: 'desert',
  landforms: 'landform',
  marine: 'marine',
};
