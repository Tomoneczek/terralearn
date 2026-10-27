import type { Store, AppState } from '@/state/types';
import { LAYER_DEFINITIONS, type LayerDef } from '@/layers';
import { DENSITY_COLORS, densityClassLabel } from '@/globe/population-scale';
import { SRS_STATUS_COLORS } from '@/layers/styles';
import { loadSrsState } from '@/quiz/srs';
import { t, type I18nKey } from '@/i18n';
import { getLayerColor } from './sidebar';

/** Remembers whether the legend is collapsed (a per-viewer convenience, so storage may fail). */
export const LEGEND_COLLAPSED_KEY = 'terralearn_legend_collapsed';

function readCollapsed(): boolean {
  try {
    // Collapsed by default: the legend is a reference, not part of the first impression
    return window.localStorage.getItem(LEGEND_COLLAPSED_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(LEGEND_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // Storage unavailable (private mode, blocked): the choice just is not remembered
  }
}

export interface LegendOverlayOptions {
  container: HTMLElement;
  store: Store<AppState>;
}

export class LegendOverlay {
  public readonly element: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly itemsContainer: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly unsubs: (() => void)[] = [];
  private isCollapsed = readCollapsed();

  constructor(options: LegendOverlayOptions) {
    this.store = options.store;

    this.element = document.createElement('div');
    this.element.className = 'tl-legend-card';
    this.element.setAttribute('aria-label', t('legend.title'));
    this.element.classList.toggle('collapsed', this.isCollapsed);

    const header = document.createElement('div');
    header.className = 'tl-legend-header';

    const title = document.createElement('span');
    title.className = 'tl-legend-title';
    title.textContent = t('legend.title');
    this.titleEl = title;

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'tl-legend-toggle';
    toggleBtn.setAttribute('aria-label', t('legend.toggle'));
    toggleBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    toggleBtn.setAttribute('aria-expanded', String(!this.isCollapsed));
    toggleBtn.addEventListener('click', () => {
      this.isCollapsed = !this.isCollapsed;
      this.element.classList.toggle('collapsed', this.isCollapsed);
      toggleBtn.setAttribute('aria-expanded', String(!this.isCollapsed));
      writeCollapsed(this.isCollapsed);
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

  public refresh(): void {
    if (this.titleEl) {
      this.titleEl.textContent = t('legend.title');
    }
    this.element.setAttribute('aria-label', t('legend.title'));
    this.renderItems();
  }

  private bindStore(): void {
    const unsubStore = this.store.subscribe(
      s => ({
        layers: s.layers,
        knowledgeMap: s.knowledgeMap,
        locale: s.locale,
      }),
      () => {
        this.refresh();
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

  /** One legend row: color dot, layer name and (for Top-N layers) the current N. */
  private createLayerRow(def: LayerDef, state: AppState): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tl-legend-row';

    const dot = document.createElement('span');
    dot.className = 'tl-layer-dot';
    const color = getLayerColor(def.id);
    dot.style.backgroundColor = color;
    dot.style.color = color;

    const topN = def.topN ? state.layers[def.id]?.topN : undefined;
    const label = document.createElement('span');
    label.className = 'tl-legend-label';
    label.textContent =
      topN !== undefined
        ? `${t(def.labelKey)} · ${t('sliders.topPrefix')} ${topN}`
        : t(def.labelKey);

    row.appendChild(dot);
    row.appendChild(label);
    if (def.id !== 'populationDensity') return row;

    const group = document.createElement('div');
    group.className = 'tl-legend-group';
    group.appendChild(row);
    group.appendChild(this.createDensityScale());
    return group;
  }

  /** Colour classes of the population density grid (see population-scale.ts). */
  private createDensityScale(): HTMLElement {
    const scale = document.createElement('div');
    scale.className = 'tl-legend-scale';
    scale.setAttribute('aria-label', `${t('layers.populationDensity')} (${t('population.unit')})`);

    const swatches = document.createElement('div');
    swatches.className = 'tl-legend-swatches';
    DENSITY_COLORS.forEach((color, index) => {
      const swatch = document.createElement('span');
      swatch.className = 'tl-legend-swatch';
      swatch.style.backgroundColor = color;
      swatch.title = densityClassLabel(index);
      swatches.appendChild(swatch);
    });

    const caption = document.createElement('div');
    caption.className = 'tl-legend-scale-caption';
    const low = document.createElement('span');
    low.textContent = densityClassLabel(0);
    const unit = document.createElement('span');
    unit.textContent = t('population.unit');
    const high = document.createElement('span');
    high.textContent = densityClassLabel(DENSITY_COLORS.length - 1);
    caption.append(low, unit, high);

    scale.append(swatches, caption);
    return scale;
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
          this.itemsContainer.appendChild(this.createLayerRow(def, state));
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
      this.itemsContainer.appendChild(this.createLayerRow(def, state));
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
