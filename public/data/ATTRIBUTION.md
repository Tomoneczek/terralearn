# Data Attribution & Licenses

All geographical datasets and planetary textures in **TerraLearn** are derived strictly from public domain and open data sources with no commercial licensing restrictions or tracking.

---

## 1. Natural Earth
- **Source:** [Natural Earth Vector](https://www.naturalearthdata.com/)
- **Authors:** Nathaniel Vaughn Kelso, Tom Patterson, and numerous cartographic contributors.
- **License:** **Public Domain**. All versions of Natural Earth's raster + vector map data are in the public domain. You may use the maps in any manner, including modifying the content and designs, in both non-commercial and commercial projects.
- **Datasets used:**
  - `ne_110m_admin_0_countries` – World national borders, landmasses, and sovereign states.
  - `ne_50m_rivers_lake_centerlines` – Major global river centerlines.
  - `ne_50m_lakes` – Major global lakes and reservoirs.
  - `ne_10m_populated_places_simple` – National capitals and major megacities.
  - `ne_10m_geography_regions_polys` – Mountain ranges and major desert regions.
  - `ne_10m_geography_regions_elevation_points` – High peaks and prominence summits.

---

## 2. NASA Visible Earth & Earth Observatory
- **Source:** [NASA Visible Earth](https://visibleearth.nasa.gov/)
- **Authors:** Reto Stöckli, Robert Simmon, NASA Goddard Space Flight Center.
- **License:** **Public Domain** (NASA Open Data Policy). Free for commercial and non-commercial educational use.
- **Assets used:**
  - *Blue Marble: Next Generation* – Daytime equirectangular planetary albedo map (`earth-day.jpg`).
  - *Black Marble: Night Lights* – Global nighttime city lights emission map (`earth-night.jpg`).

---

## 3. Komisja Standaryzacji Nazw Geograficznych (KSNG)
- **Source:** [Komisja Standaryzacji Nazw Geograficznych poza Granicami Rzeczypospolitej Polskiej](https://www.gov.pl/web/ksng)
- **Authority:** Główny Urząd Geodezji i Kartografii (GUGiK).
- **Scope:** Official Polish exonyms, standardizations, and geographic terminology used for Polish language localization (`name_pl` properties).
- **License:** Open Public Sector Information / Public Domain.

---

## Processing pipeline
All vector datasets are processed, topology-preserved, and coordinate-optimized via `scripts/data/build.ts` to ensure low network payload (< 150-250 KB gzip per layer). The ocean water mask (`water-mask.png`) is rasterized directly from Natural Earth land polygons using pure scanline rasterization in Node.js.
