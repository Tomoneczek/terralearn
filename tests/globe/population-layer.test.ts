import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Scene } from 'three';
import { latLngToCell } from 'h3-js';
import { createStore, createInitialState } from '@/state/store';
import type { AppState, Store } from '@/state/types';
import { HoverArbiter } from '@/globe/hover-arbiter';
import {
  PopulationLayer,
  buildPopulationGeometry,
  type PopulationGridData,
} from '@/globe/population-layer';
import {
  DENSITY_BREAKS,
  DENSITY_COLORS,
  densityClass,
  densityClassLabel,
} from '@/globe/population-scale';

const warsaw = latLngToCell(52.23, 21.01, 3);
const cairo = latLngToCell(30.04, 31.24, 3);
const grid: PopulationGridData = {
  resolution: 3,
  source: 'test',
  cells: [
    [warsaw, 227],
    [cairo, 2124],
  ],
};

describe('population scale', () => {
  it('maps densities to 7 classes at the documented breaks', () => {
    expect(DENSITY_COLORS).toHaveLength(DENSITY_BREAKS.length + 1);
    expect(densityClass(0.5)).toBe(0);
    expect(densityClass(1)).toBe(1);
    expect(densityClass(99)).toBe(3);
    expect(densityClass(100)).toBe(4);
    expect(densityClass(5000)).toBe(6);
    expect(densityClass(Number.NaN)).toBe(0);
    expect(densityClass(-3)).toBe(0);
  });

  it('labels classes for the legend', () => {
    expect(densityClassLabel(0)).toBe('< 1');
    expect(densityClassLabel(3)).toBe('50–100');
    expect(densityClassLabel(6)).toBe('> 1000');
  });
});

describe('buildPopulationGeometry', () => {
  it('builds one triangle fan per hexagon with RGBA vertex colours', () => {
    const geometry = buildPopulationGeometry(grid.cells);
    // Hexagon: centre + 6 boundary vertices, 6 triangles.
    expect(geometry.getAttribute('position').count).toBe(14);
    expect(geometry.getIndex()!.count).toBe(36);
    const color = geometry.getAttribute('color');
    expect(color.itemSize).toBe(4);
    // The dense Cairo cell is more opaque than the Warsaw cell.
    expect(color.getW(7)).toBeGreaterThan(color.getW(0));
  });

  it('places vertices just above the globe surface', () => {
    const geometry = buildPopulationGeometry(grid.cells);
    const p = geometry.getAttribute('position');
    const r = Math.hypot(p.getX(0), p.getY(0), p.getZ(0));
    expect(r).toBeCloseTo(100.25, 1);
  });
});

describe('PopulationLayer', () => {
  let store: Store<AppState>;
  let container: HTMLElement;
  let scene: Scene;
  let arbiter: HoverArbiter;
  let loadData: ReturnType<typeof vi.fn>;
  let coords: { lat: number; lng: number } | null;

  const create = () =>
    new PopulationLayer({
      scene,
      store,
      arbiter,
      container,
      toGlobeCoords: () => coords,
      loadData: loadData as unknown as () => Promise<PopulationGridData>,
    });

  const enable = (enabled: boolean) =>
    store.set({
      layers: { ...store.get().layers, populationDensity: { enabled } },
    });

  beforeEach(() => {
    store = createStore<AppState>(createInitialState());
    container = document.createElement('div');
    scene = new Scene();
    arbiter = new HoverArbiter(store, container);
    loadData = vi.fn(() => Promise.resolve(grid));
    coords = null;
  });

  it('is off by default and loads nothing until enabled', async () => {
    const layer = create();
    await layer.whenReady();
    expect(store.get().layers.populationDensity?.enabled).toBe(false);
    expect(loadData).not.toHaveBeenCalled();
    expect(layer.isLoaded()).toBe(false);
    layer.destroy();
  });

  it('loads lazily once, adds a single non-pickable mesh and toggles its visibility', async () => {
    const layer = create();
    enable(true);
    await layer.whenReady();
    enable(false);
    enable(true);
    await layer.whenReady();

    expect(loadData).toHaveBeenCalledTimes(1);
    const meshes = scene.children.filter(c => c.name === 'population-density');
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.visible).toBe(true);
    const hits: unknown[] = [];
    meshes[0]!.raycast({} as never, hits as never);
    expect(hits).toHaveLength(0);

    enable(false);
    expect(meshes[0]!.visible).toBe(false);

    layer.destroy();
    expect(scene.children).toHaveLength(0);
  });

  it('reports the density under the pointer and nothing over empty areas', async () => {
    const layer = create();
    enable(true);
    await layer.whenReady();

    coords = { lat: 30.04, lng: 31.24 };
    layer.updateHover(10, 10);
    expect(store.get().hovered).toMatchObject({ layerId: 'populationDensity', value: 2124 });

    coords = { lat: 0, lng: -30 }; // Atlantic
    layer.updateHover(10, 10);
    expect(store.get().hovered).toBeNull();

    coords = { lat: 52.23, lng: 21.01 };
    layer.updateHover(10, 10);
    enable(false);
    expect(store.get().hovered).toBeNull();

    layer.destroy();
  });

  it('survives a failed download and retries on the next enable', async () => {
    loadData.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = create();
    enable(true);
    await layer.whenReady();
    expect(layer.isLoaded()).toBe(false);

    enable(false);
    enable(true);
    await layer.whenReady();
    expect(layer.isLoaded()).toBe(true);
    warn.mockRestore();
    layer.destroy();
  });
});
