import type { AppState, Store } from '@/state/types';
import { shallowEqual } from '@/state/store';
import { t, setLocale, getLocale, type I18nKey } from '@/i18n';
import {
  CATEGORY_METRIC,
  RANKING_CATEGORIES,
  isRowDrawn,
  loadRankings,
  maxValue,
  rowCountries,
  rowName,
  selectRows,
  type RankingCategory,
  type RankingRow,
  type RankingsData,
  type SortDir,
  type SortKey,
} from '@/rankings';
import { makeDraggable, type DraggableController } from './draggable';
import { formatNumber, kindLabel } from './facts-format';

/** Rows rendered at once; "Show more" adds another page. Enough without virtualisation. */
export const RANKINGS_PAGE_SIZE = 100;

/** Categories with a footnote about what the list contains. */
const CATEGORY_NOTES: Partial<Record<RankingCategory, I18nKey>> = {
  countriesTopN: 'rankings.notes.countriesTopN',
  countriesPopulation: 'rankings.notes.countriesPopulation',
  cities: 'rankings.notes.cities',
  countryCities: 'rankings.notes.countryCities',
  deserts: 'rankings.notes.deserts',
};

const DEFAULT_DIR: Record<SortKey, SortDir> = { order: 'asc', name: 'asc', value: 'desc' };

export interface RankingsPanelOptions {
  container: HTMLElement;
  store: Store<AppState>;
  /** Shows the row's object on the globe (see `locateRow`). */
  onLocate: (row: RankingRow, category: RankingCategory) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Floating, draggable table of the biggest objects per category (lakes, rivers, ...). A row's
 * "locate" button flies to the object and selects it. Data comes from `rankings.json`, loaded
 * the first time the panel opens.
 */
export class RankingsPanel {
  public readonly element: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly onLocate: RankingsPanelOptions['onLocate'];
  private readonly draggable: DraggableController;
  private readonly unsubs: (() => void)[] = [];

  private data: RankingsData | null = null;
  private status: 'idle' | 'loading' | 'error' = 'idle';
  private sortBy: SortKey = 'order';
  private dir: SortDir = 'asc';
  private filter = '';
  private visible = RANKINGS_PAGE_SIZE;
  private renderedCategory: RankingCategory | null = null;

  private readonly body = el('div', 'tl-rankings-body');

  constructor(options: RankingsPanelOptions) {
    this.store = options.store;
    this.onLocate = options.onLocate;

    this.element = el('section', 'tl-info-card tl-rankings hidden');
    this.element.setAttribute('role', 'dialog');
    this.draggable = makeDraggable(this.element, {
      handle: '.tl-rankings-header',
      storageKey: 'terralearn_panel_pos_rankings',
    });
    options.container.appendChild(this.element);

    this.unsubs.push(
      this.store.subscribe(
        s => ({
          open: s.rankingsPanelOpen,
          category: s.rankingsCategory,
          locale: s.locale,
          mode: s.mode,
        }),
        (next, prev) => {
          if (next.category !== prev.category) this.resetView();
          this.sync();
        },
        shallowEqual,
      ),
      // Marks of rows drawn on the globe / selected follow the layers and the selection
      this.store.subscribe(
        s => ({ layers: s.layers, selection: s.selection?.id ?? null }),
        () => this.renderRows(),
        shallowEqual,
      ),
    );
    window.addEventListener('keydown', this.onKeyDown);
    this.sync();
  }

  public isOpen(): boolean {
    return !this.element.classList.contains('hidden');
  }

  public close(): void {
    this.store.set({ rankingsPanelOpen: false });
  }

  public destroy(): void {
    this.unsubs.forEach(unsub => unsub());
    window.removeEventListener('keydown', this.onKeyDown);
    this.draggable.destroy();
    this.element.remove();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.isOpen()) this.close();
  };

  private resetView(): void {
    this.sortBy = 'order';
    this.dir = 'asc';
    this.filter = '';
    this.visible = RANKINGS_PAGE_SIZE;
  }

  private sync(): void {
    const { rankingsPanelOpen, mode, locale } = this.store.get();
    if (!rankingsPanelOpen || mode === 'quiz') {
      this.element.classList.add('hidden');
      return;
    }
    if (getLocale() !== locale) setLocale(locale);
    // Visible first: the rows are only drawn for an open panel
    this.element.classList.remove('hidden');
    this.renderShell();
    if (!this.data && this.status !== 'loading') void this.load();
  }

  private async load(): Promise<void> {
    this.status = 'loading';
    this.renderBody();
    try {
      this.data = await loadRankings();
      this.status = 'idle';
    } catch (err) {
      console.warn('[RankingsPanel] Could not load rankings.json:', err);
      this.status = 'error';
    }
    if (this.isOpen()) this.renderBody();
  }

  // --- rendering ---------------------------------------------------------------------------

