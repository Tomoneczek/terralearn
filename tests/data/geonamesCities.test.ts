import { describe, it, expect } from 'vitest';
import {
  EXCLUDED_GEONAMES_IDS,
  findKnownPlace,
  parseGeonames,
  topCitiesPerCountry,
  type GeonamesCity,
  type KnownPlace,
} from '../../scripts/data/geonamesCities';

/** A GeoNames TSV line: id, name, ascii, alternates, lat, lng, class, code, country, …, population. */
function line(
  id: string,
  name: string,
  country: string,
  population: number,
  code = 'PPL',
  lat = 10,
  lng = 20,
): string {
  const cols = Array<string>(19).fill('');
  Object.assign(cols, {
    0: id,
    1: name,
    2: name,
    4: String(lat),
    5: String(lng),
    6: 'P',
    7: code,
    8: country,
    14: String(population),
  });
  return cols.join('\t');
}

const city = (
  id: string,
  name: string,
  country: string,
  population: number,
  lat = 10,
  lng = 20,
): GeonamesCity => ({ geonameId: id, name, country, population, lat, lng });

describe('parseGeonames', () => {
  it('reads cities and drops parts of cities, empty populations and known districts', () => {
    const cities = parseGeonames(
      [
        line('1', 'Warsaw', 'PL', 1700000),
        line('2', 'Ursynów', 'PL', 150000, 'PPLX'),
        line('3', 'Ghost town', 'PL', 0),
        line('5110302', 'Brooklyn', 'US', 2736074),
        line('4', 'Bad row', 'PL', 100).split('\t').slice(0, 5).join('\t'),
        line('6', 'St.  Petersburg', 'RU', 5000000),
      ].join('\n'),
    );
    expect(cities.map(c => c.name)).toEqual(['Warsaw', 'St. Petersburg']);
    expect(cities[0]).toMatchObject({
      geonameId: '1',
      country: 'PL',
      population: 1700000,
      lat: 10,
      lng: 20,
    });
  });

  it('lists a reason for every excluded id', () => {
    for (const reason of Object.values(EXCLUDED_GEONAMES_IDS))
      expect(reason.length).toBeGreaterThan(5);
    expect(Object.keys(EXCLUDED_GEONAMES_IDS)).toContain('5110302');
  });
});

describe('topCitiesPerCountry', () => {
  const ids = new Set(['PL', 'FRA', 'DE']);

  it('keeps the three biggest cities of each country, in order, with their place in the country', () => {
    const top = topCitiesPerCountry(
      [
        city('1', 'Łódź', 'PL', 680000),
        city('2', 'Warsaw', 'PL', 1700000),
        city('3', 'Kraków', 'PL', 800000),
        city('4', 'Wrocław', 'PL', 670000),
        city('5', 'Berlin', 'DE', 3400000),
      ],
      ids,
    );
    expect(top.filter(c => c.countryId === 'PL').map(c => [c.name, c.countryRank])).toEqual([
      ['Warsaw', 1],
      ['Kraków', 2],
      ['Łódź', 3],
    ]);
    expect(top.filter(c => c.countryId === 'DE')).toHaveLength(1);
  });

  it('maps GeoNames country codes to the ids of the countries layer and skips unknown countries', () => {
    const top = topCitiesPerCountry(
      [city('1', 'Paris', 'FR', 2100000), city('2', 'Vaduz', 'LI', 6000)],
      ids,
    );
    expect(top.map(c => c.countryId)).toEqual(['FRA']);
  });

  it('keeps the bigger one of two places with the same name in a country', () => {
    const top = topCitiesPerCountry(
      [
        city('1', 'Conakry', 'DE', 1900000),
        city('2', 'Conakry', 'DE', 1800000),
        city('3', 'Other', 'DE', 100000),
      ],
      ids,
    );
    expect(top.map(c => c.geonameId)).toEqual(['1', '3']);
  });

  it('skips a district of an object that a bigger city already stands for', () => {
    const key = (c: GeonamesCity) =>
      c.name === 'Camayenne' || c.name === 'Conakry' ? 'capital' : undefined;
    const top = topCitiesPerCountry(
      [
        city('1', 'Conakry', 'DE', 1900000),
        city('2', 'Camayenne', 'DE', 1800000),
        city('3', 'Kankan', 'DE', 200000),
      ],
      ids,
      key,
    );
    expect(top.map(c => c.name)).toEqual(['Conakry', 'Kankan']);
  });

  it('breaks ties by name so the result is stable', () => {
    const top = topCitiesPerCountry([city('1', 'B', 'DE', 5), city('2', 'A', 'DE', 5)], ids);
    expect(top.map(c => c.name)).toEqual(['A', 'B']);
  });
});

describe('findKnownPlace', () => {
  const place = (
    id: string,
    names: string[],
    population: number,
    lat: number,
    lng: number,
  ): KnownPlace => ({
    id,
    kind: 'capital',
    names,
    population,
    lat,
    lng,
  });
  const places = [
    place('capital-warsaw', ['Warsaw', 'Warszawa'], 1707000, 52.23, 21.01),
    place('capital-vatican-city', ['Vatican City'], 832, 41.9, 12.45),
    place('capital-astana', ['Astana'], 1100000, 51.18, 71.45),
  ];

  it('finds the existing place by name nearby', () => {
    expect(findKnownPlace(city('1', 'Warszawa', 'PL', 1700000, 52.23, 21.0), places)?.id).toBe(
      'capital-warsaw',
    );
  });

  it('does not take a big city for the tiny place beside it (Rome / Vatican City)', () => {
    expect(findKnownPlace(city('2', 'Rome', 'IT', 2300000, 41.89, 12.48), places)).toBeUndefined();
  });

  it('accepts a different name at the same spot with a similar population (Nur-Sultan / Astana)', () => {
    expect(findKnownPlace(city('3', 'Nur-Sultan', 'KZ', 1500000, 51.18, 71.45), places)?.id).toBe(
      'capital-astana',
    );
  });

  it('ignores a same-named place far away', () => {
    expect(findKnownPlace(city('4', 'Warsaw', 'US', 15000, 41.2, -85.8), places)).toBeUndefined();
  });
});
