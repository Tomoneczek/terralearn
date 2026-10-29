import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { Store, AppState } from '@/state/types';
import type { GeoFeature } from './data-loader';
import { toFeatureRef } from './events';
import type { HoverArbiter } from './hover-arbiter';
import { latLngToVector } from './highlight-overlay';
import {
  CAPITALS_SPOTLIGHT_DEFAULTS,
  computeCapitalOpacity,
  computeFacing,
  computePointScale,
  computeRankScale,
  computeZoomFade,
  findNearestCapital,
  type CapitalState,
  type ScreenCapital,
  type SpotlightParams,
} from './capitals-spotlight';

/** Above country caps (0.012) and paths (0.014). */
export const CAPITAL_ALTITUDE = 0.016;
const BASE_COLOR = 'hsl(350, 85%, 62%)';
const HOVER_COLOR = 'hsl(180, 100%, 80%)';
const SELECTED_COLOR = 'hsl(50, 100%, 65%)';
const UPDATE_INTERVAL_MS = 150;
export const CLICK_DRAG_TOLERANCE_PX = 6;

export const CAPITALS_VERTEX_SHADER = /* glsl */ `
  uniform vec2 uViewport;
  uniform float uPixelRatio;
  uniform float uPointSize;
  uniform float uPointZoomScale;
  uniform float uPointCloseAltitude;
  uniform float uZoomFullAltitude;
  uniform float uGlobeRadius;
  uniform float uFullRadius;
  uniform float uFadeRadius;
  uniform float uZoomFade;

  attribute float aRank;
  attribute float aState;
  attribute vec3 aColor;

  varying float vOpacity;
  varying vec3 vColor;
  varying float vState;

  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 ndc = clip.xy / clip.w;
    float distPx = length(ndc * 0.5 * uViewport);
    float viewportMin = min(uViewport.x, uViewport.y);

    // Spotlight: opaque near the screen center, fading out beyond a rank-scaled circle
    float rFull = uFullRadius * viewportMin * aRank;
    float rFade = max(uFadeRadius * viewportMin * aRank, rFull + 0.001);
    float spotlight = (1.0 - smoothstep(rFull, rFade, distPx)) * uZoomFade;

    float opacity = spotlight;
    if (aState > 1.5) {
      opacity = 1.0;
    } else if (aState > 0.5) {
      opacity = max(spotlight, 0.85);
    }

    // Soft fade at the globe horizon
    float cosAngle = dot(normalize(position), normalize(cameraPosition));
    float facing = smoothstep(0.0, 0.08, cosAngle - uGlobeRadius / length(cameraPosition));

    vOpacity = opacity * facing;
    vColor = aColor;
    vState = aState;
    float stateScale = aState > 1.5 ? 1.5 : (aState > 0.5 ? 1.25 : 1.0);
    // Bigger markers when zoomed in (same formula as computePointScale)
    float altitude = length(cameraPosition) / uGlobeRadius - 1.0;
    float zoomScale = 1.0 + (uPointZoomScale - 1.0) *
      (1.0 - smoothstep(uPointCloseAltitude, uZoomFullAltitude, altitude));
    gl_PointSize = uPointSize * uPixelRatio * zoomScale * stateScale;
    gl_Position = clip;
  }
`;

