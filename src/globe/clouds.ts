import {
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TextureLoader,
  type Scene,
  type Texture,
} from 'three';
import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';

export interface CloudsControllerOptions {
  cloudsTextureUrl?: string;
  globeRadius?: number;
  altitude?: number;
  rotationSpeed?: number;
  enabled?: boolean;
}

/**
 * Manages the 3D atmospheric cloud sphere hovering above the globe surface.
 * Features:
 * - Independent slow orbital drift.
 * - Respects `prefers-reduced-motion` accessibility preferences.
 * - Completely transparent to raycasting (`mesh.raycast = () => null`) to prevent picking occlusion.
 * - Reactive binding to `AppState.clouds`.
 */
export class CloudsController {
  private readonly scene: Scene | null = null;
  private readonly store: Store<AppState>;
  private readonly rotationSpeed: number;
  private readonly mesh: Mesh | null = null;
  private readonly texture: Texture | null = null;

  private unsubscribe: (() => void) | null = null;
  private rafId: number | null = null;
  private running = false;
  private prefersReducedMotion = false;

  constructor(scene: Scene | null, store: Store<AppState>, options: CloudsControllerOptions = {}) {
    this.scene = scene;
    this.store = store;

    // Slow orbital rotation drift (~0.0001 rad/frame ≈ 0.35 deg/s at 60fps)
    this.rotationSpeed = options.rotationSpeed ?? -0.0001;

    // Accessibility check: disable continuous rotation if reduced motion requested
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.prefersReducedMotion = mql.matches;
      mql.addEventListener?.('change', (e: MediaQueryListEvent) => {
        this.prefersReducedMotion = e.matches;
      });
    }

    const globeRadius = options.globeRadius ?? 100;
    const altitude = options.altitude ?? 0.005;
    const radius = globeRadius * (1 + altitude);

    const textureUrl = resolveAssetUrl(options.cloudsTextureUrl ?? '/textures/clouds.png');
    const loader = new TextureLoader();

    try {
      this.texture = loader.load(textureUrl);

      const geometry = new SphereGeometry(radius, 64, 32);
      const material = new MeshStandardMaterial({
        map: this.texture,
        transparent: true,
        opacity: 0.85,
        depthWrite: false, // Essential to prevent Z-buffer occlusion of underlying surface
        roughness: 1.0,
      });

      this.mesh = new Mesh(geometry, material);
      this.mesh.name = 'clouds-sphere';

      // CRITICAL: Prevent clouds mesh from intercepting pointer raycasts/hover/clicks
      this.mesh.raycast = () => {};

      const isEnabled = options.enabled ?? store.get().clouds ?? true;
      this.mesh.visible = isEnabled;

      if (this.scene) {
        this.scene.add(this.mesh);
      }
    } catch {
      // In mock/test environments without WebGL/Three.js context
      this.mesh = null;
      this.texture = null;
    }

    this.bindStore();
    this.startAnimation();
  }

  public getMesh(): Mesh | null {
    return this.mesh;
  }

  public setVisible(visible: boolean): void {
    if (this.mesh) {
      this.mesh.visible = visible;
    }
  }

  public isVisible(): boolean {
    return this.mesh?.visible ?? false;
  }

  public tick(): void {
    if (!this.prefersReducedMotion && this.mesh && this.mesh.visible) {
      this.mesh.rotation.y += this.rotationSpeed;
    }
  }

  private startAnimation(): void {
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') {
      return;
    }

    this.running = true;
    const loop = (): void => {
      if (!this.running) return;
      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => s.clouds,
      clouds => {
        this.setVisible(clouds ?? true);
      },
    );
  }

  public destroy(): void {
    this.running = false;
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.mesh) {
      if (this.scene) {
        this.scene.remove(this.mesh);
      }
      this.mesh.geometry?.dispose();
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(m => m.dispose());
      } else {
        this.mesh.material?.dispose();
      }
    }

    this.texture?.dispose();
  }
}
