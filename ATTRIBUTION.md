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
  - `ne_10m_geography_marine_polys` – Global seas, gulfs, and ocean bays.
  - _Cross-Blended Hypsometric Tints_ – Natural Earth climate-modulated elevation relief map (`earth-atlas.jpg`), created by Tom Patterson and Bernhard Jenny.

---

## 2. NASA Visible Earth & Earth Observatory

- **Source:** [NASA Visible Earth](https://visibleearth.nasa.gov/)
- **Authors:** Reto Stöckli, Robert Simmon, NASA Goddard Space Flight Center.
- **License:** **Public Domain** (NASA Open Data Policy). Free for commercial and non-commercial educational use.
- **Assets used:**
  - _Blue Marble: Next Generation_ – Daytime equirectangular planetary albedo map (`earth-day.jpg`).
  - _Black Marble: Night Lights_ – Global nighttime city lights emission map (`earth-night.jpg`).
- **Moon texture:** [NASA Scientific Visualization Studio – CGI Moon Kit](https://svs.gsfc.nasa.gov/4720)
  (Ernie Wright, NASA GSFC; colour mosaic from the Lunar Reconnaissance Orbiter Camera), **Public Domain**.
  - 1024×512 equirectangular lunar colour map (`moon.jpg`).

---

## 3. Komisja Standaryzacji Nazw Geograficznych (KSNG)

- **Source:** [Komisja Standaryzacji Nazw Geograficznych poza Granicami Rzeczypospolitej Polskiej](https://www.gov.pl/web/ksng)
- **Authority:** Główny Urząd Geodezji i Kartografii (GUGiK).
- **Scope:** Official Polish exonyms, standardizations, and geographic terminology used for Polish language localization (`name_pl` properties).
- **License:** Open Public Sector Information / Public Domain.

---

## 4. Kontur Population

- **Source:** [Kontur Population: Global Population Density for 22km H3 Hexagons](https://data.humdata.org/dataset/kontur-population-dataset-22km) (release 2023-11-01)
- **Authors:** Kontur Inc. – fusion of GHSL, Facebook HRSL, Microsoft Buildings, Copernicus Global Land Service Land Cover, Land Information New Zealand and OpenStreetMap data.
- **License:** **Creative Commons Attribution 4.0 International (CC BY 4.0)**.
- **Use:** population counts aggregated to H3 resolution 3 and converted to people per km² for the population density layer (`population.json`).

---

## 5. Wikidata

- **Source:** [Wikidata](https://www.wikidata.org/) – structured data queried once at build time through the Wikidata Query Service (see `scripts/data/wikidata/*.rq`); nothing is requested from Wikidata at runtime.
- **License:** **Creative Commons CC0 1.0 (public domain dedication)** for the structured data.
- **Use:** additional peaks (height, prominence, location), rivers (length, location, countries) and Polish names (`name_pl`) for objects that Natural Earth does not name in Polish.

---

## 5. Wikidata

- **Source:** [Wikidata](https://www.wikidata.org/) – structured data queried once at build time through the Wikidata Query Service (see `scripts/data/wikidata/*.rq`); nothing is requested from Wikidata at runtime.
- **License:** **Creative Commons CC0 1.0 (public domain dedication)** for the structured data.
- **Use:** additional peaks (height, prominence, location), rivers (length, location, countries) and Polish names (`name_pl`) for objects that Natural Earth does not name in Polish.

---

## 6. GeoNames

- **Source:** [GeoNames](https://www.geonames.org/) – `cities15000` (places with more than 15 000 inhabitants), downloaded once at build time; nothing is requested from GeoNames at runtime.
- **License:** **Creative Commons Attribution 4.0 International (CC BY 4.0)**.
- **Use:** names, locations and city populations for the three biggest cities of every country ("Cities by country" ranking).

---

## Processing pipeline

All vector datasets are processed, topology-preserved, and coordinate-optimized via `scripts/data/build.ts` to ensure low network payload (< 150-250 KB gzip per layer). The ocean water mask (`water-mask.png`) is rasterized directly from Natural Earth land polygons using pure scanline rasterization in Node.js.
