import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { cellArea, cellToParent, getResolution } from 'h3-js';

/** H3 resolution of the shipped grid (~12 400 km² cells): coarse enough for one draw call. */
export const POPULATION_RESOLUTION = 3;

export interface PopulationCellInput {
  h3: string;
  population: number;
}

export interface PopulationGrid {
  resolution: number;
  /** Source and year, shown in the attribution. */
  source: string;
  /** [H3 index, people per km²], sorted by index for stable diffs. */
  cells: [string, number][];
}

/** Keeps two significant digits below 10 people/km² and whole numbers above. */
export function roundDensity(density: number): number {
  return density < 10 ? Math.round(density * 10) / 10 : Math.round(density);
}

/**
 * Sums fine-resolution population counts into parent cells and converts them to density.
 * Empty cells (no people) are dropped: they are the background of the layer.
 */
export function aggregateDensity(
  cells: Iterable<PopulationCellInput>,
  resolution = POPULATION_RESOLUTION,
): [string, number][] {
  const totals = new Map<string, number>();
  for (const { h3, population } of cells) {
    if (!(population > 0)) continue;
    const parent = getResolution(h3) > resolution ? cellToParent(h3, resolution) : h3;
    totals.set(parent, (totals.get(parent) ?? 0) + population);
  }
  return [...totals]
    .map(([h3, people]): [string, number] => [h3, roundDensity(people / cellArea(h3, 'km2'))])
    .filter(([, density]) => density > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Reads the Kontur Population GeoPackage (gzipped) and returns the aggregated grid. */
export function buildPopulationGrid(gzPath: string, workDir: string): PopulationGrid {
  const gpkgPath = path.join(workDir, path.basename(gzPath, '.gz'));
  if (!fs.existsSync(gpkgPath)) {
    fs.writeFileSync(gpkgPath, zlib.gunzipSync(fs.readFileSync(gzPath)));
  }
  // Loaded lazily: the pure helpers above are also used by tests, where Vite cannot bundle it.
  const { DatabaseSync } = createRequire(import.meta.url)(
    'node:sqlite',
  ) as typeof import('node:sqlite');
  const db = new DatabaseSync(gpkgPath, { readOnly: true });
  try {
    const rows = db
      .prepare('SELECT h3, population FROM population')
      .all() as unknown as PopulationCellInput[];
    return {
      resolution: POPULATION_RESOLUTION,
      source: 'Kontur Population 2023-11-01 (CC BY 4.0)',
      cells: aggregateDensity(rows),
    };
  } finally {
    db.close();
  }
}
