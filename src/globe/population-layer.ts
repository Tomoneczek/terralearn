import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { cellToBoundary, cellToLatLng, latLngToCell } from 'h3-js';
import type { Store, AppState, FeatureRef } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';
import { latLngToVector } from './highlight-overlay';
import type { HoverArbiter } from './hover-arbiter';
import { DENSITY_COLORS, DENSITY_OPACITY, densityClass } from './population-scale';

/** three-globe's globe radius in scene units. */
const GLOBE_RADIUS = 100;
/** Just above the surface and below every other layer (marine 0.003, borders 0.004). */
export const POPULATION_ALTITUDE = 0.0025;

export const POPULATION_LAYER_ID = 'populationDensity';

export interface PopulationGridData {
  resolution: number;
  source: string;
  cells: [string, number][];
}

export interface PopulationLayerOptions {
  scene: { add(o: Object3D): void; remove(o: Object3D): void } | null;
  store: Store<AppState>;
  arbiter: HoverArbiter;
  container: HTMLElement;
  /** globe.gl `toGlobeCoords`: container pixels → lat/lng, or null outside the globe. */
  toGlobeCoords: (x: number, y: number) => { lat: number; lng: number } | null;
  /** Injectable for tests. */
  loadData?: () => Promise<PopulationGridData>;
}

async function fetchPopulationGrid(): Promise<PopulationGridData> {
  const res = await fetch(resolveAssetUrl('/data/population.json'));
  if (!res.ok) throw new Error(`population.json: HTTP ${res.status}`);
  return (await res.json()) as PopulationGridData;
}

/**
 * All cells as one triangle mesh (a fan of triangles per hexagon) with per-vertex RGBA colours,
 * so the whole layer is a single draw call. Vertices are placed directly in 3D, which makes
 * cells crossing the antimeridian and H3 pentagons work without special cases.
 */
export function buildPopulationGeometry(
  cells: readonly [string, number][],
  radius = GLOBE_RADIUS * (1 + POPULATION_ALTITUDE),
): BufferGeometry {
  const boundaries = cells.map(([h3]) => cellToBoundary(h3));
  const vertexCount = boundaries.reduce((sum, b) => sum + b.length + 1, 0);
  const triangleCount = boundaries.reduce((sum, b) => sum + b.length, 0);

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const indices = new Uint32Array(triangleCount * 3);
  const v = new Vector3();
  const color = new Color();

  let vertex = 0;
  let index = 0;
  cells.forEach(([h3, density], i) => {
    const boundary = boundaries[i]!;
    const cls = densityClass(density);
    color.set(DENSITY_COLORS[cls]!);
    const alpha = DENSITY_OPACITY[cls]!;

    const center = vertex;
    const writeVertex = (lat: number, lng: number) => {
      latLngToVector(lat, lng, radius, v).toArray(positions, vertex * 3);
      colors.set([color.r, color.g, color.b, alpha], vertex * 4);
      vertex++;
    };
    const [clat, clng] = cellToLatLng(h3);
    writeVertex(clat, clng);
    for (const [lat, lng] of boundary) writeVertex(lat, lng);

    for (let k = 0; k < boundary.length; k++) {
      indices.set([center, center + 1 + k, center + 1 + ((k + 1) % boundary.length)], index);
      index += 3;
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 4));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/** Hover reference for a cell: the tooltip formats `value` in the current language. */
export function populationHoverRef(h3: string, density: number): FeatureRef {
  return {
    id: `population-${h3}`,
    layerId: POPULATION_LAYER_ID,
    kind: POPULATION_LAYER_ID,
    value: density,
  };
}

/**
 * Population density layer: lazily loads the H3 grid the first time it is enabled, draws it as
 * one mesh and reports the density under the pointer to the hover arbiter (lowest priority,
 * so countries, rivers and capitals keep their tooltips).
 */
export class PopulationLayer {
  private readonly options: PopulationLayerOptions;
  private mesh: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
  private cells = new Map<string, number>();
  private resolution = 3;
  private loading: Promise<void> | null = null;
  private enabled = false;
  private pendingPointer: { x: number; y: number } | null = null;
  private frame = 0;
  private readonly unsubscribe: () => void;

  constructor(options: PopulationLayerOptions) {
    this.options = options;
    this.unsubscribe = options.store.subscribe(
      s => s.layers[POPULATION_LAYER_ID]?.enabled ?? false,
      enabled => this.setEnabled(enabled),
    );
    options.container.addEventListener('pointermove', this.onPointerMove);
    options.container.addEventListener('pointerleave', this.onPointerLeave);
    this.setEnabled(options.store.get().layers[POPULATION_LAYER_ID]?.enabled ?? false);
  }

  public isLoaded(): boolean {
    return this.mesh !== null;
  }

  /** Resolves when the grid is loaded (or immediately when the layer was never enabled). */
  public whenReady(): Promise<void> {
    return this.loading ?? Promise.resolve();
  }

  public getMesh(): Mesh | null {
    return this.mesh;
  }

  /** Density of the cell containing a point, or undefined over empty land and oceans. */
  public densityAt(lat: number, lng: number): { h3: string; density: number } | undefined {
    const h3 = latLngToCell(lat, lng, this.resolution);
    const density = this.cells.get(h3);
    return density === undefined ? undefined : { h3, density };
  }

  private setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.mesh) this.mesh.visible = enabled;
    if (!enabled) {
      this.options.arbiter.setPopulationHover(null);
      return;
    }
    if (!this.loading) this.loading = this.load();
  }

  private async load(): Promise<void> {
    try {
      const data = await (this.options.loadData ?? fetchPopulationGrid)();
      this.resolution = data.resolution;
      this.cells = new Map(data.cells);
      const material = new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      });
      this.mesh = new Mesh(buildPopulationGeometry(data.cells), material);
      this.mesh.name = 'population-density';
      // Hover uses an H3 lookup of the point under the pointer, not raycasting the mesh.
      this.mesh.raycast = () => {};
      this.mesh.visible = this.enabled;
      this.options.scene?.add(this.mesh);
    } catch (err) {
      console.warn('[PopulationLayer] Could not load population grid:', err);
      this.loading = null;
    }
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    // Dragging rotates the globe: no hover updates until the button is released.
    if (!this.enabled || !this.mesh || e.buttons !== 0) return;
    const rect = this.options.container.getBoundingClientRect();
    this.pendingPointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.pendingPointer) this.updateHover(this.pendingPointer.x, this.pendingPointer.y);
    });
  };

  private readonly onPointerLeave = (): void => {
    this.options.arbiter.setPopulationHover(null);
  };

  /** Exposed for tests: resolves the cell under container pixel (x, y). */
  public updateHover(x: number, y: number): void {
    const coords = this.options.toGlobeCoords(x, y);
    const hit = coords ? this.densityAt(coords.lat, coords.lng) : undefined;
    this.options.arbiter.setPopulationHover(hit ? populationHoverRef(hit.h3, hit.density) : null);
  }

  public destroy(): void {
    this.unsubscribe();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.options.container.removeEventListener('pointermove', this.onPointerMove);
    this.options.container.removeEventListener('pointerleave', this.onPointerLeave);
    if (this.mesh) {
      this.options.scene?.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
  }
}
