import fs from 'node:fs';
import path from 'node:path';

const ATTRIBUTION_PATH = path.resolve(process.cwd(), 'public/data/ATTRIBUTION.md');

export const ATTRIBUTION_CONTENT = `# Data Attribution & Licenses

All geographical datasets in **TerraLearn** are derived strictly from public domain and open data sources with no commercial licensing restrictions or tracking.

---

## 1. Natural Earth
- **Source:** [Natural Earth Vector](https://www.naturalearthdata.com/)
- **Authors:** Nathaniel Vaughn Kelso, Tom Patterson, and numerous cartographic contributors.
- **License:** **Public Domain**. All versions of Natural Earth's raster + vector map data are in the public domain. You may use the maps in any manner, including modifying the content and designs, in both non-commercial and commercial projects.
- **Datasets used:**
  - \`ne_110m_admin_0_countries\` – World national borders and sovereign states.
  - \`ne_50m_rivers_lake_centerlines\` – Major global river centerlines.
  - \`ne_50m_lakes\` – Major global lakes and reservoirs.
  - \`ne_10m_populated_places_simple\` – National capitals and major megacities.
  - \`ne_10m_geography_regions_polys\` – Mountain ranges and major desert regions.
  - \`ne_10m_geography_regions_elevation_points\` – High peaks and prominence summits.

---

## 2. Komisja Standaryzacji Nazw Geograficznych (KSNG)
- **Source:** [Komisja Standaryzacji Nazw Geograficznych poza Granicami Rzeczypospolitej Polskiej](https://www.gov.pl/web/ksng)
- **Authority:** Główny Urząd Geodezji i Kartografii (GUGiK).
- **Scope:** Official Polish exonyms, standardizations, and geographic terminology used for Polish language localization (\`name_pl\` properties).
- **License:** Open Public Sector Information / Public Domain.

---

## Processing pipeline
All datasets are processed, topology-preserved, and coordinate-optimized via \`scripts/data/build.ts\` to ensure low network payload (< 150-250 KB gzip per layer) and instant 60 FPS rendering in WebGL.
`;

export function writeAttribution(): void {
  const dir = path.dirname(ATTRIBUTION_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ATTRIBUTION_PATH, ATTRIBUTION_CONTENT, 'utf-8');
  console.log(`  ✓ Generated ${path.relative(process.cwd(), ATTRIBUTION_PATH)}`);
}
