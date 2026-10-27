/**
 * Lets the user move a floating panel by dragging its header, so it does not cover the globe.
 *
 * - The offset is applied with the CSS `translate` property, which composes with the panel's
 *   own `transform` (centring, enter animations) instead of overriding it.
 * - Events are delegated on the panel, because panels rebuild their content on every render.
 * - The panel always stays inside the viewport; the offset is remembered per panel and a
 *   double click on the header resets it.
 * - On narrow screens (mobile layout) dragging is disabled and the offset is not applied.
 */

export interface DraggableOptions {
  /** Selector of the drag handle inside the panel (usually its header). */
  handle: string;
  /** localStorage key for the remembered offset. */
  storageKey: string;
  /** Media query under which dragging is disabled. */
  disabledQuery?: string;
}

export interface DraggableController {
  reset(): void;
  destroy(): void;
}

interface Offset {
  x: number;
  y: number;
}

/** Interactive elements inside the handle keep their own behaviour (close buttons, inputs). */
const INTERACTIVE = 'button, a, input, select, textarea, [role="button"]';

/** Gap kept between the panel and the viewport edge, in CSS px. */
export const VIEWPORT_MARGIN = 8;

export const DRAGGABLE_CLASS = 'tl-draggable';
export const DRAGGING_CLASS = 'tl-dragging';

function readOffset(key: string): Offset {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { x: 0, y: 0 };
    const parsed = JSON.parse(raw) as Partial<Offset>;
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { x: 0, y: 0 };
  } catch {
    return { x: 0, y: 0 };
  }
}

function writeOffset(key: string, offset: Offset | null): void {
  try {
    if (offset) localStorage.setItem(key, JSON.stringify(offset));
    else localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable (private mode); the position is then kept for the session only.
  }
}

/**
 * Clamps an offset so that the panel (whose rect at offset 0 is `base`) stays in the viewport.
 * A panel larger than the viewport is aligned to its top-left edge.
 */
export function clampOffset(
  offset: Offset,
  base: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
  margin = VIEWPORT_MARGIN,
): Offset {
  const clampAxis = (value: number, start: number, size: number, limit: number) => {
    const min = margin - start;
    const max = limit - margin - (start + size);
    return max < min ? min : Math.min(max, Math.max(min, value));
  };
  return {
    x: clampAxis(offset.x, base.left, base.width, viewport.width),
    y: clampAxis(offset.y, base.top, base.height, viewport.height),
  };
}

export function makeDraggable(panel: HTMLElement, options: DraggableOptions): DraggableController {
  const { handle, storageKey, disabledQuery = '(max-width: 900px)' } = options;
  const media =
    typeof window.matchMedia === 'function' ? window.matchMedia(disabledQuery) : undefined;

  let offset = readOffset(storageKey);
  let drag: { pointerId: number; startX: number; startY: number; origin: Offset } | null = null;

  const enabled = () => !media?.matches;

  /** Rect of the panel without the current offset. */
  const baseRect = () => {
    const rect = panel.getBoundingClientRect();
    return {
      left: rect.left - offset.x,
      top: rect.top - offset.y,
      width: rect.width,
      height: rect.height,
    };
  };

  const apply = () => {
    panel.classList.toggle(DRAGGABLE_CLASS, enabled());
    panel.style.translate =
      enabled() && (offset.x || offset.y) ? `${offset.x}px ${offset.y}px` : '';
  };

  /** Keeps a remembered position on screen (hidden panels have an empty rect and are skipped). */
  const keepInViewport = () => {
    if (!enabled()) return;
    const base = baseRect();
    if (base.width === 0 && base.height === 0) return;
    const clamped = clampOffset(offset, base, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    if (clamped.x !== offset.x || clamped.y !== offset.y) {
      offset = clamped;
      apply();
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!enabled() || e.button !== 0) return;
    const target = e.target as Element | null;
    if (!target?.closest(handle) || target.closest(INTERACTIVE)) return;
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origin: { ...offset } };
    panel.setPointerCapture?.(e.pointerId);
    panel.classList.add(DRAGGING_CLASS);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const base = baseRect();
    offset = clampOffset(
      { x: drag.origin.x + e.clientX - drag.startX, y: drag.origin.y + e.clientY - drag.startY },
      base,
      { width: window.innerWidth, height: window.innerHeight },
    );
    apply();
  };

  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    panel.releasePointerCapture?.(e.pointerId);
    panel.classList.remove(DRAGGING_CLASS);
    drag = null;
    writeOffset(storageKey, offset);
  };

  const reset = () => {
    offset = { x: 0, y: 0 };
    writeOffset(storageKey, null);
    apply();
  };

  const onDoubleClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!enabled() || !target?.closest(handle) || target.closest(INTERACTIVE)) return;
    reset();
  };

  // Panels show and hide by toggling classes; re-check the position whenever they appear.
  const visibilityObserver =
    typeof MutationObserver === 'function'
      ? new MutationObserver(() => keepInViewport())
      : undefined;
  visibilityObserver?.observe(panel, { attributes: true, attributeFilter: ['class'] });

  panel.addEventListener('pointerdown', onPointerDown);
  panel.addEventListener('pointermove', onPointerMove);
  panel.addEventListener('pointerup', endDrag);
  panel.addEventListener('pointercancel', endDrag);
  panel.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('resize', keepInViewport);
  media?.addEventListener?.('change', apply);
  apply();

  return {
    reset,
    destroy() {
      visibilityObserver?.disconnect();
      panel.removeEventListener('pointerdown', onPointerDown);
      panel.removeEventListener('pointermove', onPointerMove);
      panel.removeEventListener('pointerup', endDrag);
      panel.removeEventListener('pointercancel', endDrag);
      panel.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('resize', keepInViewport);
      media?.removeEventListener?.('change', apply);
    },
  };
}
