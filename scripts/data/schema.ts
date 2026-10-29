import { z } from 'zod';

export const GeoFeatureKindSchema = z.enum([
  'country',
  'capital',
  'megacity',
  'lake',
  'river',
  'mountain',
  'desert',
  'peak',
  'landform',
  'marine',
]);

export type GeoFeatureKind = z.infer<typeof GeoFeatureKindSchema>;

export const LandformTypeSchema = z.enum(['plateau', 'plain', 'basin', 'delta', 'peninsula']);

export type LandformType = z.infer<typeof LandformTypeSchema>;

export const MarineTypeSchema = z.enum([
  'sea',
  'gulf',
  'bay',
  'strait',
  'channel',
  'sound',
  'fjord',
  'ocean',
]);

export type MarineType = z.infer<typeof MarineTypeSchema>;

export const GeoFeaturePropertiesSchema = z.object({
  id: z.string().min(1),
  kind: GeoFeatureKindSchema,
  layerId: z.string().min(1),
  name_pl: z.string().min(1),
  name_en: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  landformType: LandformTypeSchema.optional(),
  marineType: MarineTypeSchema.optional(),
  rank: z.object({
    area: z.number().nonnegative().optional(),
    population: z.number().nonnegative().optional(),
    length: z.number().nonnegative().optional(),
    elevation: z.number().optional(),
    order: z.number().int().positive().optional(),
    /** Listed in rankings, but not counted: it has the last `order`, after every counted object. */
    unranked: z.boolean().optional(),
  }),
  /** Id of the larger object this one lies inside (a desert within the Sahara). */
  partOf: z.string().optional(),
  labelLat: z.number().min(-90).max(90).optional(),
  labelLng: z.number().min(-180).max(180).optional(),
  countryCode: z.string().optional(),
  countryName: z.string().optional(),
});

export type GeoFeatureProperties = z.infer<typeof GeoFeaturePropertiesSchema>;

export const GeoFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.union([z.string(), z.number()]).optional(),
  properties: GeoFeaturePropertiesSchema,
  geometry: z.object({
    type: z.string(),
    coordinates: z.any(),
  }),
});

export type GeoFeature = z.infer<typeof GeoFeatureSchema>;

export const GeoFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(GeoFeatureSchema),
});

export type GeoFeatureCollection = z.infer<typeof GeoFeatureCollectionSchema>;
