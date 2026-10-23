import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3, type Scene } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import ConicPolygonGeometry from 'three-conic-polygon-geometry';
import type { Store, AppState } from '@/state/types';
import {
  LAYER_DEFINITIONS,
  getPathAltitude,
  getPolygonAltitude,
  type LayerDef,
  type LayerId,
} from '@/layers';
import type { GeoFeature } from './data-loader';

export type HighlightMode = 'hover' | 'selected';

export interface HighlightStyle {
  fillColor: string;
  fillOpacity: number;
  lineColor: string;
  /** Outline width in CSS pixels. */
  lineWidth: number;
}

/**
 * Hover/selection styles. Drawn on a dedicated overlay instead of restyling the main
 * layers, so a pointer move never makes globe.gl re-evaluate every polygon/path/point.
 */
export const HIGHLIGHT_STYLES: Record<HighlightMode, HighlightStyle> = {
  hover: {
    fillColor: 'hsl(180, 100%, 80%)',
    fillOpacity: 0.35,
    lineColor: 'hsl(180, 100%, 85%)',
    lineWidth: 2,
  },
  selected: {
    fillColor: 'hsl(180, 100%, 70%)',
    fillOpacity: 0.5,
    lineColor: 'hsl(50, 100%, 65%)',
    lineWidth: 3,
  },
};

export const GLOBE_RADIUS = 100;
/** Overlay sits this much (in globe-radius fractions) above the feature's own layer altitude. */
const OVERLAY_LIFT = 0.003;
const MAX_EDGE_DEG = 2;
const POINT_MARKER_RADIUS_DEG = 0.7;
const POINT_MARKER_SEGMENTS = 32;
const CACHE_LIMIT = 24;

/** Same lat/lng → cartesian convention as three-globe (Y is the polar axis). */
export function latLngToVector(
  lat: number,
  lng: number,
  radius: number,
  out = new Vector3(),
): Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  return out.set(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Projects a GeoJSON ring/line onto the sphere as a flat xyz array. Long edges are subdivided
 * so the chords stay above the surface, and edges crossing the antimeridian are interpolated
 * the short way around.
 */
export function lineToPositions(
  points: number[][],
  radius: number,
  maxStepDeg = MAX_EDGE_DEG,
): number[] {
  const out: number[] = [];
  const v = new Vector3();
  const push = (lng: number, lat: number): void => {
    latLngToVector(lat, lng, radius, v);
    out.push(v.x, v.y, v.z);
  };

  for (let i = 0; i < points.length; i++) {
    const [lng, lat] = points[i] as [number, number];
    if (i === 0) {
      push(lng, lat);
      continue;
    }
    const [prevLng, prevLat] = points[i - 1] as [number, number];
    let dLng = lng - prevLng;
    if (dLng > 180) dLng -= 360;
    else if (dLng < -180) dLng += 360;
    const dLat = lat - prevLat;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dLng), Math.abs(dLat)) / maxStepDeg));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      push(prevLng + dLng * t, prevLat + dLat * t);
    }
  }
  return out;
}

/** GeoJSON Polygon/MultiPolygon → list of polygons (each: outer ring + holes). */
export function getPolygons(feature: GeoFeature): number[][][][] {
  const { type, coordinates } = feature.geometry;
  if (type === 'Polygon') return [coordinates as number[][][]];
  if (type === 'MultiPolygon') return coordinates as number[][][][];
  return [];
}

/** GeoJSON LineString/MultiLineString → list of lines. */
export function getLines(feature: GeoFeature): number[][][] {
  const { type, coordinates } = feature.geometry;
  if (type === 'LineString') return [coordinates as number[][]];
  if (type === 'MultiLineString') return coordinates as number[][][];
  return [];
}

function disableRaycast(group: Group): void {
  group.traverse(obj => {
    obj.raycast = () => undefined;
    obj.frustumCulled = false;
  });
}

export class HighlightOverlay {
  public readonly group = new Group();
  private readonly scene: Scene | null;
  private readonly store: Store<AppState>;
  private readonly resolveFeature: (id: string) => GeoFeature | undefined;
  private readonly layerDefs = new Map<LayerId, LayerDef>(LAYER_DEFINITIONS.map(d => [d.id, d]));
  private readonly cache = new Map<string, Group>();
  private readonly lineMaterials = new Set<LineMaterial>();
  private readonly active: Group[] = [];
  private unsubscribe: (() => void) | null = null;
  private readonly onResize = (): void => this.updateResolution();

  constructor(
    scene: Scene | null,
    store: Store<AppState>,
    resolveFeature: (id: string) => GeoFeature | undefined,
  ) {
    this.scene = scene;
    this.store = store;
    this.resolveFeature = resolveFeature;
    this.group.name = 'highlight-overlay';
    disableRaycast(this.group);

    try {
      this.scene?.add(this.group);
    } catch {
      // Mock environment without a real scene
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize);
    }

