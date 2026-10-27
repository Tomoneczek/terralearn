import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { cellArea, cellToParent, latLngToCell } from 'h3-js';
import {
  POPULATION_RESOLUTION,
  aggregateDensity,
  roundDensity,
  type PopulationGrid,
} from '../../scripts/data/population';

describe('population grid pipeline', () => {
  it('sums child cells into their resolution-3 parent and converts to people per km²', () => {
    const a = latLngToCell(52.23, 21.01, 4);
    const parent = cellToParent(a, 3);
    const b = latLngToCell(30.04, 31.24, 4);
    const cells = aggregateDensity([
      { h3: a, population: 1_000_000 },
      { h3: a, population: 500_000 },
      { h3: b, population: 2_000_000 },
    ]);

    const byId = new Map(cells);
    expect(byId.get(parent)).toBe(roundDensity(1_500_000 / cellArea(parent, 'km2')));
    expect(cells).toHaveLength(2);
    expect(cells.map(([h3]) => h3)).toEqual([...cells.map(([h3]) => h3)].sort());
  });

  it('drops empty cells and invalid counts', () => {
    const h3 = latLngToCell(23, 13, 4);
    expect(
      aggregateDensity([
        { h3, population: 0 },
        { h3, population: Number.NaN },
      ]),
    ).toEqual([]);
  });

  it('keeps one decimal for sparse cells and whole numbers for dense ones', () => {
    expect(roundDensity(0.234)).toBe(0.2);
    expect(roundDensity(9.96)).toBe(10);
    expect(roundDensity(1234.6)).toBe(1235);
  });

  describe('shipped population.json', () => {
    const grid = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'public/data/population.json'), 'utf-8'),
    ) as PopulationGrid;
    const densityAt = (lat: number, lng: number) =>
      new Map(grid.cells).get(latLngToCell(lat, lng, grid.resolution));

    it('uses the documented resolution and source', () => {
      expect(grid.resolution).toBe(POPULATION_RESOLUTION);
      expect(grid.source).toContain('Kontur');
      expect(grid.cells.length).toBeGreaterThan(5000);
    });

    it('shows dense river valleys and empty deserts', () => {
      expect(densityAt(23.8, 90.4)).toBeGreaterThan(1000); // Dhaka
      expect(densityAt(30.04, 31.24)).toBeGreaterThan(1000); // Cairo, Nile valley
      expect(densityAt(23, 13) ?? 0).toBeLessThan(1); // central Sahara
    });
  });
});
