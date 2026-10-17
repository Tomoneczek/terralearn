import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShapeUtils,
  Vector2,
  Vector3,
  type Scene,
} from 'three';
import type { Store, AppState, SizeComparisonState } from '@/state/types';
import { movePolygonTo, latLngToVector3 } from '@/geo/spherical';
import { polarToCartesian } from './route-layer';

export interface GlobeSizeComparisonDelegate {
  scene?(): Scene;
}

/**
 * Manages 3D visualization of the "ghost" polygon for True Size comparison:
 * - Computes spherical isometric movement without Mercator distortion
 * - Renders semi-transparent cap mesh (triangulated on tangent plane)
 * - Renders luminous golden perimeter outlines (LineLoop)
 * - Complete raycast bypass to ensure picking underlying countries remains active
 */
export class SizeComparisonLayerController {
  private readonly globe: GlobeSizeComparisonDelegate;
  private readonly store: Store<AppState>;
  private readonly scene: Scene | null = null;
  private readonly group = new Group();
  private unsubscribe: (() => void) | null = null;

  constructor(globe: GlobeSizeComparisonDelegate, store: Store<AppState>) {
    this.globe = globe;
    this.store = store;

    this.group.name = 'TL_SizeComparisonLayer';
    // Bypass raycast so clicking passes through to underlying features
    this.group.raycast = () => null;

    if (this.globe.scene) {
      try {
        this.scene = this.globe.scene();
        this.scene.add(this.group);
      } catch {
        // Fallback for mock environments
      }
    }

    this.bindStore();
    this.sync(this.store.get().sizeComparison);
  }

  public getGroup(): Group {
    return this.group;
  }

  public sync(comparison: SizeComparisonState | null): void {
    this.clear();

    if (!comparison || !comparison.active || !comparison.geometry) {
      return;
    }

    const { geometry, targetLat, targetLng } = comparison;

    // 1. Move the polygon spherically to target coordinates
    const moved = movePolygonTo(geometry, targetLat, targetLng);

    // 2. Compute local tangent basis at (targetLat, targetLng) for 2D triangulation
    const c = latLngToVector3(targetLat, targetLng);
    let up: [number, number, number] = [0, 0, 1];
    if (Math.abs(c[2]) > 0.9) {
      up = [0, 1, 0];
    }

    const uRaw: [number, number, number] = [
      up[1] * c[2] - up[2] * c[1],
      up[2] * c[0] - up[0] * c[2],
      up[0] * c[1] - up[1] * c[0],
    ];
    const uLen = Math.hypot(uRaw[0], uRaw[1], uRaw[2]);
    const u: [number, number, number] = [uRaw[0] / uLen, uRaw[1] / uLen, uRaw[2] / uLen];
    const v: [number, number, number] = [
      c[1] * u[2] - c[2] * u[1],
      c[2] * u[0] - c[0] * u[2],
      c[0] * u[1] - c[1] * u[0],
    ];

    const polygons =
      moved.type === 'Polygon' ? [moved.coordinates] : (moved as GeoJSON.MultiPolygon).coordinates;

    const strokeMat = new LineBasicMaterial({
      color: 0xffd700, // Vibrant gold
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    const fillMat = new MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.35,
      side: DoubleSide,
      depthWrite: false,
    });

    for (const poly of polygons) {
      if (!poly || poly.length === 0) continue;

      // Outer ring
      const outerRing = poly[0];
      if (!outerRing || outerRing.length < 3) continue;

      // 1. Perimeter stroke
      this.renderRingOutline(outerRing, strokeMat, 0.005);

      // Holes outlines
      const holes = poly.slice(1);
      for (const hole of holes) {
        if (hole && hole.length >= 3) {
          this.renderRingOutline(hole, strokeMat, 0.005);
        }
      }

      // 2. Cap Triangulation
      this.renderPolygonCap(outerRing, holes, u, v, fillMat, 0.004);
    }

    // 3. Anchor center pin
    this.renderCenterAnchor(targetLat, targetLng);
  }

