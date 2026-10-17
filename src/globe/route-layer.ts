import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
  type Scene,
} from 'three';
import type { Store, AppState, RouteComparisonState } from '@/state/types';
import { greatCircle, rhumbLine, type ArcItem } from '@/geo/spherical';

export interface GlobeRouteDelegate {
  scene?(): Scene;
  arcsData?(arcs: ArcItem[]): this;
  getCoords?(lat: number, lng: number, altitude?: number): { x: number; y: number; z: number };
}

/**
 * Converts spherical (lat, lng, altitude) to Cartesian Three.js coordinates on the globe.
 */
export function polarToCartesian(
  lat: number,
  lng: number,
  alt = 0.002,
  globeRadius = 100,
): Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (90 - lng) * (Math.PI / 180);
  const r = globeRadius * (1 + alt);

  return new Vector3(
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.cos(theta),
  );
}

/**
 * Manages 3D visualization of Great Circle (Orthodrome) vs Rhumb Line (Loxodrome):
 * - Spatial 3D parabolic arc for Orthodrome via globe.arcsData()
 * - Solid emerald ground-track curve on globe surface for Orthodrome
 * - Dashed amber ground-track curve on globe surface for Loxodrome
 * - Glowing start and destination position markers
 * - Complete raycast bypass to preserve picking of underlying countries/places
 */
export class RouteLayerController {
  private readonly globe: GlobeRouteDelegate;
  private readonly store: Store<AppState>;
  private readonly scene: Scene | null = null;
  private readonly routeGroup = new Group();
  private unsubscribe: (() => void) | null = null;

  constructor(globe: GlobeRouteDelegate, store: Store<AppState>) {
    this.globe = globe;
    this.store = store;

    this.routeGroup.name = 'TL_RouteLayer';
    // Bypassing raycasting so routes never block clicking on globe features
    this.routeGroup.raycast = () => null;

    if (this.globe.scene) {
      try {
        this.scene = this.globe.scene();
        this.scene.add(this.routeGroup);
      } catch {
        // Fallback for mock environments
      }
    }

    this.bindStore();
    this.sync(this.store.get().routeComparison);
  }

  public sync(comparison: RouteComparisonState | null): void {
    this.clear();

    if (!comparison || !comparison.active) {
      return;
    }

    const { from, to } = comparison;

    if (from && !to) {
      // Only Point A is selected so far
      this.addMarker(from.lat, from.lng, 0x00ffa3); // Emerald neon
      return;
    }

    if (from && to) {
      // Both points are selected: render complete route comparison
      // 1. 3D Spatial Arc for Orthodrome
      try {
        this.globe.arcsData?.([
          {
            startLat: from.lat,
            startLng: from.lng,
            endLat: to.lat,
            endLng: to.lng,
            color: '#00f0ff',
          },
        ]);
      } catch {
        // Mock fallback
      }

      // 2. Surface Ground-Tracks
      this.renderOrthodromeTrack(from, to);
      this.renderLoxodromeTrack(from, to);

      // 3. Start & Destination Markers
      this.addMarker(from.lat, from.lng, 0x00ffa3); // Point A: Emerald
      this.addMarker(to.lat, to.lng, 0xff5533); // Point B: Coral Red
    }
  }

  private renderOrthodromeTrack(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): void {
    const points = greatCircle(from, to, 80);
    const positions: number[] = [];

    for (const pt of points) {
      const v = this.getPoint3D(pt.lat, pt.lng, 0.002);
      positions.push(v.x, v.y, v.z);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    const material = new LineBasicMaterial({
      color: 0x00ffa3,
      transparent: true,
      opacity: 0.95,
      linewidth: 2,
    });

    const line = new Line(geometry, material);
    line.raycast = () => null;
    this.routeGroup.add(line);
  }

  private renderLoxodromeTrack(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): void {
    const points = rhumbLine(from, to, 80);
    const positions: number[] = [];

    for (const pt of points) {
      const v = this.getPoint3D(pt.lat, pt.lng, 0.0025);
      positions.push(v.x, v.y, v.z);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    const material = new LineDashedMaterial({
      color: 0xffaa00,
      dashSize: 1.5,
      gapSize: 0.8,
      transparent: true,
      opacity: 0.95,
      linewidth: 2,
    });

    const line = new Line(geometry, material);
    line.computeLineDistances();
    line.raycast = () => null;
    this.routeGroup.add(line);
  }

  private addMarker(lat: number, lng: number, color: number): void {
    const pos = this.getPoint3D(lat, lng, 0.003);
    const geometry = new RingGeometry(0.8, 1.4, 24);
    const material = new MeshBasicMaterial({
      color,
      side: 2, // DoubleSide
      transparent: true,
      opacity: 0.9,
    });

    const mesh = new Mesh(geometry, material);
    mesh.position.copy(pos);
    mesh.lookAt(0, 0, 0); // Normal aligned with globe center
    mesh.raycast = () => null;

    this.routeGroup.add(mesh);
  }

  private getPoint3D(lat: number, lng: number, alt: number): Vector3 {
    if (this.globe.getCoords) {
      try {
        const c = this.globe.getCoords(lat, lng, alt);
        if (c && typeof c.x === 'number') {
          return new Vector3(c.x, c.y, c.z);
        }
      } catch {
        // Fallback
      }
    }
    return polarToCartesian(lat, lng, alt, 100);
  }

  private clear(): void {
    try {
      this.globe.arcsData?.([]);
    } catch {
      // Mock fallback
    }

    while (this.routeGroup.children.length > 0) {
      const child = this.routeGroup.children[0];
      if (child) {
        this.routeGroup.remove(child);
        if ('geometry' in child && child.geometry instanceof BufferGeometry) {
          child.geometry.dispose();
        }
        if ('material' in child) {
          const mat = child.material as { dispose?: () => void } | { dispose?: () => void }[];
          if (Array.isArray(mat)) {
            mat.forEach(m => m.dispose?.());
          } else if (mat && typeof mat.dispose === 'function') {
            mat.dispose();
          }
        }
      }
    }
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => s.routeComparison,
      comparison => {
        this.sync(comparison);
      },
    );
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.clear();

    if (this.scene) {
      this.scene.remove(this.routeGroup);
    }
  }
}