export const CAPITALS_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uHoverColor;
  uniform vec3 uSelectedColor;

  varying float vOpacity;
  varying vec3 vColor;
  varying float vState;

  void main() {
    if (vOpacity < 0.01) discard;
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;

    vec3 base = vState > 1.5 ? uSelectedColor : (vState > 0.5 ? uHoverColor : vColor);
    // Colored core, light ring and dark outer edge: readable on dark and on bright textures
    float ring = smoothstep(0.50, 0.56, d);
    float outline = smoothstep(0.76, 0.82, d);
    vec3 color = mix(base, vec3(1.0), ring);
    color = mix(color, vec3(0.04, 0.05, 0.08), outline);
    float alpha = (1.0 - smoothstep(0.92, 1.0, d)) * vOpacity;
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface CapitalsLayerOptions {
  scene: Scene | null;
  store: Store<AppState>;
  arbiter: HoverArbiter;
  /** Element that receives pointer events (the globe container). */
  container: HTMLElement | null;
  getCamera: () => Camera | null;
  globeRadius?: number;
  params?: Partial<SpotlightParams>;
}

interface CapitalItem {
  feature: GeoFeature;
  unit: Vector3;
  position: Vector3;
  rankScale: number;
}

/**
 * Capitals as a single shader-driven point cloud (1 draw call) instead of one mesh per city.
 * Visibility follows a screen-space spotlight (see capitals-spotlight.ts); hover, click and
 * is derived on the CPU from the same formulas.
 */
export class CapitalsLayer {
  /** Live-tunable parameters (the dev panel mutates these). */
  public readonly params: SpotlightParams;

  private readonly scene: Scene | null;
  private readonly store: Store<AppState>;
  private readonly arbiter: HoverArbiter;
  private readonly container: HTMLElement | null;
  private readonly getCamera: () => Camera | null;
  private readonly globeRadius: number;
  private readonly material: ShaderMaterial;
  private readonly points: Points;
  private readonly viewport = new Vector2(0, 0);
  private readonly pointer = { x: 0, y: 0, inside: false };
  private readonly pointerDown = { x: 0, y: 0 };

  private items: CapitalItem[] = [];
  private geometry = new BufferGeometry();
  private colorOverrides: Record<string, string> | null = null;
  private lastUpdate = 0;
  private claimedId: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(options: CapitalsLayerOptions) {
    this.scene = options.scene;
    this.store = options.store;
    this.arbiter = options.arbiter;
    this.container = options.container;
    this.getCamera = options.getCamera;
    this.globeRadius = options.globeRadius ?? 100;
    this.params = { ...CAPITALS_SPOTLIGHT_DEFAULTS, ...options.params };

    this.material = new ShaderMaterial({
      uniforms: {
        uViewport: { value: this.viewport },
        uPixelRatio: { value: 1 },
        uPointSize: { value: this.params.pointSize },
        uPointZoomScale: { value: this.params.pointZoomScale },
        uPointCloseAltitude: { value: this.params.pointScaleCloseAltitude },
        uZoomFullAltitude: { value: this.params.zoomFullAltitude },
        uGlobeRadius: { value: this.globeRadius },
        uFullRadius: { value: this.params.fullRadius },
        uFadeRadius: { value: this.params.fadeRadius },
        uZoomFade: { value: 0 },
        uHoverColor: { value: new Color(HOVER_COLOR) },
        uSelectedColor: { value: new Color(SELECTED_COLOR) },
      },
      vertexShader: CAPITALS_VERTEX_SHADER,
      fragmentShader: CAPITALS_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });

    this.points = new Points(this.geometry, this.material);
    this.points.name = 'capitals-layer';
    this.points.frustumCulled = false;
    this.points.visible = false;
    // Hover/click are resolved by the layer itself; never let globe.gl picking see these points
    this.points.raycast = () => undefined;
    this.points.onBeforeRender = (renderer, _scene, camera) => this.beforeRender(renderer, camera);

    try {
      this.scene?.add(this.points);
    } catch {
      // Mock environment without a real scene
    }

    this.bindPointer();
    this.unsubscribe = this.store.subscribe(
      s => ({ hov: s.hovered?.id ?? null, sel: s.selection?.id ?? null }),
      () => this.updateStates(),
      (a, b) => a.hov === b.hov && a.sel === b.sel,
    );
  }

  public getMesh(): Points {
    return this.points;
  }

  public getMaterial(): ShaderMaterial {
    return this.material;
  }

  public getItemCount(): number {
    return this.items.length;
  }

  /** Replaces the capitals shown by this layer (empty array hides the layer). */
  public setFeatures(features: readonly GeoFeature[]): void {
    this.geometry.dispose();
    this.geometry = new BufferGeometry();

    const count = features.length;
    const positions = new Float32Array(count * 3);
    const ranks = new Float32Array(count);
    const states = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    this.items = features.map((feature, i) => {
      const coords = feature.geometry.coordinates as number[];
      const lng = Number(coords[0] ?? 0);
      const lat = Number(coords[1] ?? 0);
      const position = latLngToVector(lat, lng, this.globeRadius * (1 + CAPITAL_ALTITUDE));
      positions.set([position.x, position.y, position.z], i * 3);
      const population = feature.properties.rank?.population ?? feature.properties.population;
      const rankScale = computeRankScale(population, this.params);
      ranks[i] = rankScale;
      return { feature, position, unit: position.clone().normalize(), rankScale };
    });

    this.geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.geometry.setAttribute('aRank', new BufferAttribute(ranks, 1));
    this.geometry.setAttribute('aState', new BufferAttribute(states, 1));
    this.geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
    this.points.geometry = this.geometry;
    this.points.visible = count > 0;

    this.writeColors();
    this.updateStates();
    this.lastUpdate = 0;
  }

  public getContainer(): HTMLElement | null {
    return this.container;
  }

  /** Recomputes per-capital radius scales (after `rankScaleMin/Max` changed). */
  public refreshRankScales(): void {
    const attr = this.geometry.getAttribute('aRank') as BufferAttribute | undefined;
    if (!attr) return;
    this.items.forEach((item, i) => {
      const population =
        item.feature.properties.rank?.population ?? item.feature.properties.population;
      item.rankScale = computeRankScale(population, this.params);
      attr.setX(i, item.rankScale);
    });
    attr.needsUpdate = true;
  }

  /** Per-capital color overrides (e.g. knowledge-map mastery colors); `null` restores defaults. */
  public setColors(overrides: Record<string, string> | null): void {
    this.colorOverrides = overrides;
    this.writeColors();
  }

  /** CPU mirror of the shader: screen position and opacity of every capital. */
  public computeScreenItems(camera: Camera, width: number, height: number): ScreenCapital[] {
    camera.updateMatrixWorld();
    const camPos = camera.position;
    const camDist = camPos.length();
    const camDir = camPos.clone().normalize();
    const altitude = camDist / this.globeRadius - 1;
    const zoomFade = computeZoomFade(altitude, this.params);
    const viewportMinPx = Math.min(width, height);
    const state = this.store.get();
    const ndc = new Vector3();

    return this.items.map(item => {
      ndc.copy(item.position).project(camera);
      const id = item.feature.properties.id;
      const capState: CapitalState =
        state.selection?.id === id ? 2 : state.hovered?.id === id ? 1 : 0;
      const distPx = Math.hypot(ndc.x * 0.5 * width, ndc.y * 0.5 * height);
      const facing = computeFacing(item.unit.dot(camDir), this.globeRadius, camDist);
      return {
        id,
        x: (ndc.x * 0.5 + 0.5) * width,
        y: (-ndc.y * 0.5 + 0.5) * height,
        distPx,
        opacity: computeCapitalOpacity(
          { distPx, viewportMinPx, rankScale: item.rankScale, zoomFade, facing, state: capState },
          this.params,
        ),
      };
    });
  }

  /** Capital under the pointer (canvas px), or null. Invisible capitals cannot be picked. */
  public pick(
    pointer: { x: number; y: number },
    camera: Camera,
    width: number,
    height: number,
  ): string | null {
    if (this.items.length === 0) return null;
    return findNearestCapital(
      this.computeScreenItems(camera, width, height),
      pointer,
      this.effectiveHitParams(camera),
    );
  }

  /** The hit radius grows with the marker so big (zoomed-in) markers stay easy to hit. */
  private effectiveHitParams(camera: Camera): SpotlightParams {
    const altitude = camera.position.length() / this.globeRadius - 1;
    const markerRadius = 0.5 * this.params.pointSize * computePointScale(altitude, this.params);
    return { ...this.params, hitRadiusPx: Math.max(this.params.hitRadiusPx, markerRadius + 4) };
  }

  private beforeRender(renderer: WebGLRenderer, camera: Camera): void {
    renderer.getSize(this.viewport);
    const u = this.material.uniforms;
    u.uPixelRatio!.value = renderer.getPixelRatio();
    u.uPointSize!.value = this.params.pointSize;
    u.uPointZoomScale!.value = this.params.pointZoomScale;
    u.uPointCloseAltitude!.value = this.params.pointScaleCloseAltitude;
    u.uZoomFullAltitude!.value = this.params.zoomFullAltitude;
    u.uFullRadius!.value = this.params.fullRadius;
    u.uFadeRadius!.value = this.params.fadeRadius;
    u.uZoomFade!.value = computeZoomFade(
      camera.position.length() / this.globeRadius - 1,
      this.params,
    );

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastUpdate >= UPDATE_INTERVAL_MS) {
      this.lastUpdate = now;
      this.update(camera);
    }
  }

  /** Throttled housekeeping: re-validation of a claimed hover after the camera moved. */
  private update(camera: Camera): void {
    if (this.items.length === 0 || this.viewport.x === 0) return;
    const items = this.computeScreenItems(camera, this.viewport.x, this.viewport.y);

    if (this.claimedId !== null) {
      const still = this.pointer.inside
        ? findNearestCapital(items, this.pointer, this.effectiveHitParams(camera))
        : null;
      if (still !== this.claimedId) this.setClaim(still);
    }
  }

  private writeColors(): void {
    const attr = this.geometry.getAttribute('aColor') as BufferAttribute | undefined;
    if (!attr) return;
    const base = new Color(BASE_COLOR);
    const tmp = new Color();
    this.items.forEach((item, i) => {
      const override = this.colorOverrides?.[item.feature.properties.id];
      const color = override ? tmp.set(override) : base;
      attr.setXYZ(i, color.r, color.g, color.b);
    });
    attr.needsUpdate = true;
  }

  private updateStates(): void {
    const attr = this.geometry.getAttribute('aState') as BufferAttribute | undefined;
    if (!attr) return;
    const { hovered, selection } = this.store.get();
    this.items.forEach((item, i) => {
      const id = item.feature.properties.id;
      attr.setX(i, selection?.id === id ? 2 : hovered?.id === id ? 1 : 0);
    });
    attr.needsUpdate = true;
  }

  private getViewportSize(): { width: number; height: number } {
    if (this.viewport.x > 0 && this.viewport.y > 0) {
      return { width: this.viewport.x, height: this.viewport.y };
    }
    const rect = this.container?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }

  private setClaim(id: string | null): void {
    if (id === this.claimedId) return;
    this.claimedId = id;
    const item = id ? this.items.find(i => i.feature.properties.id === id) : undefined;
    this.arbiter.setCapitalHover(item ? toFeatureRef(item.feature) : null);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const rect = this.container?.getBoundingClientRect();
    this.pointer.x = event.clientX - (rect?.left ?? 0);
    this.pointer.y = event.clientY - (rect?.top ?? 0);
    this.pointer.inside = true;

    const camera = this.getCamera();
    const { width, height } = this.getViewportSize();
    if (!camera || width === 0) return;
    this.setClaim(this.pick(this.pointer, camera, width, height));
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.inside = false;
    this.setClaim(null);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerDown.x = event.clientX;
    this.pointerDown.y = event.clientY;
  };

  private readonly onClick = (event: MouseEvent): void => {
    // The Moon is in front of anything behind it on screen
    if (this.claimedId === null || this.arbiter.isMoonClaimed()) return;
    const moved = Math.hypot(
      event.clientX - this.pointerDown.x,
      event.clientY - this.pointerDown.y,
    );
    if (moved > CLICK_DRAG_TOLERANCE_PX) return; // a drag, not a click
    const item = this.items.find(i => i.feature.properties.id === this.claimedId);
    if (item) {
      this.store.set({ selection: toFeatureRef(item.feature) });
    }
  };

  private bindPointer(): void {
    const el = this.container;
    if (!el) return;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('click', this.onClick);
  }

  public destroy(): void {
    const el = this.container;
    if (el) {
      el.removeEventListener('pointermove', this.onPointerMove);
      el.removeEventListener('pointerleave', this.onPointerLeave);
      el.removeEventListener('pointerdown', this.onPointerDown);
      el.removeEventListener('click', this.onClick);
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.setClaim(null);
    try {
      this.scene?.remove(this.points);
    } catch {
      // Mock environment
    }
    this.geometry.dispose();
    this.material.dispose();
    this.items = [];
  }
}
