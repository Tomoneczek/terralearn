import { PerspectiveCamera, Vector3, type Camera } from 'three';
import { GLOBE_RADIUS } from '@/geo/astro';
import { getLocale, setLocale, t } from '@/i18n';
import type { Store, AppState } from '@/state/types';
import { CLICK_DRAG_TOLERANCE_PX } from './capitals-layer';
import { MOON_RADIUS_SCENE } from './day-night';
import type { HoverArbiter } from './hover-arbiter';
import type { MoonController } from './moon';

export interface MoonLabelParams {
  /** Within this cursor distance (px) the label is fully opaque. */
  nearPx: number;
  /** Beyond this cursor distance (px) the label rests at `minOpacity`. */
  farPx: number;
  /** Resting opacity far from the cursor (0 = only appears near the cursor). */
  minOpacity: number;
  /** The label is only shown while the Moon's on-screen radius is below this (px). */
  maxRadiusPx: number;
}

export const DEFAULT_MOON_LABEL_PARAMS: MoonLabelParams = {
  nearPx: 60,
  farPx: 260,
  minOpacity: 0.25,
  maxRadiusPx: 16,
};

/** Minimum hit radius around the Moon's center (px), so a few-pixel Moon is still clickable. */
export const MOON_MIN_HIT_RADIUS_PX = 18;
/** Extra hit margin around the Moon's on-screen disc (px). */
export const MOON_HIT_MARGIN_PX = 6;

export interface MoonScreenState {
  /** Center in container pixels. */
  x: number;
  y: number;
  /** Radius of the disc on screen, px. */
  radiusPx: number;
  /** Moon visible to the camera: in front of it, inside the viewport and not behind the globe. */
  targetable: boolean;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const k = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return k * k * (3 - 2 * k);
}

/**
 * Label opacity for a cursor `distancePx` away from the Moon: 1 within `nearPx`, easing down to
 * `minOpacity` at `farPx`. Without a hovering pointer (touch screens) the label stays opaque;
 * `distancePx = null` means the pointer is outside the globe.
 */
export function moonLabelOpacity(
  distancePx: number | null,
  params: MoonLabelParams,
  hoverCapable = true,
): number {
  if (!hoverCapable) return 1;
  if (distancePx === null) return params.minOpacity;
  const proximity = 1 - smoothstep(params.nearPx, params.farPx, distancePx);
  return params.minOpacity + (1 - params.minOpacity) * proximity;
}

/** True when the segment from `from` to `to` passes through the Earth sphere. */
export function isBehindEarth(from: Vector3, to: Vector3, earthRadius = GLOBE_RADIUS): boolean {
  const dir = to.clone().sub(from);
  const length = dir.length();
  dir.divideScalar(length);
  const along = -from.dot(dir);
  if (along <= 0 || along >= length) return false;
  return from.lengthSq() - along * along < earthRadius * earthRadius;
}

/** Projects the Moon (center + radius) into container pixels for `camera`. */
export function projectMoon(
  center: Vector3,
  radius: number,
  camera: Camera,
  width: number,
  height: number,
): MoonScreenState {
  const inView = center.clone().applyMatrix4(camera.matrixWorldInverse);
  const ndc = center.clone().project(camera);
  const x = ((ndc.x + 1) / 2) * width;
  const y = ((1 - ndc.y) / 2) * height;

  const distance = camera.position.distanceTo(center);
  const fov = camera instanceof PerspectiveCamera ? camera.fov : 50;
  const angularRadius = Math.asin(Math.min(1, radius / distance));
  const radiusPx = (Math.tan(angularRadius) / Math.tan((fov * Math.PI) / 360)) * (height / 2);

  const inFront = inView.z < 0;
  const onScreen =
    x >= -radiusPx && x <= width + radiusPx && y >= -radiusPx && y <= height + radiusPx;
  const targetable = inFront && onScreen && !isBehindEarth(camera.position, center);
  return { x, y, radiusPx, targetable };
}

export interface MoonLabelOptions {
  container: HTMLElement;
  store: Store<AppState>;
  moon: MoonController;
  arbiter: HoverArbiter;
  getCamera: () => Camera | null;
  params?: Partial<MoonLabelParams>;
  /** Whether the primary pointer can hover; defaults to `(hover: hover)`. */
  hoverCapable?: boolean;
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
}

/**
 * Screen-space companion of the Moon: a "MOON" reticle label shown while the Moon is drawn at
 * real scale (a few pixels), fading in as the cursor approaches, plus the Moon's hit test (hover
 * claim and click → opens the Moon panel). An HTML overlay rather than WebGL text: crisp type,
 * CSS animation, keyboard and screen-reader access.
 */
export class MoonLabel {
  public readonly params: MoonLabelParams;
  public readonly element: HTMLElement;
  private readonly text: HTMLElement;
  private readonly container: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly moon: MoonController;
  private readonly arbiter: HoverArbiter;
  private readonly getCamera: () => Camera | null;
  private readonly hoverCapable: boolean;
  private readonly requestFrame: (cb: FrameRequestCallback) => number;
  private readonly cancelFrame: (id: number) => void;
  private readonly unsubs: (() => void)[] = [];
  private pointer: { x: number; y: number } | null = null;
  private readonly pointerDown = { x: 0, y: 0 };
  private hovered = false;
  private frameId: number | null = null;
  private screen: MoonScreenState | null = null;
  // Infinity (not NaN) so the first frame always writes: NaN never exceeds a threshold
  private last = { x: Infinity, y: Infinity, opacity: Infinity, shown: false, near: false };

