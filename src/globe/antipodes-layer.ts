import {
  BufferGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
  type Scene,
} from 'three';
import type { Store, AppState, AntipodesState } from '@/state/types';
import { polarToCartesian } from './route-layer';

export interface GlobeAntipodesDelegate {
  scene?(): Scene;
}

/**
 * Manages 3D visualization of Antipodes:
 * - Glowing marker at starting location (Point A)
 * - Glowing marker at opposite side of the globe (Point B)
 * - Diametral straight axis passing directly through Earth's center (0, 0, 0)
 * - Raycast bypass to preserve picking of underlying countries/cities
 */
export class AntipodesLayerController {
  private readonly globe: GlobeAntipodesDelegate;
  private readonly store: Store<AppState>;
  private readonly scene: Scene | null = null;
  private readonly group = new Group();
  private unsubscribe: (() => void) | null = null;

  constructor(globe: GlobeAntipodesDelegate, store: Store<AppState>) {
    this.globe = globe;
    this.store = store;

    this.group.name = 'TL_AntipodesLayer';
    this.group.raycast = () => null;

    if (this.globe.scene) {
      try {
        this.scene = this.globe.scene();
        this.scene.add(this.group);
      } catch {
        // Mock environment fallback
      }
    }

    this.bindStore();
    this.sync(this.store.get().antipodes);
  }

  public getGroup(): Group {
    return this.group;
  }

  public sync(state: AntipodesState | null): void {
    this.clear();

    if (!state || !state.active || !state.source || !state.antipode) {
      return;
    }

    const { source, antipode } = state;

    // 1. Point A marker (Emerald / Cyan)
    this.addMarker(source.lat, source.lng, 0x00ffa3);

    // 2. Point B marker (Coral / Magenta)
    this.addMarker(antipode.lat, antipode.lng, 0xff007f);

    // 3. Diametral line passing through Earth's center (0, 0, 0)
    const posA = polarToCartesian(source.lat, source.lng, 0.005);
    const posB = polarToCartesian(antipode.lat, antipode.lng, 0.005);

    const tunnelGeom = new BufferGeometry().setFromPoints([posA, new Vector3(0, 0, 0), posB]);
    const tunnelMat = new LineBasicMaterial({
      color: 0xff007f,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const tunnelLine = new Line(tunnelGeom, tunnelMat);
    tunnelLine.raycast = () => null;
    this.group.add(tunnelLine);
  }

  private addMarker(lat: number, lng: number, color: number): void {
    const pos = polarToCartesian(lat, lng, 0.006);

    // Outer glow ring
    const ringGeom = new RingGeometry(0.5, 1.3, 32);
    const ringMat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      depthWrite: false,
    });

    const ringMesh = new Mesh(ringGeom, ringMat);
    ringMesh.position.copy(pos);
    ringMesh.lookAt(new Vector3(0, 0, 0));
    ringMesh.raycast = () => null;
    this.group.add(ringMesh);

    // Inner bright core
    const coreGeom = new RingGeometry(0, 0.4, 16);
    const coreMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      side: DoubleSide,
      depthWrite: false,
    });
    const coreMesh = new Mesh(coreGeom, coreMat);
    coreMesh.position.copy(pos);
    coreMesh.lookAt(new Vector3(0, 0, 0));
    coreMesh.raycast = () => null;
    this.group.add(coreMesh);
  }

  public clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (!child) break;
      this.group.remove(child);

      if (child instanceof Mesh || child instanceof Line) {
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
      s => s.antipodes,
      antipodes => {
        this.sync(antipodes);
      },
      (a, b) =>
        a?.active === b?.active &&
        a?.source?.lat === b?.source?.lat &&
        a?.source?.lng === b?.source?.lng &&
        a?.antipode?.lat === b?.antipode?.lat &&
        a?.antipode?.lng === b?.antipode?.lng,
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
