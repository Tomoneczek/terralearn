import type { Store, AppState } from '@/state/types';
import { LAYER_DEFINITIONS } from '@/layers/registry';
import { t } from '@/i18n';
import { getLayerColor } from './sidebar';

export interface LegendOverlayOptions {
  container: HTMLElement;
  store: Store<AppState>;
}

export class LegendOverlay {
  public readonly element: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly itemsContainer: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private isCollapsed = false;

  constructor(options: LegendOverlayOptions) {
    this.store = options.store;

    this.element = document.createElement('div');
    this.element.className = 'tl-legend-card';
    this.element.setAttribute('aria-label', t('legend.title'));

    const header = document.createElement('div');
    header.className = 'tl-legend-header';

    const title = document.createElement('span');
    title.className = 'tl-legend-title';
    title.textContent = t('legend.title');

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'tl-legend-toggle';
    toggleBtn.setAttribute('aria-label', t('legend.toggle'));
    toggleBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    toggleBtn.addEventListener('click', () => {
      this.isCollapsed = !this.isCollapsed;
      this.element.classList.toggle('collapsed', this.isCollapsed);
    });

    header.appendChild(title);
    header.appendChild(toggleBtn);
    this.element.appendChild(header);

    this.itemsContainer = document.createElement('div');
    this.itemsContainer.className = 'tl-legend-items';
    this.element.appendChild(this.itemsContainer);

    options.container.appendChild(this.element);

    this.bindStore();
    this.renderItems();
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => s.layers,
      () => {
        this.renderItems();
      },
    );
  }

  private renderItems(): void {
    this.itemsContainer.innerHTML = '';
    const state = this.store.get();

    const activeLayers = LAYER_DEFINITIONS.filter(def => state.layers[def.id]?.enabled);
    if (activeLayers.length === 0) {
      this.element.classList.add('empty');
      return;
    }
    this.element.classList.remove('empty');

    for (const def of activeLayers) {
      const row = document.createElement('div');
      row.className = 'tl-legend-row';

      const dot = document.createElement('span');
      dot.className = 'tl-layer-dot';
      const color = getLayerColor(def.id);
      dot.style.backgroundColor = color;
      dot.style.color = color;

      const label = document.createElement('span');
      label.className = 'tl-legend-label';
      label.textContent = t(def.labelKey);

      row.appendChild(dot);
      row.appendChild(label);
      this.itemsContainer.appendChild(row);
    }
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.element.remove();
  }
}
