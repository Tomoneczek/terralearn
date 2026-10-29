import fs from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.cwd(), '.cache/data/raw');

interface Dataset {
  id: string;
  filename: string;
  url: string;
  /** Extra request headers (Wikidata asks API clients for a descriptive User-Agent). */
  headers?: Record<string, string>;
}

const WIKIDATA_HEADERS = {
  'User-Agent': 'TerraLearn/0.1 (non-commercial learning project; data build script)',
  Accept: 'application/sparql-results+json',
};

/** SPARQL query of `scripts/data/wikidata/<name>.rq` as a Wikidata Query Service URL. */
function wikidataUrl(name: string): string {
  const query = fs.readFileSync(
    path.resolve(process.cwd(), `scripts/data/wikidata/${name}.rq`),
    'utf-8',
  );
  return `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
}

export const DATASETS: readonly Dataset[] = [
  {
    id: 'countries',
    filename: 'ne_110m_admin_0_countries.geojson',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
  },
  {
    id: 'rivers',
    filename: 'ne_50m_rivers_lake_centerlines.geojson',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson',
  },
  {
    id: 'lakes',
    filename: 'ne_50m_lakes.geojson',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson',
  },
  {
    id: 'places',
    filename: 'ne_10m_populated_places_simple.geojson',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson',
  },
  {
    id: 'regions',
    filename: 'ne_10m_geography_regions_polys.geojson',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_regions_polys.geojson',
  },
  {
    id: 'peaks',
    filename: 'ne_10m_geography_regions_elevation_points.geojson',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_regions_elevation_points.geojson',
  },
  {
    id: 'marine',
    filename: 'ne_10m_geography_marine_polys.geojson',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_marine_polys.geojson',
  },
  {
    // Kontur Population (CC BY 4.0): population counts in H3 resolution-4 cells, GeoPackage.
    id: 'population',
    filename: 'kontur_population_20231101_r4.gpkg.gz',
    url: 'https://geodata-eu-central-1-kontur-public.s3.eu-central-1.amazonaws.com/kontur_datasets/kontur_population_20231101_r4.gpkg.gz',
  },
  // GeoNames (CC BY 4.0): populated places of 15 000+ people, population of the city proper.
  {
    id: 'geonames-cities15000',
    filename: 'geonames-cities15000.zip',
    url: 'https://download.geonames.org/export/dump/cities15000.zip',
  },
  // Wikidata (CC0): extra peaks, rivers and lakes with PL/EN names and normalised measurements.
  ...(['peaks', 'rivers', 'lakes'] as const).map(name => ({
    id: `wikidata-${name}`,
    filename: `wikidata-${name}.json`,
    url: wikidataUrl(name),
    headers: WIKIDATA_HEADERS,
  })),
];

export async function fetchDatasets(force = false): Promise<void> {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  console.log(`📦 Fetching datasets into ${CACHE_DIR}...`);

  for (const ds of DATASETS) {
    const dest = path.join(CACHE_DIR, ds.filename);
    if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(
        `  ✓ ${ds.id} (${ds.filename}) already cached (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`,
      );
      continue;
    }

    console.log(`  ↓ Downloading ${ds.id} from ${ds.url.slice(0, 80)}...`);
    const res = await fetch(ds.url, { headers: ds.headers });
    if (!res.ok) {
      throw new Error(`Failed to download ${ds.id}: ${res.status} ${res.statusText}`);
    }

    // Binary-safe: the population dataset is a gzipped GeoPackage.
    const bytes = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, bytes);
    console.log(`  ✓ Saved ${ds.id} (${(bytes.length / 1024).toFixed(1)} KB)`);
  }

  console.log('✅ All datasets cached successfully.');
}

if (process.argv[1]?.endsWith('fetch.ts')) {
  fetchDatasets(process.argv.includes('--force')).catch(err => {
    console.error('❌ Data fetch failed:', err);
    process.exit(1);
  });
}