  /** Header, category buttons and filter; rebuilt on open, category and language changes. */
  private renderShell(): void {
    const category = this.store.get().rankingsCategory;
    this.element.setAttribute('aria-label', t('rankings.title'));
    this.element.replaceChildren();

    const header = el('header', 'tl-card-header tl-rankings-header');
    const title = el('h2', 'tl-card-title', t('rankings.title'));
    const closeBtn = el('button', 'tl-card-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', t('rankings.close'));
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());
    header.append(title, closeBtn);

    const tabs = el('div', 'tl-rankings-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', t('rankings.tabsAria'));
    for (const id of RANKING_CATEGORIES) {
      const tab = el('button', 'tl-rankings-tab', t(`rankings.categories.${id}` as I18nKey));
      tab.type = 'button';
      tab.dataset.category = id;
      tab.setAttribute('aria-pressed', String(id === category));
      tab.addEventListener('click', () => this.store.set({ rankingsCategory: id }));
      tabs.appendChild(tab);
    }

    const filter = el('input', 'tl-rankings-filter');
    filter.type = 'search';
    filter.value = this.filter;
    filter.placeholder = t('rankings.filterPlaceholder');
    filter.setAttribute('aria-label', t('rankings.filterAria'));
    filter.addEventListener('input', () => {
      this.filter = filter.value;
      this.visible = RANKINGS_PAGE_SIZE;
      this.renderRows();
    });

