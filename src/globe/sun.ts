import {
  AdditiveBlending,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { calculateSunAngularDiameterDeg } from '@/geo/solar';
import type { Store, AppState } from '@/state/types';

const DEG2RAD = Math.PI / 180;

/**
 * Distance from the camera at which the solar billboard is drawn, in scene units (globe radius =
 * 100). Further than the globe at maximum zoom-out (10 000) and nearer than the star sky sphere
 * (50 000), so the globe occludes the Sun and the sky never does.
 */
export const SUN_BILLBOARD_DISTANCE = 20_000;
/** The disc never shrinks below this many pixels in diameter, so tiny viewports still show it. */
export const SUN_MIN_DISC_PX = 2;

export interface SunParams {
  /** Disc size multiplier; 1 = the real angular diameter. */
  discScale: number;
  /** Peak brightness of the (purely optical) glow around the disc. */
  glowStrength: number;
  /** Glow e-folding length, in disc radii. */
  glowFalloff: number;
  /** Half-size of the billboard quad, in disc radii; the glow fades out at this edge. */
  glowExtent: number;
}

export const DEFAULT_SUN_PARAMS: SunParams = {
  discScale: 1,
  glowStrength: 0.55,
  glowFalloff: 2.5,
  glowExtent: 14,
};

/** Billboard center: a fixed distance from the camera along the sun direction (no parallax). */
export function sunBillboardCenter(
  cameraPosition: Vector3,
  sunDirection: Vector3,
  distance: number = SUN_BILLBOARD_DISTANCE,
  target: Vector3 = new Vector3(),
): Vector3 {
  return target.copy(sunDirection).normalize().multiplyScalar(distance).add(cameraPosition);
}

/** World-space diameter that subtends `angularDiameterDeg` at `distance`. */
export function discWorldDiameter(
  angularDiameterDeg: number,
  distance: number = SUN_BILLBOARD_DISTANCE,
): number {
  return 2 * distance * Math.tan((angularDiameterDeg * DEG2RAD) / 2);
}

/**
 * Smallest world diameter at `distance` that still covers `minPx` pixels for a perspective
 * camera with vertical field of view `fovDeg` and a viewport `viewportHeightPx` tall.
 */
export function minDiscWorldDiameter(
  fovDeg: number,
  viewportHeightPx: number,
  minPx: number = SUN_MIN_DISC_PX,
  distance: number = SUN_BILLBOARD_DISTANCE,
): number {
  if (viewportHeightPx <= 0) return 0;
  const viewHeightWorld = 2 * distance * Math.tan((fovDeg * DEG2RAD) / 2);
  return (minPx / viewportHeightPx) * viewHeightWorld;
}

export const SUN_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    // Quad spans [-0.5, 0.5]; map to [-1, 1] so length(vUv) == 1 at the quad edge
    vUv = position.xy * 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SUN_FRAGMENT_SHADER = /* glsl */ `
  uniform float uGlowStrength;
  uniform float uGlowFalloff;
  uniform float uGlowExtent;

  varying vec2 vUv;

  void main() {
    // Distance from the disc center, in disc radii
    float r = length(vUv) * uGlowExtent;

    // Disc with a ~1 px anti-aliased edge and limb darkening (linear law, u = 0.6)
    float aa = max(fwidth(r), 1e-4);
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
    float mu = sqrt(max(0.0, 1.0 - min(r * r, 1.0)));
    float limb = 1.0 - 0.6 * (1.0 - mu);
    vec3 discColor = vec3(1.0, 0.97, 0.9) * limb;

    // Optical glow: not part of the real disc, fades to zero at the quad edge
    float glow = uGlowStrength * exp(-max(r - 1.0, 0.0) / uGlowFalloff);
    glow *= 1.0 - smoothstep(uGlowExtent * 0.6, uGlowExtent, r);
    vec3 glowColor = vec3(1.0, 0.85, 0.6) * glow;

    vec3 color = discColor * disc + glowColor * (1.0 - disc);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export interface SunControllerOptions {
  /** Shared (in-place mutated) sun direction, e.g. `DayNightController.getSunDirection()`. */
  sunDirection: Vector3;
  date?: Date;
  params?: Partial<SunParams>;
}

/**
 * The Sun drawn in the sky at its real angular size (~0.53°).
 *
 * A single camera-facing quad re-anchored every frame at a fixed distance from the camera along
 * the sun direction, so it behaves like an infinitely distant object: it stays put in the sky
 * while orbiting and zooming, and the globe occludes it via the depth test (sunrise on the limb).
 * The glow around the disc is an optical effect and is tuned separately from the disc size.
 */
export class SunController {
  public readonly params: SunParams;
  private readonly scene: Scene | null;
  private readonly store: Store<AppState>;
  private readonly sunDirection: Vector3;
  private readonly geometry: PlaneGeometry;
  private readonly material: ShaderMaterial;
  private readonly mesh: Mesh;
  private readonly unsubs: (() => void)[] = [];
  private readonly viewportSize = new Vector2();
  private angularDiameterDeg: number;

  constructor(scene: Scene | null, store: Store<AppState>, options: SunControllerOptions) {
    this.scene = scene;
    this.store = store;
    this.sunDirection = options.sunDirection;
    this.params = { ...DEFAULT_SUN_PARAMS, ...options.params };
    this.angularDiameterDeg = calculateSunAngularDiameterDeg(options.date ?? new Date());

    this.material = new ShaderMaterial({
      uniforms: {
        uGlowStrength: { value: this.params.glowStrength },
        uGlowFalloff: { value: this.params.glowFalloff },
        uGlowExtent: { value: this.params.glowExtent },
      },
      vertexShader: SUN_VERTEX_SHADER,
      fragmentShader: SUN_FRAGMENT_SHADER,
      blending: AdditiveBlending,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    this.geometry = new PlaneGeometry(1, 1);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'sun';
    // Repositioned in onBeforeRender, which only runs for objects that passed culling
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.onBeforeRender = (renderer, _scene, camera) => this.place(camera, renderer);

    this.scene?.add(this.mesh);
    this.syncVisibility();
    this.bindStore();
  }

  public getMesh(): Mesh {
    return this.mesh;
  }

  public getMaterial(): ShaderMaterial {
    return this.material;
  }

  public getAngularDiameterDeg(): number {
    return this.angularDiameterDeg;
  }

  /** Recomputes the disc size for `date` (the Earth–Sun distance varies by ±1.7% over a year). */
  public setDate(date: Date): void {
    this.angularDiameterDeg = calculateSunAngularDiameterDeg(date);
  }

  /** Pushes `params` changes (e.g. from the dev panel) into the shader. */
  public applyParams(): void {
    const u = this.material.uniforms;
    if (u.uGlowStrength) u.uGlowStrength.value = this.params.glowStrength;
    if (u.uGlowFalloff) u.uGlowFalloff.value = this.params.glowFalloff;
    if (u.uGlowExtent) u.uGlowExtent.value = this.params.glowExtent;
  }

  /** Anchors the billboard to `camera`; exposed for tests, called by the renderer every frame. */
  public place(camera: Camera, renderer?: Pick<WebGLRenderer, 'getSize'>): void {
    sunBillboardCenter(
      camera.position,
      this.sunDirection,
      SUN_BILLBOARD_DISTANCE,
      this.mesh.position,
    );
    this.mesh.quaternion.copy(camera.quaternion);

    let discDiameter = discWorldDiameter(this.angularDiameterDeg * this.params.discScale);
    if (renderer && camera instanceof PerspectiveCamera) {
      const heightPx = renderer.getSize(this.viewportSize).y;
      discDiameter = Math.max(discDiameter, minDiscWorldDiameter(camera.fov, heightPx));
    }
    this.mesh.scale.setScalar(discDiameter * this.params.glowExtent);
    // The renderer already computed world matrices for this frame
    this.mesh.updateMatrixWorld();
  }

  private syncVisibility(): void {
    const { dayNight, theme } = this.store.get();
    this.mesh.visible = dayNight && theme !== 'classic';
  }

  private bindStore(): void {
    this.unsubs.push(
      this.store.subscribe(
        s => s.dayNight,
        () => this.syncVisibility(),
      ),
      this.store.subscribe(
        s => s.theme,
        () => this.syncVisibility(),
      ),
    );
  }

  public destroy(): void {
    this.unsubs.forEach(unsub => unsub());
    this.unsubs.length = 0;
    this.scene?.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
