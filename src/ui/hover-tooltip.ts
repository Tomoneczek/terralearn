import type { Store, AppState } from '@/state/types';
import { getLayerColor } from './sidebar';

export interface HoverTooltipOptions {
  container: HTMLElement;
  store: Store<AppState>;
}

export class HoverTooltip {
  public readonly element: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly dot: HTMLElement;
  private readonly label: HTMLElement;
  private readonly kind: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private mouseX = 0;
  private mouseY = 0;
  private isDestroyed = false;

  constructor(options: HoverTooltipOptions) {
    this.store = options.store;

    this.element = document.createElement('div');
    this.element.className = 'tl-hover-tooltip hidden';

    this.dot = document.createElement('span');
    this.dot.className = 'tl-layer-dot';

    this.label = document.createElement('span');
    this.label.className = 'tl-tooltip-name';

    this.kind = document.createElement('span');
    this.kind.className = 'tl-tooltip-kind';

    this.element.appendChild(this.dot);
    this.element.appendChild(this.label);
    this.element.appendChild(this.kind);

    options.container.appendChild(this.element);

    this.bindEvents();
    this.bindStore();
  }

  private bindEvents(): void {
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isDestroyed) return;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (!this.element.classList.contains('hidden')) {
        this.updatePosition();
      }
    });
  }

  private updatePosition(): void {
    // 16px offset from cursor
    const x = this.mouseX + 16;
    const y = this.mouseY + 16;
    this.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => s.hovered,
      hovered => {
        if (!hovered) {
          this.element.classList.add('hidden');
        } else {
          const color = getLayerColor(hovered.layerId);
          this.dot.style.backgroundColor = color;
          this.dot.style.color = color;
          this.label.textContent = hovered.name_pl ?? hovered.id;
          this.kind.textContent = hovered.kind ?? '';
          this.updatePosition();
          this.element.classList.remove('hidden');
        }
      },
    );
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.element.remove();
  }
}