    this.element.append(header, tabs, filter, this.body);
    this.renderedCategory = category;
    this.renderBody();
  }

  private renderBody(): void {
    this.body.replaceChildren();
    if (this.status === 'loading' || (!this.data && this.status === 'idle')) {
      this.body.appendChild(el('p', 'tl-rankings-status', t('rankings.loading')));
      return;
    }
    if (!this.data) {
      const msg = el('p', 'tl-rankings-status', t('rankings.loadError'));
      const retry = el('button', 'tl-rankings-more', t('rankings.retry'));
      retry.type = 'button';
      retry.addEventListener('click', () => void this.load());
      this.body.append(msg, retry);
      return;
    }
    this.renderRows();
  }

  private valueHeader(category: RankingCategory): string {
    const metric = CATEGORY_METRIC[category];
    if (metric === 'area') return t('card.area');
    if (metric === 'population') return t('card.population');
    if (metric === 'length') return t('card.length');
    return category === 'mountains' ? t('card.maxElevation') : t('card.elevation');
  }

  private formatValue(category: RankingCategory, value: number | null): string {
    if (value === null) return '—';
    return t(`card.values.${CATEGORY_METRIC[category]}` as I18nKey, { value: formatNumber(value) });
  }

  private sortHeader(key: SortKey, label: string): HTMLTableCellElement {
    const th = el('th');
    th.scope = 'col';
    const active = this.sortBy === key;
    th.setAttribute(
      'aria-sort',
      active ? (this.dir === 'asc' ? 'ascending' : 'descending') : 'none',
    );
    const btn = el('button', 'tl-rankings-sort', label);
    btn.type = 'button';
    btn.title = t('rankings.sortBy', { column: label });
    btn.dataset.sort = key;
    if (active) btn.append(el('span', 'tl-rankings-arrow', this.dir === 'asc' ? ' ▲' : ' ▼'));
    btn.addEventListener('click', () => {
      if (this.sortBy === key) this.dir = this.dir === 'asc' ? 'desc' : 'asc';
      else {
        this.sortBy = key;
        this.dir = DEFAULT_DIR[key];
      }
      this.visible = RANKINGS_PAGE_SIZE;
      this.renderRows();
    });
    th.appendChild(btn);
    return th;
  }

  /** The table itself: rebuilt on sort, filter, paging, and when marks change (≤ one page). */
  private renderRows(): void {
    if (!this.data || !this.isOpen()) return;
    const state = this.store.get();
    const category = state.rankingsCategory;
    if (this.renderedCategory !== category) {
      this.renderShell();
      return;
    }
    const data = this.data;
    const locale = getLocale();
    const focused = this.focusedControl();
    const rows = selectRows(
      data,
      category,
      { sortBy: this.sortBy, dir: this.dir, filter: this.filter },
      locale,
    );
    const shown = rows.slice(0, this.visible);
    const max = maxValue(data, category);
    const hasCountries = data.categories[category].some(r => r.countries?.length);
    const hasCountryRank = data.categories[category].some(r => r.countryRank !== undefined);

    this.body.replaceChildren();
    this.body.appendChild(
      el('p', 'tl-rankings-count', t('rankings.count', { count: formatNumber(rows.length) })),
    );

    if (rows.length === 0) {
      this.body.appendChild(el('p', 'tl-rankings-status', t('rankings.empty')));
      return;
    }

    const table = el('table', 'tl-rankings-table');
    const headRow = el('tr');
    headRow.append(
      this.sortHeader('order', t('rankings.colRank')),
      this.sortHeader('name', t('rankings.colName')),
      this.sortHeader('value', this.valueHeader(category)),
    );
    if (hasCountryRank) headRow.appendChild(el('th', undefined, t('rankings.colCountryRank')));
    if (hasCountries) headRow.appendChild(el('th', undefined, t('rankings.colCountries')));
    const locateTh = el('th');
    locateTh.appendChild(el('span', 'tl-visually-hidden', t('rankings.colLocate')));
    headRow.appendChild(locateTh);
    const thead = el('thead');
    thead.appendChild(headRow);

    const tbody = el('tbody');
    for (const row of shown) {
      tbody.appendChild(
        this.buildRow(row, category, data, max, { hasCountries, hasCountryRank }, state),
      );
    }
    table.append(thead, tbody);
    tbody.addEventListener('keydown', this.onRowKeyDown);
    this.body.appendChild(table);

    if (category in CATEGORY_NOTES) {
      this.body.appendChild(el('p', 'tl-rankings-note', t(CATEGORY_NOTES[category]!)));
    }

    if (rows.length > shown.length) {
      const more = el(
        'button',
        'tl-rankings-more',
        t('rankings.showMore', { count: formatNumber(rows.length - shown.length) }),
      );
      more.type = 'button';
      more.addEventListener('click', () => {
        this.visible += RANKINGS_PAGE_SIZE;
        this.renderRows();
      });
      this.body.appendChild(more);
    }

    this.restoreFocus(focused);
  }

  /** The row button or sort header holding focus, so a re-render does not drop it. */
  private focusedControl(): { rowId?: string; sort?: string } | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.body.contains(active)) return null;
    return { rowId: active.closest('tr')?.dataset.id, sort: active.dataset.sort };
  }

  private restoreFocus(focused: { rowId?: string; sort?: string } | null): void {
    if (!focused) return;
    const selector = focused.sort
      ? `[data-sort="${focused.sort}"]`
      : focused.rowId
        ? `tr[data-id="${CSS.escape(focused.rowId)}"] .tl-rankings-locate`
        : null;
    if (selector) this.body.querySelector<HTMLElement>(selector)?.focus();
  }

  private buildRow(
    row: RankingRow,
    category: RankingCategory,
    data: RankingsData,
    max: number,
    columns: { hasCountries: boolean; hasCountryRank: boolean },
    state: AppState,
  ): HTMLTableRowElement {
    const tr = el('tr', 'tl-rankings-row');
    tr.dataset.id = row.id;
    const selected = state.selection?.id === row.id;
    tr.classList.toggle('is-selected', selected);
    if (selected) tr.setAttribute('aria-current', 'true');

    const name = rowName(row, getLocale());
    const nameCell = el('td', 'tl-rankings-name');
    const drawn = isRowDrawn(row, category, state.layers);
    const dot = el('span', `tl-rankings-dot${drawn ? ' is-on' : ''}`);
    if (drawn) dot.title = t('rankings.onGlobe');
    dot.setAttribute('aria-hidden', 'true');
    nameCell.append(dot, el('span', 'tl-rankings-name-text', name));
    const parent = row.partOf
      ? data.categories[category].find(r => r.id === row.partOf)
      : undefined;
    if (parent) {
      nameCell.appendChild(
        el(
          'small',
          'tl-rankings-subtype',
          t('rankings.partOf', { name: rowName(parent, getLocale()) }),
        ),
      );
    }
    if (row.subtype)
      nameCell.appendChild(el('small', 'tl-rankings-subtype', kindLabel(undefined, row.subtype)));

    const valueCell = el('td', 'tl-rankings-value');
    valueCell.appendChild(el('span', undefined, this.formatValue(category, row.value)));
    if (row.value !== null && max > 0) {
      const bar = el('span', 'tl-rankings-bar');
      bar.style.setProperty('--w', `${Math.max(2, (row.value / max) * 100).toFixed(1)}%`);
      valueCell.appendChild(bar);
    }

    const rankCell = el('td', 'tl-rankings-rank', row.order === null ? '—' : String(row.order));
    if (row.order === null) rankCell.title = t('rankings.notCounted');
    tr.append(rankCell, nameCell, valueCell);
    if (columns.hasCountryRank) {
      tr.appendChild(el('td', 'tl-rankings-rank', row.countryRank?.toString() ?? '—'));
    }
    if (columns.hasCountries) {
      tr.appendChild(
        el('td', 'tl-rankings-countries', rowCountries(row, data, getLocale()).join(', ') || '—'),
      );
    }

    const locateCell = el('td');
    const locate = el('button', 'tl-rankings-locate', '⌖');
    locate.type = 'button';
    locate.setAttribute('aria-label', t('rankings.locate', { name }));
    locate.title = t('rankings.locate', { name });
    locate.addEventListener('click', () => this.onLocate(row, category));
    locateCell.appendChild(locate);
    tr.appendChild(locateCell);
    return tr;
  }

  /** Up / Down move between the locate buttons of the rows. */
  private readonly onRowKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const current = (event.target as Element | null)?.closest('tr');
    const next =
      event.key === 'ArrowDown' ? current?.nextElementSibling : current?.previousElementSibling;
    const button = next?.querySelector<HTMLElement>('.tl-rankings-locate');
    if (button) {
      event.preventDefault();
      button.focus();
    }
  };
}
