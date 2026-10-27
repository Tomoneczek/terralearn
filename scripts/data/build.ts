import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { geoArea } from 'd3-geo';
import polylabel from 'polylabel';
import { fetchDatasets } from './fetch.js';
import { mergeRivers } from './mergeRivers.js';
import {
  SEAS_LISTED_AS_LAKES,
  compareRanges,
  isReservoir,
  lakeEnglishName,
  maxElevationInRange,
} from './physicalRanking.js';
import { mergeNearbyNamesakes } from './dedupe.js';
import { writeAttribution } from './attribution.js';
import {
  type GeoFeature,
  type GeoFeatureCollection,
  GeoFeatureCollectionSchema,
  type LandformType,
  type MarineType,
} from './schema.js';

const EARTH_RADIUS_KM = 6371.0088;
const RAW_DIR = path.resolve(process.cwd(), '.cache/data/raw');
const OUT_DIR = path.resolve(process.cwd(), 'public/data');
const OVERRIDES_PATH = path.resolve(process.cwd(), 'scripts/data/overrides/pl.json');

type Position = [number, number];
type PositionList = Position[];
type PolygonCoordinates = PositionList[];
type MultiPolygonCoordinates = PolygonCoordinates[];

function roundCoord(num: number): number {
  return Math.round(num * 1000) / 1000;
}

