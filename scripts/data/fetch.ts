import fs from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.cwd(), '.cache/data/raw');

export const DATASETS = [
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
] as const;

export async function fetchDatasets(force = false): Promise<void> {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  console.log(`📦 Fetching Natural Earth datasets into ${CACHE_DIR}...`);

  for (const ds of DATASETS) {
    const dest = path.join(CACHE_DIR, ds.filename);
    if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(
        `  ✓ ${ds.id} (${ds.filename}) already cached (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`,
      );
      continue;
    }

    console.log(`  ↓ Downloading ${ds.id} from ${ds.url}...`);
    const res = await fetch(ds.url);
    if (!res.ok) {
      throw new Error(`Failed to download ${ds.url}: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    fs.writeFileSync(dest, text, 'utf-8');
    console.log(`  ✓ Saved ${ds.id} (${(text.length / 1024).toFixed(1)} KB)`);
  }

  console.log('✅ All datasets cached successfully.');
}

if (process.argv[1]?.endsWith('fetch.ts')) {
  fetchDatasets(process.argv.includes('--force')).catch(err => {
    console.error('❌ Data fetch failed:', err);
    process.exit(1);
  });
}
