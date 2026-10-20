import type { Store, AppState } from '@/state/types';
import { t, setLocale, getLocale } from '@/i18n';
import type { I18nKey } from '@/i18n';
import { getLayerColor } from './sidebar';

/** Translated feature kind, or an empty string for kinds without a dictionary entry. */
function getKindLabel(kind: string | undefined): string {
  if (!kind) return '';
  const key = `quiz.categories.${kind}` as I18nKey;
  const label = t(key);
  return label === key ? '' : label;
}

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
      s => ({ hovered: s.hovered, mode: s.mode, locale: s.locale }),
      ({ hovered, mode, locale }) => {
        if (!hovered || mode === 'quiz') {
          this.element.classList.add('hidden');
        } else {
          const color = getLayerColor(hovered.layerId);
          this.dot.style.backgroundColor = color;
          this.dot.style.color = color;
          const activeLocale = locale ?? 'pl';
          if (getLocale() !== activeLocale) {
            setLocale(activeLocale);
          }
          const name = activeLocale === 'en' ? hovered.name_en : hovered.name_pl;
          this.label.textContent = name ?? hovered.name_pl ?? hovered.name_en ?? hovered.id;
          this.kind.textContent = getKindLabel(hovered.kind);
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