function roundCoords(coords: unknown): unknown {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number') {
    return [roundCoord(coords[0] as number), roundCoord((coords[1] as number) ?? 0)];
  }
  return coords.map(roundCoords);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeUniqueId(baseId: string, usedIds: Set<string>): string {
  let id = baseId;
  let counter = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${counter}`;
    counter++;
  }
  usedIds.add(id);
  return id;
}

function titleCasePolish(str: string): string {
  if (str !== str.toUpperCase()) return str;
  return str
    .toLowerCase()
    .split(/([\s\-–—/]+)/)
    .map(word => {
      if (['i', 'w', 'z', 'o', 'na', 'do', 'od', 'po', 'pod', 'nad'].includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

interface GenericGeometry {
  type: string;
  coordinates: unknown;
}

function getBestPolygon(geometry: GenericGeometry): PolygonCoordinates | null {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates as PolygonCoordinates;
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    const polys = geometry.coordinates as MultiPolygonCoordinates;
    return polys.reduce((best, poly) => {
      const bestLen = best[0]?.length ?? 0;
      const curLen = poly[0]?.length ?? 0;
      return curLen > bestLen ? poly : best;
    }, polys[0] ?? []);
  }
  return null;
}

function computeLabelPoint(geometry: GenericGeometry): [number, number] {
  const poly = getBestPolygon(geometry);
  if (!poly || poly.length === 0) return [0, 0];
  try {
    const formatted: [number, number][][] = poly.map(ring =>
      ring.map(pt => [pt[0] ?? 0, pt[1] ?? 0]),
    );
    const pt = polylabel(formatted, 0.2);
    return [roundCoord(pt[0] ?? 0), roundCoord(pt[1] ?? 0)];
  } catch {
    const firstRing = poly[0];
    const firstPt = firstRing?.[0] ?? [0, 0];
    return [roundCoord(firstPt[0] ?? 0), roundCoord(firstPt[1] ?? 0)];
  }
}

function measureFileSizes(filePath: string): { rawKb: number; gzipKb: number } {
  const content = fs.readFileSync(filePath);
  const gzip = zlib.gzipSync(content);
  return {
    rawKb: Math.round((content.length / 1024) * 10) / 10,
    gzipKb: Math.round((gzip.length / 1024) * 10) / 10,
  };
}

export async function buildData(): Promise<void> {
  console.log('🚀 Starting geographic data build pipeline...');

  await fetchDatasets();

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const overrides: {
    rivers: Record<string, string>;
    places: Record<string, string>;
    regions: Record<string, string>;
    peaks: Record<string, string>;
  } = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8'));

  // 1. Countries
  console.log('  → Processing countries...');
  const rawCountries = JSON.parse(
    fs.readFileSync(path.join(RAW_DIR, 'ne_110m_admin_0_countries.geojson'), 'utf-8'),
  );

  const countryFeatures: GeoFeature[] = [];
  const usedCountryIds = new Set<string>();
  for (const raw of rawCountries.features) {
    const name = raw.properties.NAME || raw.properties.ADMIN;
    if (!name) continue;

    const code = raw.properties.ISO_A2 !== '-99' ? raw.properties.ISO_A2 : raw.properties.ADM0_A3;
    const namePl = raw.properties.NAME_PL || raw.properties.NAME;
    const nameEn = raw.properties.NAME_EN || name;
    const areaKm2 = Math.round(geoArea(raw) * EARTH_RADIUS_KM * EARTH_RADIUS_KM);
    const [labelLng, labelLat] = computeLabelPoint(raw.geometry);
    const id = makeUniqueId(code || slugify(name), usedCountryIds);

    countryFeatures.push({
      type: 'Feature',
      id,
      properties: {
        id,
        kind: 'country',
        layerId: 'political-countries',
        name_pl: namePl,
        name_en: nameEn,
        aliases: [
          raw.properties.NAME_LONG,
          raw.properties.FORMAL_EN,
          raw.properties.BRK_NAME,
        ].filter((a): a is string => Boolean(a) && a !== nameEn),
        rank: {
          area: areaKm2,
          population: raw.properties.POP_EST > 0 ? raw.properties.POP_EST : undefined,
        },
        labelLng,
        labelLat,
        countryCode: code,
        countryName: nameEn,
      },
      geometry: {
        type: raw.geometry.type,
        coordinates: roundCoords(raw.geometry.coordinates),
      },
    });
  }

  countryFeatures.sort((a, b) => (b.properties.rank.area || 0) - (a.properties.rank.area || 0));
  countryFeatures.forEach((f, idx) => {
    f.properties.rank.order = idx + 1;
  });

  const countriesCol: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: countryFeatures,
  };
  GeoFeatureCollectionSchema.parse(countriesCol);
  const countriesFile = path.join(OUT_DIR, 'countries.json');
  fs.writeFileSync(countriesFile, JSON.stringify(countriesCol));
  console.log(`    ✓ Saved ${countriesCol.features.length} countries to countries.json`);

  // 2. Rivers
  console.log('  → Processing rivers...');
  const rawRivers = JSON.parse(
    fs.readFileSync(path.join(RAW_DIR, 'ne_50m_rivers_lake_centerlines.geojson'), 'utf-8'),
  );
  const mergedRivers = mergeRivers(rawRivers.features, overrides.rivers);
  const riversCol: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: mergedRivers,
  };
  GeoFeatureCollectionSchema.parse(riversCol);
  const riversFile = path.join(OUT_DIR, 'rivers.json');
  fs.writeFileSync(riversFile, JSON.stringify(riversCol));
  console.log(`    ✓ Saved ${riversCol.features.length} rivers to rivers.json`);

  // 3. Lakes
  console.log('  → Processing lakes...');
  const rawLakes = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'ne_50m_lakes.geojson'), 'utf-8'));

  let lakeFeatures: GeoFeature[] = [];
  const usedLakeIds = new Set<string>();
  const rawMarineForLakes = JSON.parse(
    fs.readFileSync(path.join(RAW_DIR, 'ne_10m_geography_marine_polys.geojson'), 'utf-8'),
  );
  const reclassifiedSeas = rawMarineForLakes.features.filter(
    (f: { properties: { name?: string } }) => SEAS_LISTED_AS_LAKES.has(String(f.properties.name)),
  );
  for (const raw of [...rawLakes.features, ...reclassifiedSeas]) {
    const name = raw.properties.name || raw.properties.name_en;
    if (!name) continue;
    if (isReservoir(raw.properties)) continue;

    const areaKm2 = Math.round(geoArea(raw) * EARTH_RADIUS_KM * EARTH_RADIUS_KM);
    const [labelLng, labelLat] = computeLabelPoint(raw.geometry);
    const namePl = raw.properties.name_pl || raw.properties.name;
    const id = makeUniqueId(`lake-${slugify(name)}`, usedLakeIds);

    lakeFeatures.push({
      type: 'Feature',
      id,
      properties: {
        id,
        kind: 'lake',
        layerId: 'physical-lakes',
        name_pl: namePl,
        name_en: lakeEnglishName(raw.properties),
        aliases: [raw.properties.name_alt, raw.properties.name_abb].filter(Boolean),
        rank: {
          area: areaKm2,
        },
        labelLng,
        labelLat,
      },
      geometry: {
        type: raw.geometry.type,
        coordinates: roundCoords(raw.geometry.coordinates),
      },
    });
  }

  lakeFeatures = mergeNearbyNamesakes(lakeFeatures, 2);
  lakeFeatures.sort((a, b) => (b.properties.rank.area || 0) - (a.properties.rank.area || 0));
  lakeFeatures.forEach((f, idx) => {
    f.properties.rank.order = idx + 1;
  });

  const lakesCol: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: lakeFeatures,
  };
  GeoFeatureCollectionSchema.parse(lakesCol);
  const lakesFile = path.join(OUT_DIR, 'lakes.json');
  fs.writeFileSync(lakesFile, JSON.stringify(lakesCol));
  console.log(`    ✓ Saved ${lakesCol.features.length} lakes to lakes.json`);

  // 4. Mountain Ranges & Deserts (Regions)
  console.log('  → Processing mountain ranges & deserts...');
  const rawRegions = JSON.parse(
    fs.readFileSync(path.join(RAW_DIR, 'ne_10m_geography_regions_polys.geojson'), 'utf-8'),
  );
  const rawPeaks = JSON.parse(
    fs.readFileSync(
      path.join(RAW_DIR, 'ne_10m_geography_regions_elevation_points.geojson'),
      'utf-8',
    ),
  );

  const regionFeatures: GeoFeature[] = [];
  let mountainFeatures: GeoFeature[] = [];
  let desertFeatures: GeoFeature[] = [];
  const usedRegionIds = new Set<string>();

  for (const raw of rawRegions.features) {
    const fclass = raw.properties.FEATURECLA;
    const name = raw.properties.NAME;
    if (!name) continue;

    const isMountain = fclass === 'Range/mtn';
    const isDesert = fclass === 'Desert';
    if (!isMountain && !isDesert) continue;

    const [labelLng, labelLat] = computeLabelPoint(raw.geometry);
    const areaKm2 = Math.round(geoArea(raw) * EARTH_RADIUS_KM * EARTH_RADIUS_KM);
    const namePl = titleCasePolish(overrides.regions[name] || raw.properties.NAME_PL || name);
    const nameEn = raw.properties.NAME_EN || name;
    const id = makeUniqueId(
      `${isMountain ? 'mountain' : 'desert'}-${slugify(name)}`,
      usedRegionIds,
    );

    const feat: GeoFeature = {
      type: 'Feature',
      id,
      properties: {
        id,
        kind: isMountain ? 'mountain' : 'desert',
        layerId: isMountain ? 'physical-mountains' : 'physical-deserts',
        name_pl: namePl,
        name_en: nameEn,
        aliases: [raw.properties.NAMEALT].filter(Boolean),
        rank: isMountain
          ? {
              elevation: maxElevationInRange(raw.geometry, rawPeaks.features, nameEn),
              area: areaKm2,
            }
          : {
              area: areaKm2,
            },
        labelLng,
        labelLat,
      },
      geometry: {
        type: raw.geometry.type,
        coordinates: roundCoords(raw.geometry.coordinates),
      },
    };

    if (isMountain) {
      mountainFeatures.push(feat);
    } else {
      desertFeatures.push(feat);
    }
  }

  mountainFeatures = mergeNearbyNamesakes(mountainFeatures, 12);
  desertFeatures = mergeNearbyNamesakes(desertFeatures, 4);
  mountainFeatures.sort((a, b) => compareRanges(a.properties.rank, b.properties.rank));
  mountainFeatures.forEach((f, idx) => {
    f.properties.rank.order = idx + 1;
  });

  desertFeatures.sort((a, b) => (b.properties.rank.area || 0) - (a.properties.rank.area || 0));
  desertFeatures.forEach((f, idx) => {
    f.properties.rank.order = idx + 1;
  });

  regionFeatures.push(...mountainFeatures, ...desertFeatures);

  const regionsCol: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: regionFeatures,
  };
  GeoFeatureCollectionSchema.parse(regionsCol);
  const regionsFile = path.join(OUT_DIR, 'regions.json');
  fs.writeFileSync(regionsFile, JSON.stringify(regionsCol));
  console.log(
    `    ✓ Saved ${regionsCol.features.length} regions (${mountainFeatures.length} mountains, ${desertFeatures.length} deserts) to regions.json`,
  );

  // 4b. Landforms (Plateaus, Plains, Basins, Deltas, Peninsulas)
  console.log('  → Processing landforms (plateaus, plains, basins, deltas, peninsulas)...');
  const landformClasses: Record<string, LandformType> = {
    Plateau: 'plateau',
    Plain: 'plain',
    Lowland: 'plain',
    Basin: 'basin',
    Depression: 'basin',
    Delta: 'delta',
    'Pen/cape': 'peninsula',
    Peninsula: 'peninsula',
  };

  let landformFeatures: GeoFeature[] = [];
  const usedLandformIds = new Set<string>();

  for (const raw of rawRegions.features) {
    const fclass = String(raw.properties.FEATURECLA || '');
    const subkind = landformClasses[fclass];
    if (!subkind) continue;

    const name = raw.properties.NAME;
    if (!name) continue;

    const [labelLng, labelLat] = computeLabelPoint(raw.geometry);
    const areaKm2 = Math.round(geoArea(raw) * EARTH_RADIUS_KM * EARTH_RADIUS_KM);
    const rawPl = overrides.regions[name] || raw.properties.NAME_PL || name;
    const namePl = titleCasePolish(rawPl);
    const nameEn = raw.properties.NAME_EN || name;
    const id = makeUniqueId(`landform-${subkind}-${slugify(name)}`, usedLandformIds);

    landformFeatures.push({
      type: 'Feature',
      id,
      properties: {
        id,
        kind: 'landform',
        layerId: 'landforms',
        name_pl: namePl,
        name_en: nameEn,
        aliases: [raw.properties.NAMEALT, raw.properties.NAME_ALT].filter(Boolean),
        landformType: subkind,
        rank: {
          area: areaKm2,
        },
        labelLng,
        labelLat,
      },
      geometry: {
        type: raw.geometry.type,
        coordinates: roundCoords(raw.geometry.coordinates),
      },
    });
  }

  // Wider radius: landforms are large and Natural Earth splits e.g. the Brazilian Highlands.
  landformFeatures = mergeNearbyNamesakes(landformFeatures, 10);
  landformFeatures.sort((a, b) => (b.properties.rank.area || 0) - (a.properties.rank.area || 0));
  landformFeatures.forEach((f, idx) => {
    f.properties.rank.order = idx + 1;
  });

  const landformsCol: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: landformFeatures,
  };
  GeoFeatureCollectionSchema.parse(landformsCol);
  const landformsFile = path.join(OUT_DIR, 'landforms.json');
  fs.writeFileSync(landformsFile, JSON.stringify(landformsCol));
  console.log(`    ✓ Saved ${landformsCol.features.length} landforms to landforms.json`);

  // 4c. Marine (Seas, Gulfs, Bays, Straits, Channels)
  console.log('  → Processing marine bodies (seas, gulfs, bays, straits, channels)...');
  const rawMarine = JSON.parse(
    fs.readFileSync(path.join(RAW_DIR, 'ne_10m_geography_marine_polys.geojson'), 'utf-8'),
  );

  const marineClasses: Record<string, MarineType> = {
    sea: 'sea',
    gulf: 'gulf',
    bay: 'bay',
    strait: 'strait',
    channel: 'channel',
    sound: 'sound',
    fjord: 'fjord',
  };

  const marineFeatures: GeoFeature[] = [];
  const usedMarineIds = new Set<string>();

  for (const raw of rawMarine.features) {
    const fclass = String(raw.properties.featurecla || '');
    const subkind = marineClasses[fclass];
    if (!subkind) continue;
    if (SEAS_LISTED_AS_LAKES.has(String(raw.properties.name))) continue;

    const name = raw.properties.name || raw.properties.name_en;
    if (!name) continue;

    const [labelLng, labelLat] = computeLabelPoint(raw.geometry);
    const areaKm2 = Math.round(geoArea(raw) * EARTH_RADIUS_KM * EARTH_RADIUS_KM);
    const rawPl = raw.properties.name_pl || raw.properties.name;
    const namePl = titleCasePolish(rawPl);
    const nameEn = raw.properties.name_en || name;
    const id = makeUniqueId(`marine-${subkind}-${slugify(name)}`, usedMarineIds);

    marineFeatures.push({
      type: 'Feature',
      id,
      properties: {
        id,
        kind: 'marine',
        layerId: 'marine',
        name_pl: namePl,
        name_en: nameEn,
        aliases: [raw.properties.namealt, raw.properties.name_abb].filter(Boolean),
        marineType: subkind,
        rank: {
          area: areaKm2,
        },
        labelLng,
        labelLat,
      },
      geometry: {
        type: raw.geometry.type,
        coordinates: roundCoords(raw.geometry.coordinates),
      },
    });
  }

  // Sort by area descending and select Top 120
  marineFeatures.sort((a, b) => (b.properties.rank.area || 0) - (a.properties.rank.area || 0));
  const topMarineFeatures = marineFeatures.slice(0, 120);
  topMarineFeatures.forEach((f, idx) => {
    f.properties.rank.order = idx + 1;
  });

  const marineCol: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: topMarineFeatures,
  };
  GeoFeatureCollectionSchema.parse(marineCol);
  const marineFile = path.join(OUT_DIR, 'marine.json');
  fs.writeFileSync(marineFile, JSON.stringify(marineCol));
  console.log(`    ✓ Saved ${marineCol.features.length} marine bodies to marine.json`);

  // 5. Places (Capitals, Megacities, and High Peaks)
  console.log('  → Processing places (capitals, megacities, and peaks)...');
  const rawPlaces = JSON.parse(
    fs.readFileSync(path.join(RAW_DIR, 'ne_10m_populated_places_simple.geojson'), 'utf-8'),
  );

  const placeFeatures: GeoFeature[] = [];
  const usedPlaceIds = new Set<string>();

  // Capitals & Megacities
  for (const raw of rawPlaces.features) {
    const isCapital = raw.properties.adm0cap === 1;
    const isMegacity = raw.properties.megacity === 1;
    const pop = Number(raw.properties.pop_max) || 0;

    if (!isCapital && !isMegacity && pop < 2_500_000) continue;

    const name = raw.properties.name || raw.properties.nameascii;
    if (!name) continue;

    const kind = isCapital ? 'capital' : 'megacity';
    const namePl = overrides.places[name] || name;
    const [lng, lat] = raw.geometry.coordinates;
    const id = makeUniqueId(`${kind}-${slugify(name)}`, usedPlaceIds);

    placeFeatures.push({
      type: 'Feature',
      id,
      properties: {
        id,
        kind,
        layerId: isCapital ? 'political-capitals' : 'political-megacities',
        name_pl: namePl,
        name_en: name,
        aliases: [raw.properties.namealt, raw.properties.namepar].filter(Boolean),
        rank: {
          population: pop,
        },
        labelLng: roundCoord(lng),
        labelLat: roundCoord(lat),
        countryCode: raw.properties.iso_a2,
        countryName: raw.properties.adm0name,
      },
      geometry: {
        type: 'Point',
        coordinates: [roundCoord(lng), roundCoord(lat)],
      },
    });
  }

  // Major Peaks
  for (const raw of rawPeaks.features) {
    const elev = Number(raw.properties.elevation) || 0;
    const name = raw.properties.name;
    if (!name || elev < 3000) continue;

    const namePl = overrides.peaks[name] || name;
    const [lng, lat] = raw.geometry.coordinates;
    const id = makeUniqueId(`peak-${slugify(name)}`, usedPlaceIds);

    placeFeatures.push({
      type: 'Feature',
      id,
      properties: {
        id,
        kind: 'peak',
        layerId: 'physical-peaks',
        name_pl: namePl,
        name_en: name,
        aliases: [raw.properties.name_alt].filter(Boolean),
        rank: {
          elevation: elev,
        },
        labelLng: roundCoord(lng),
        labelLat: roundCoord(lat),
      },
      geometry: {
        type: 'Point',
        coordinates: [roundCoord(lng), roundCoord(lat)],
      },
    });
  }

  const placesCol: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: placeFeatures,
  };
  GeoFeatureCollectionSchema.parse(placesCol);
  const placesFile = path.join(OUT_DIR, 'places.json');
  fs.writeFileSync(placesFile, JSON.stringify(placesCol));
  console.log(`    ✓ Saved ${placesCol.features.length} places to places.json`);

  // 6. Attribution
  console.log('  → Writing attribution...');
  writeAttribution();

  // 7. Budget summary
  console.log('\n📊 File size budget verification:');
  const filesToCheck = [
    { name: 'countries.json', budgetGzipKb: 150, path: countriesFile },
    { name: 'rivers.json', budgetGzipKb: 250, path: riversFile },
    { name: 'lakes.json', budgetGzipKb: 150, path: lakesFile },
    { name: 'regions.json', budgetGzipKb: 250, path: regionsFile },
    { name: 'landforms.json', budgetGzipKb: 200, path: landformsFile },
    { name: 'marine.json', budgetGzipKb: 250, path: marineFile },
    { name: 'places.json', budgetGzipKb: 80, path: placesFile },
  ];

  let anyExceeded = false;
  for (const item of filesToCheck) {
    const sizes = measureFileSizes(item.path);
    const pass = sizes.gzipKb <= item.budgetGzipKb;
    if (!pass) anyExceeded = true;
    console.log(
      `  ${pass ? '✅' : '❌'} ${item.name.padEnd(16)}: ${String(sizes.rawKb).padStart(6)} KB raw | ${String(sizes.gzipKb).padStart(5)} KB gzip (budget: ${item.budgetGzipKb} KB)`,
    );
  }

  if (anyExceeded) {
    console.warn('⚠️ Warning: Some datasets exceeded their gzip budget.');
  } else {
    console.log('🎉 All datasets strictly meet their weight budgets!');
  }
}

if (process.argv[1]?.endsWith('build.ts')) {
  buildData().catch(err => {
    console.error('❌ Data build failed:', err);
    process.exit(1);
  });
}
