import fs from 'node:fs';
import path from 'node:path';
import {
  findKnownPlace,
  loadGeonames,
  topCitiesPerCountry,
  type KnownPlace,
} from './geonamesCities.js';

const DATA_DIR = path.resolve(process.cwd(), 'public/data');
const OVERRIDES_PATH = path.resolve(process.cwd(), 'scripts/data/overrides/pl.json');

export interface CountryCityEntry {
  /** An existing place's id (capital / large city), else `city-gn-<geonameId>`. */
  id: string;
  /** Feature kind: of the existing place, else `megacity` (the layer of large cities). */
  kind: 'capital' | 'megacity';
  /** `false` = only in the table, search and cards: no geometry on the globe. */
  onGlobe: boolean;
  name_pl: string;
  name_en: string;
  population: number;
  lat: number;
  lng: number;
  countryId: string;
  countryRank: number;
}

interface PlaceFeature {
  properties: {
    id: string;
    kind: string;
    name_pl: string;
    name_en: string;
    aliases?: string[];
    rank?: { population?: number };
    labelLat?: number;
    labelLng?: number;
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The three biggest cities of every country (population of the city itself, GeoNames), matched to
 * the capital / large-city features that already exist so one city is never two objects. Without
 * the cached GeoNames archive the list is empty.
 */
export function buildCountryCities(dir = DATA_DIR): CountryCityEntry[] {
  const countries: { properties: { id: string } }[] = JSON.parse(
    fs.readFileSync(path.join(dir, 'countries.json'), 'utf-8'),
  ).features;
  const places: PlaceFeature[] = JSON.parse(
    fs.readFileSync(path.join(dir, 'places.json'), 'utf-8'),
  ).features;
  const polish: Record<string, string> = fs.existsSync(OVERRIDES_PATH)
    ? (JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8')).places ?? {})
    : {};

  const known: KnownPlace[] = places
    .filter(f => f.properties.kind === 'capital' || f.properties.kind === 'megacity')
    .map(f => ({
      id: f.properties.id,
      kind: f.properties.kind,
      population: f.properties.rank?.population ?? 0,
      names: [f.properties.name_en, f.properties.name_pl, ...(f.properties.aliases ?? [])],
      lat: f.properties.labelLat ?? 0,
      lng: f.properties.labelLng ?? 0,
    }));

  const top = topCitiesPerCountry(
    loadGeonames(),
    new Set(countries.map(c => c.properties.id)),
    city => findKnownPlace(city, known)?.id,
  );

  return top.map(city => {
    const match = findKnownPlace(city, known);
    const existing = match ? places.find(f => f.properties.id === match.id)?.properties : undefined;
    return {
      id: match?.id ?? `city-gn-${city.geonameId}`,
      kind: match?.kind === 'capital' ? 'capital' : 'megacity',
      onGlobe: match !== undefined,
      name_pl: existing?.name_pl ?? polish[city.name] ?? city.name,
      name_en: existing?.name_en ?? city.name,
      population: city.population,
      lat: round2(city.lat),
      lng: round2(city.lng),
      countryId: city.countryId,
      countryRank: city.countryRank,
    };
  });
}