    this.unsubscribe = this.store.subscribe(
      s => ({ hov: s.hovered?.id ?? null, sel: s.selection?.id ?? null }),
      () => this.sync(),
      (a, b) => a.hov === b.hov && a.sel === b.sel,
    );
    this.sync();
  }

  /** Re-resolves hovered/selected features (e.g. after the layer data was recomposed). */
  public sync(): void {
    const { hovered, selection } = this.store.get();
    const wanted: Array<{ id: string; mode: HighlightMode }> = [];
    if (selection) wanted.push({ id: selection.id, mode: 'selected' });
    if (hovered && hovered.id !== selection?.id) wanted.push({ id: hovered.id, mode: 'hover' });

    for (const g of this.active) this.group.remove(g);
    this.active.length = 0;

    for (const { id, mode } of wanted) {
      const built = this.getOrBuild(id, mode);
      if (built) {
        this.group.add(built);
        this.active.push(built);
      }
    }
  }

  public getActiveCount(): number {
    return this.active.length;
  }

  public getCacheSize(): number {
    return this.cache.size;
  }

  private getOrBuild(id: string, mode: HighlightMode): Group | null {
    const key = `${mode}:${id}`;
    const cached = this.cache.get(key);
    if (cached) {
      // Refresh recency
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    const feature = this.resolveFeature(id);
    if (!feature) return null;

    const built = this.build(feature, HIGHLIGHT_STYLES[mode]);
    if (!built) return null;

    this.cache.set(key, built);
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value as string;
      const evicted = this.cache.get(oldest);
      this.cache.delete(oldest);
      if (evicted) this.disposeGroup(evicted);
    }
    return built;
  }

  private build(feature: GeoFeature, style: HighlightStyle): Group | null {
    const group = new Group();
    group.name = `highlight-${feature.properties.id}`;

    const def = this.layerDefs.get(feature.properties.layerId as LayerId);
    const baseAltitude = getLines(feature).length
      ? getPathAltitude()
      : getPolygonAltitude(feature, false, false, def);
    const radius = GLOBE_RADIUS * (1 + baseAltitude + OVERLAY_LIFT);

    const polygons = getPolygons(feature);
    if (polygons.length > 0) {
      const fill = new MeshBasicMaterial({
        color: new Color(style.fillColor),
        transparent: true,
        opacity: style.fillOpacity,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      for (const polygon of polygons) {
        const geometry = new ConicPolygonGeometry(polygon, radius, radius, false, true, false, 5);
        group.add(new Mesh(geometry, fill));
        for (const ring of polygon) {
          group.add(this.makeLine(lineToPositions(ring, radius), style));
        }
      }
    } else {
      const lines = getLines(feature);
      for (const line of lines) {
        group.add(this.makeLine(lineToPositions(line, radius), style));
      }
      if (lines.length === 0 && feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates as number[];
        group.add(this.makeLine(this.pointMarker(lat ?? 0, lng ?? 0, radius), style));
      }
    }

    if (group.children.length === 0) return null;
    disableRaycast(group);
    return group;
  }

  /** Small circle of line segments around a point feature. */
  private pointMarker(lat: number, lng: number, radius: number): number[] {
    const ring: number[][] = [];
    for (let i = 0; i <= POINT_MARKER_SEGMENTS; i++) {
      const angle = (i / POINT_MARKER_SEGMENTS) * Math.PI * 2;
      const dLat = Math.sin(angle) * POINT_MARKER_RADIUS_DEG;
      const dLng =
        (Math.cos(angle) * POINT_MARKER_RADIUS_DEG) /
        Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      ring.push([lng + dLng, lat + dLat]);
    }
    return lineToPositions(ring, radius, 1);
  }

  private makeLine(positions: number[], style: HighlightStyle): Line2 {
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      color: new Color(style.lineColor).getHex(),
      linewidth: style.lineWidth,
      transparent: true,
      depthWrite: false,
    });
    this.lineMaterials.add(material);
    this.updateResolution(material);
    return new Line2(geometry, material);
  }

  private updateResolution(only?: LineMaterial): void {
    if (typeof window === 'undefined') return;
    const w = window.innerWidth || 1024;
    const h = window.innerHeight || 768;
    for (const material of only ? [only] : this.lineMaterials) {
      material.resolution.set(w, h);
    }
  }

  private disposeGroup(group: Group): void {
    group.traverse(obj => {
      const mesh = obj as Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (material && !Array.isArray(material)) {
        material.dispose();
        this.lineMaterials.delete(material as LineMaterial);
      }
    });
  }

  public destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize);
    }
    for (const g of this.cache.values()) this.disposeGroup(g);
    this.cache.clear();
    this.active.length = 0;
    this.group.clear();
    try {
      this.scene?.remove(this.group);
    } catch {
      // Mock environment
    }
  }
}
