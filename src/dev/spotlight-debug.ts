import type { SpotlightParams } from '@/globe/capitals-spotlight';

/**
 * Dev-only overlay drawing the spotlight circles on the globe: solid = fully opaque radius,
 * dashed = fade-out radius (for a rank scale of 1; bigger cities reach further).
 */
export class SpotlightDebugOverlay {
  public readonly element: HTMLElement;
  private readonly full: HTMLElement;
  private readonly fade: HTMLElement;
  private rafId: number | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly params: SpotlightParams,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'tl-dev-spotlight';
    Object.assign(this.element.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      display: 'none',
    });
    this.full = this.circle('2px solid rgba(255, 220, 100, 0.8)');
    this.fade = this.circle('2px dashed rgba(255, 220, 100, 0.5)');
    this.element.append(this.full, this.fade);
    container.appendChild(this.element);
  }

  private circle(border: string): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      borderRadius: '50%',
      border,
      transform: 'translate(-50%, -50%)',
      boxSizing: 'border-box',
    });
    return el;
  }

  /** Sizes the circles from the current container size and parameters. */
  public update(): void {
    const rect = this.container.getBoundingClientRect();
    const min = Math.min(rect.width, rect.height);
    for (const [el, radius] of [
      [this.full, this.params.fullRadius],
      [this.fade, this.params.fadeRadius],
    ] as const) {
      el.style.width = el.style.height = `${2 * radius * min}px`;
    }
  }

  public isVisible(): boolean {
    return this.element.style.display !== 'none';
  }

  public setVisible(visible: boolean): void {
    this.element.style.display = visible ? 'block' : 'none';
    if (visible && this.rafId === null && typeof requestAnimationFrame !== 'undefined') {
      const loop = (): void => {
        this.update();
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    } else if (!visible && this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (visible) this.update();
  }

  public destroy(): void {
    this.setVisible(false);
    this.element.remove();
  }
}
