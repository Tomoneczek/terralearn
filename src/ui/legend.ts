import type { Store, AppState } from '@/state/types';
import { LAYER_DEFINITIONS } from '@/layers/registry';
import { SRS_STATUS_COLORS } from '@/layers/styles';
import { loadSrsState } from '@/quiz/srs';
import { t, type I18nKey } from '@/i18n';
import { getLayerColor } from './sidebar';

export interface LegendOverlayOptions {
  container: HTMLElement;
  store: Store<AppState>;
}

export class LegendOverlay {
  public readonly element: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly itemsContainer: HTMLElement;
  private readonly unsubs: (() => void)[] = [];
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
    const unsubStore = this.store.subscribe(
      s => ({
        layers: s.layers,
        knowledgeMap: s.knowledgeMap,
      }),
      () => {
        this.renderItems();
      },
    );
    this.unsubs.push(unsubStore);

    const handleSrsUpdated = (): void => {
      if (this.store.get().knowledgeMap) {
        this.renderItems();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('tl-srs-updated', handleSrsUpdated);
      this.unsubs.push(() => window.removeEventListener('tl-srs-updated', handleSrsUpdated));
    }
  }

  private renderItems(): void {
    this.itemsContainer.innerHTML = '';
    const state = this.store.get();

    if (state.knowledgeMap) {
      this.element.classList.remove('empty');

      const srsHeader = document.createElement('div');
      srsHeader.className = 'tl-legend-section-title';
      srsHeader.textContent = t('knowledgeMap.legendTitle');
      this.itemsContainer.appendChild(srsHeader);

      const srsStatuses: { labelKey: I18nKey; color: string }[] = [
        { labelKey: 'knowledgeMap.statusMastered', color: SRS_STATUS_COLORS.mastered.fill },
        { labelKey: 'knowledgeMap.statusLearning', color: SRS_STATUS_COLORS.learning.fill },
        { labelKey: 'knowledgeMap.statusDue', color: SRS_STATUS_COLORS.due.fill },
        { labelKey: 'knowledgeMap.statusDifficult', color: SRS_STATUS_COLORS.difficult.fill },
      ];

      for (const item of srsStatuses) {
        const row = document.createElement('div');
        row.className = 'tl-legend-row';

        const dot = document.createElement('span');
        dot.className = 'tl-layer-dot';
        dot.style.backgroundColor = item.color;
        dot.style.color = item.color;

        const label = document.createElement('span');
        label.className = 'tl-legend-label';
        label.textContent = t(item.labelKey);

        row.appendChild(dot);
        row.appendChild(label);
        this.itemsContainer.appendChild(row);
      }

      // Stats counter
      const srsState = loadSrsState();
      const allItems = Object.values(srsState);
      const masteredCount = allItems.filter(it => it.box === 5).length;
      const totalCount = allItems.length;

      const statsEl = document.createElement('div');
      statsEl.className = 'tl-legend-stats';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = `${t('knowledgeMap.statusMastered')}:`;
      const valSpan = document.createElement('span');
      valSpan.className = 'tl-legend-stats-val';
      valSpan.textContent = `${masteredCount} / ${totalCount}`;
      statsEl.appendChild(labelSpan);
      statsEl.appendChild(valSpan);
      this.itemsContainer.appendChild(statsEl);

      const activeLayers = LAYER_DEFINITIONS.filter(def => state.layers[def.id]?.enabled);
      if (activeLayers.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'tl-legend-divider';
        this.itemsContainer.appendChild(divider);

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
      return;
    }

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
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs.length = 0;
    this.element.remove();
  }
}