  constructor(options: MoonLabelOptions) {
    this.container = options.container;
    this.store = options.store;
    this.moon = options.moon;
    this.arbiter = options.arbiter;
    this.getCamera = options.getCamera;
    this.params = { ...DEFAULT_MOON_LABEL_PARAMS, ...options.params };
    this.hoverCapable =
      options.hoverCapable ??
      (typeof window.matchMedia === 'function'
        ? window.matchMedia('(hover: hover)').matches
        : true);
    this.requestFrame = options.requestFrame ?? (cb => window.requestAnimationFrame(cb));
    this.cancelFrame = options.cancelFrame ?? (id => window.cancelAnimationFrame(id));

    this.element = document.createElement('div');
    this.element.className = 'tl-moon-label';
    this.element.setAttribute('role', 'button');
    this.element.tabIndex = -1;
    const reticle = document.createElement('div');
    reticle.className = 'tl-moon-reticle';
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
      const span = document.createElement('span');
      span.className = `tl-moon-corner tl-moon-corner--${corner}`;
      reticle.appendChild(span);
    }
    this.text = document.createElement('span');
    this.text.className = 'tl-moon-label-text';
    this.element.append(reticle, this.text);
    this.syncTexts();
    this.container.appendChild(this.element);

    this.element.addEventListener('click', this.onLabelClick);
    this.element.addEventListener('keydown', this.onLabelKey);
    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerleave', this.onPointerLeave);
    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('click', this.onContainerClick);
    this.unsubs.push(
      this.store.subscribe(
        s => s.locale,
        () => this.syncTexts(),
      ),
    );

    this.frameId = this.requestFrame(this.onFrame);
  }

  /** Last projected Moon state (null before the first frame or without a camera). */
  public getScreenState(): MoonScreenState | null {
    return this.screen;
  }

  public isHovered(): boolean {
    return this.hovered;
  }

  /** True when the label itself (not just the hit test) is currently shown. */
  public isShown(): boolean {
    return this.last.shown;
  }

  /** Recomputes the projection, hover claim and label style; called every animation frame. */
  public update(): void {
    const camera = this.getCamera();
    const mesh = this.moon.getMesh();
    const rect = this.container.getBoundingClientRect();
    if (!camera || !mesh.visible || rect.width === 0) {
      this.screen = null;
      this.setHovered(false);
      this.applyStyle(false, 0, 0, 0, false);
      return;
    }

    const radius = MOON_RADIUS_SCENE * this.moon.getScale();
    this.screen = projectMoon(mesh.position, radius, camera, rect.width, rect.height);
    const { x, y, radiusPx, targetable } = this.screen;

    const distance = this.pointer ? Math.hypot(this.pointer.x - x, this.pointer.y - y) : null;
    const hitRadius = Math.max(radiusPx + MOON_HIT_MARGIN_PX, MOON_MIN_HIT_RADIUS_PX);
    this.setHovered(targetable && distance !== null && distance <= hitRadius);

    const shown =
      targetable && this.store.get().moonScale === 1 && radiusPx < this.params.maxRadiusPx;
    const opacity = moonLabelOpacity(distance, this.params, this.hoverCapable);
    const near = distance !== null && distance <= this.params.nearPx;
    this.applyStyle(shown, x, y, opacity, near || this.hovered);
  }

  private applyStyle(shown: boolean, x: number, y: number, opacity: number, near: boolean): void {
    const last = this.last;
    if (shown !== last.shown) {
      this.element.classList.toggle('is-shown', shown);
      this.element.tabIndex = shown ? 0 : -1;
      last.shown = shown;
    }
    if (!shown) return;
    if (Math.abs(x - last.x) > 0.5 || Math.abs(y - last.y) > 0.5) {
      this.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      last.x = x;
      last.y = y;
    }
    if (Math.abs(opacity - last.opacity) > 0.01) {
      this.element.style.opacity = opacity.toFixed(2);
      last.opacity = opacity;
    }
    if (near !== last.near) {
      this.element.classList.toggle('is-near', near);
      last.near = near;
    }
  }

  private setHovered(hovered: boolean): void {
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.arbiter.setMoonHover(hovered);
  }

  private syncTexts(): void {
    const { locale } = this.store.get();
    if (getLocale() !== locale) setLocale(locale);
    this.text.textContent = t('moon.name');
    this.element.setAttribute('aria-label', t('moon.openPanel'));
  }

  private open(): void {
    this.store.set({ moonPanelOpen: true, selection: null });
  }

  private readonly onFrame = (): void => {
    this.update();
    this.frameId = this.requestFrame(this.onFrame);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const rect = this.container.getBoundingClientRect();
    this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  private readonly onPointerLeave = (): void => {
    this.pointer = null;
    this.setHovered(false);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerDown.x = event.clientX;
    this.pointerDown.y = event.clientY;
  };

  private readonly onContainerClick = (event: MouseEvent): void => {
    if (!this.hovered) return;
    const moved = Math.hypot(
      event.clientX - this.pointerDown.x,
      event.clientY - this.pointerDown.y,
    );
    if (moved > CLICK_DRAG_TOLERANCE_PX) return; // a drag, not a click
    this.open();
  };

  private readonly onLabelClick = (event: MouseEvent): void => {
    // Handled here so the container's hit test does not open the panel a second time
    event.stopPropagation();
    this.open();
  };

  private readonly onLabelKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open();
    }
  };

  public destroy(): void {
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
    this.unsubs.forEach(unsub => unsub());
    this.unsubs.length = 0;
    this.element.removeEventListener('click', this.onLabelClick);
    this.element.removeEventListener('keydown', this.onLabelKey);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('click', this.onContainerClick);
    this.setHovered(false);
    this.element.remove();
  }
}
