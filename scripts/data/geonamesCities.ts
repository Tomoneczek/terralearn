import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { distanceDeg, nameKey } from './wikidata.js';

/**
 * The three most populous cities of every country, from GeoNames `cities15000` (CC BY 4.0).
 * GeoNames counts the population of the city itself (not the agglomeration), one row per place.
 * Nothing here talks to the network: `fetch.ts` caches the ZIP in `.cache/data/raw/`.
 */

const RAW_DIR = path.resolve(process.cwd(), '.cache/data/raw');
const ARCHIVE = 'geonames-cities15000.zip';

export const CITIES_PER_COUNTRY = 3;

/** GeoNames country codes whose id in our countries layer is not the ISO alpha-2 code. */
export const COUNTRY_ID_BY_GEONAMES_CODE: Readonly<Record<string, string>> = {
  FR: 'FRA',
  NO: 'NOR',
  TW: 'CN-TW',
  XK: 'KOS',
};

/**
 * GeoNames places that are districts or administrative areas, not cities, but would reach a
 * country's top three (found by reviewing every country's list; see ADR-0063). The id is the
 * GeoNames id; the name is only for the reader.
 */
export const EXCLUDED_GEONAMES_IDS: Readonly<Record<string, string>> = {
  '5110302': 'Brooklyn (borough of New York)',
  '3526683': 'Iztapalapa (borough of Mexico City)',
  '2293521': 'Abobo (district of Abidjan)',
  '7874116': 'Santo Domingo Oeste (municipality of the capital)',
  '7648070': 'Balbala (district of Djibouti)',
  '8307074': 'Mulenvos (commune of Luanda)',
  '1771023': 'Kampung Baru Subang (suburb of Kuala Lumpur)',
  '195272': 'Kakamega (the county population, the town has ~100 thousand)',
  '1821940': 'Takeo (the province population)',
};

export interface GeonamesCity {
  geonameId: string;
  name: string;
  lat: number;
  lng: number;
  /** GeoNames country code (ISO alpha-2). */
  country: string;
  population: number;
}

/**
 * Parses `cities15000.txt` (tab separated). Parts of a city that GeoNames lists as places of their
 * own (feature code `PPLX`, e.g. the boroughs of New York) and places without a population are
 * dropped.
 */
export function parseGeonames(tsv: string): GeonamesCity[] {
  const cities: GeonamesCity[] = [];
  for (const line of tsv.split('\n')) {
    const col = line.split('\t');
    if (col.length < 15) continue;
    const population = Number(col[14]);
    const lat = Number(col[4]);
    const lng = Number(col[5]);
    if (
      col[7] === 'PPLX' ||
      col[0]! in EXCLUDED_GEONAMES_IDS ||
      !(population > 0) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      continue;
    }
    cities.push({
      geonameId: col[0]!,
      name: col[1]!.replace(/\s+/g, ' ').trim(),
      lat,
      lng,
      country: col[8]!,
      population,
    });
  }
  return cities;
}

/** Reads the cached archive; an empty list when it has not been fetched. */
export function loadGeonames(rawDir = RAW_DIR): GeonamesCity[] {
  const file = path.join(rawDir, ARCHIVE);
  if (!fs.existsSync(file)) return [];
  const files = unzipSync(new Uint8Array(fs.readFileSync(file)));
  const data = files['cities15000.txt'];
  return data ? parseGeonames(strFromU8(data)) : [];
}

export interface CountryCity extends GeonamesCity {
  /** Id of the country in the countries layer. */
  countryId: string;
  /** 1–3: place among the country's own cities. */
  countryRank: number;
}

/** The `CITIES_PER_COUNTRY` biggest cities of every country in `countryIds` (ties: by name). */
export function topCitiesPerCountry(
  cities: readonly GeonamesCity[],
  countryIds: ReadonlySet<string>,
  /**
   * Identifies the object a city is part of (e.g. the existing capital it sits in). A city whose
   * key was already picked is skipped: it is a district or a duplicate of the bigger one.
   */
  sameObject: (city: GeonamesCity) => string | undefined = () => undefined,
): CountryCity[] {
  const byCountry = new Map<string, GeonamesCity[]>();
  for (const city of cities) {
    const id = COUNTRY_ID_BY_GEONAMES_CODE[city.country] ?? city.country;
    if (!countryIds.has(id)) continue;
    const list = byCountry.get(id) ?? [];
    list.push(city);
    byCountry.set(id, list);
  }

  const result: CountryCity[] = [];
  for (const [countryId, list] of [...byCountry].sort((a, b) => a[0].localeCompare(b[0]))) {
    // GeoNames often has the city and its municipality / area under one name: keep the bigger one
    const names = new Set<string>();
    const objects = new Set<string>();
    const picked: GeonamesCity[] = [];
    for (const city of list.sort(
      (a, b) => b.population - a.population || a.name.localeCompare(b.name, 'en'),
    )) {
      const name = nameKey(city.name);
      const object = sameObject(city);
      if (names.has(name) || (object !== undefined && objects.has(object))) continue;
      names.add(name);
      if (object !== undefined) objects.add(object);
      picked.push(city);
      if (picked.length === CITIES_PER_COUNTRY) break;
    }
    picked.forEach((city, index) => result.push({ ...city, countryId, countryRank: index + 1 }));
  }
  return result;
}

export interface KnownPlace {
  id: string;
  kind: string;
  /** Population in the data (an agglomeration, so it can be bigger than the city's). */
  population: number;
  names: string[];
  lat: number;
  lng: number;
}

/**
 * The existing place (capital / large city) that is this GeoNames city, so one city is not two
 * objects. The same name nearby decides; a different name counts only at the same spot **and** with
 * a similar population (Nur-Sultan / Astana), never for a tiny place beside a big one (Vatican
 * City beside Rome).
 */
export function findKnownPlace(
  city: GeonamesCity,
  places: readonly KnownPlace[],
): KnownPlace | undefined {
  const key = nameKey(city.name);
  const sameName = places.find(
    place =>
      distanceDeg(place, city) < 1 && place.names.some(name => name && nameKey(name) === key),
  );
  if (sameName) return sameName;
  return places.find(place => {
    const ratio = place.population / city.population;
    return distanceDeg(place, city) < 0.05 && ratio > 0.25 && ratio < 4;
  });
}