  private renderRingOutline(
    ring: GeoJSON.Position[],
    material: LineBasicMaterial,
    altitude: number,
  ): void {
    const points: Vector3[] = [];
    for (const coord of ring) {
      const lng = coord[0];
      const lat = coord[1];
      if (lng !== undefined && lat !== undefined) {
        points.push(polarToCartesian(lat, lng, altitude));
      }
    }

    if (points.length < 2) return;

    const geom = new BufferGeometry().setFromPoints(points);
    const line = new LineLoop(geom, material);
    line.raycast = () => null;
    this.group.add(line);
  }

  private renderPolygonCap(
    outerRing: GeoJSON.Position[],
    holes: GeoJSON.Position[][],
    u: [number, number, number],
    v: [number, number, number],
    material: MeshBasicMaterial,
    altitude: number,
  ): void {
    try {
      const allCoords: GeoJSON.Position[] = [];
      const outerPts2d: Vector2[] = [];

      for (const coord of outerRing) {
        const lng = coord[0];
        const lat = coord[1];
        if (lng === undefined || lat === undefined) continue;
        allCoords.push(coord);
        const p = latLngToVector3(lat, lng);
        const x = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
        const y = p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
        outerPts2d.push(new Vector2(x, y));
      }

      const holesPts2d: Vector2[][] = [];
      for (const hole of holes) {
        const h2d: Vector2[] = [];
        for (const coord of hole) {
          const lng = coord[0];
          const lat = coord[1];
          if (lng === undefined || lat === undefined) continue;
          allCoords.push(coord);
          const p = latLngToVector3(lat, lng);
          const x = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
          const y = p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
          h2d.push(new Vector2(x, y));
        }
        if (h2d.length >= 3) {
          holesPts2d.push(h2d);
        }
      }

      if (outerPts2d.length < 3) return;

      const indices = ShapeUtils.triangulateShape(outerPts2d, holesPts2d);
      if (!indices || indices.length === 0) return;

      const positions = new Float32Array(allCoords.length * 3);
      for (let i = 0; i < allCoords.length; i++) {
        const coord = allCoords[i]!;
        const pt3d = polarToCartesian(coord[1]!, coord[0]!, altitude);
        positions[i * 3] = pt3d.x;
        positions[i * 3 + 1] = pt3d.y;
        positions[i * 3 + 2] = pt3d.z;
      }

      const flatIndices: number[] = [];
      for (const tri of indices) {
        if (tri[0] !== undefined && tri[1] !== undefined && tri[2] !== undefined) {
          flatIndices.push(tri[0], tri[1], tri[2]);
        }
      }

      const geom = new BufferGeometry();
      geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geom.setIndex(flatIndices);
      geom.computeVertexNormals();

      const mesh = new Mesh(geom, material);
      mesh.raycast = () => null;
      this.group.add(mesh);
    } catch {
      // Triangulation failure fallback: line loops already outline the country
    }
  }

  private renderCenterAnchor(lat: number, lng: number): void {
    const pos = polarToCartesian(lat, lng, 0.007);
    const geom = new RingGeometry(0.3, 0.8, 32);
    const mat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      side: DoubleSide,
      depthWrite: false,
    });

    const marker = new Mesh(geom, mat);
    marker.position.copy(pos);
    marker.lookAt(new Vector3(0, 0, 0));
    marker.raycast = () => null;
    this.group.add(marker);
  }

  public clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (!child) break;
      this.group.remove(child);

      if (child instanceof Mesh || child instanceof LineLoop) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    }
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => s.sizeComparison,
      comparison => {
        this.sync(comparison);
      },
      (a, b) =>
        a?.active === b?.active &&
        a?.countryId === b?.countryId &&
        a?.targetLat === b?.targetLat &&
        a?.targetLng === b?.targetLng &&
        a?.geometry === b?.geometry,
    );
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.clear();
    if (this.scene) {
      this.scene.remove(this.group);
    }
  }
}
