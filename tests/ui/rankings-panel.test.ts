import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RankingsPanel, RANKINGS_PAGE_SIZE } from '@/ui/rankings-panel';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { RANKING_CATEGORIES, type RankingRow, type RankingsData } from '@/rankings/types';
import { resetRankingsCache } from '@/rankings/load';
import { setLocale } from '@/i18n';

const row = (over: Partial<RankingRow> & Pick<RankingRow, 'id' | 'order'>): RankingRow => ({
  layerOrder: over.order,
  value: 1000,
  name_pl: over.id,
  name_en: over.id,
  lat: 1,
  lng: 2,
  extentKm: 100,
  ...over,
});

const LAKES: RankingRow[] = [
  row({
    id: 'caspian',
    order: 1,
    value: 378_738,
    name_pl: 'Morze Kaspijskie',
    name_en: 'Caspian Sea',
    countries: ['RU'],
  }),
  row({
    id: 'superior',
    order: 2,
    value: 82_307,
    name_pl: 'Jezioro Górne',
    name_en: 'Superior',
    countries: ['US'],
  }),
  row({
    id: 'sniardwy',
    order: 3,
    value: 114,
    name_pl: 'Śniardwy',
    name_en: 'Sniardwy',
    countries: ['PL'],
  }),
];

function makeData(lakes: RankingRow[] = LAKES): RankingsData {
  return {
    countries: {
      RU: { pl: 'Rosja', en: 'Russia' },
      US: { pl: 'Stany Zjednoczone', en: 'United States' },
      PL: { pl: 'Polska', en: 'Poland' },
    },
    categories: {
      ...(Object.fromEntries(
        RANKING_CATEGORIES.map(c => [c, []]),
      ) as never as RankingsData['categories']),
      lakes,
    },
  };
}

async function setup(state: Partial<AppState> = {}, data: RankingsData = makeData()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => data })),
  );
  const store = createStore<AppState>({ ...createInitialState(), ...state });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const onLocate = vi.fn();
  const panel = new RankingsPanel({ container, store, onLocate });
  store.set({ rankingsPanelOpen: true });
  await vi.waitFor(() => expect(panel.element.querySelector('.tl-rankings-table')).not.toBeNull());
  return { store, panel, onLocate };
}

const names = (panel: RankingsPanel) =>
  [...panel.element.querySelectorAll('.tl-rankings-name-text')].map(n => n.textContent);

beforeEach(() => resetRankingsCache());
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  setLocale('en');
});

describe('RankingsPanel', () => {
  it('stays hidden and does not fetch until it is opened', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const store = createStore<AppState>(createInitialState());
    const panel = new RankingsPanel({ container: document.body, store, onLocate: vi.fn() });
    expect(panel.isOpen()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the rows of the current category with formatted values', async () => {
    const { panel } = await setup();
    expect(panel.isOpen()).toBe(true);
    expect(names(panel)).toEqual(['Caspian Sea', 'Superior', 'Sniardwy']);
    const values = [...panel.element.querySelectorAll('.tl-rankings-value span:first-child')].map(
      v => v.textContent,
    );
    expect(values[0]).toBe('378,738 km²');
    expect(panel.element.querySelector('.tl-rankings-countries')?.textContent).toBe('Russia');
  });

  it('uses Polish names, number format and headers after a language change', async () => {
    const { panel, store } = await setup({ locale: 'pl' });
    expect(names(panel)[0]).toBe('Morze Kaspijskie');
    expect(panel.element.textContent).toContain('378 738 km²');
    expect(panel.element.querySelector('.tl-rankings-tab[aria-pressed="true"]')?.textContent).toBe(
      'Jeziora',
    );
    store.set({ locale: 'en' });
    expect(names(panel)[0]).toBe('Caspian Sea');
  });

  it('sorts by a clicked header and reflects it in aria-sort', async () => {
    const { panel } = await setup();
    panel.element.querySelector<HTMLButtonElement>('[data-sort="name"]')!.click();
    expect(names(panel)).toEqual(['Caspian Sea', 'Sniardwy', 'Superior']);
    expect(panel.element.querySelector('th[aria-sort="ascending"]')).not.toBeNull();
    panel.element.querySelector<HTMLButtonElement>('[data-sort="name"]')!.click();
    expect(names(panel)).toEqual(['Superior', 'Sniardwy', 'Caspian Sea']);
    panel.element.querySelector<HTMLButtonElement>('[data-sort="value"]')!.click();
    expect(names(panel)[0]).toBe('Caspian Sea');
  });

  it('filters rows by text and shows an empty state', async () => {
    const { panel } = await setup();
    const input = panel.element.querySelector<HTMLInputElement>('.tl-rankings-filter')!;
    input.value = 'polska';
    input.dispatchEvent(new Event('input'));
    expect(names(panel)).toEqual(['Sniardwy']);
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    expect(panel.element.querySelector('.tl-rankings-table')).toBeNull();
    expect(panel.element.querySelector('.tl-rankings-status')?.textContent).toContain(
      'Nothing matches',
    );
  });

  it('switches category through the buttons and remembers it in the store', async () => {
    const { panel, store } = await setup();
    panel.element.querySelector<HTMLButtonElement>('[data-category="rivers"]')!.click();
    expect(store.get().rankingsCategory).toBe('rivers');
    expect(panel.element.querySelector('.tl-rankings-tab[aria-pressed="true"]')?.textContent).toBe(
      'Rivers',
    );
  });

  it('pages long lists and adds rows with "Show more"', async () => {
    const many = Array.from({ length: RANKINGS_PAGE_SIZE + 30 }, (_, i) =>
      row({ id: `lake-${i}`, order: i + 1, value: 1000 - i }),
    );
    const { panel } = await setup({}, makeData(many));
    expect(panel.element.querySelectorAll('.tl-rankings-row')).toHaveLength(RANKINGS_PAGE_SIZE);
    panel.element.querySelector<HTMLButtonElement>('.tl-rankings-more')!.click();
    expect(panel.element.querySelectorAll('.tl-rankings-row')).toHaveLength(
      RANKINGS_PAGE_SIZE + 30,
    );
    expect(panel.element.querySelector('.tl-rankings-more')).toBeNull();
  });

  it('locates the object of the clicked row', async () => {
    const { panel, onLocate } = await setup();
    panel.element
      .querySelector<HTMLButtonElement>('tr[data-id="superior"] .tl-rankings-locate')!
      .click();
    expect(onLocate).toHaveBeenCalledWith(LAKES[1], 'lakes');
  });

  it('marks rows drawn on the globe and follows the selection', async () => {
    const { panel, store } = await setup({
      layers: { ...createInitialState().layers, lakes: { enabled: true, topN: 2 } },
    });
    const dots = [...panel.element.querySelectorAll('.tl-rankings-dot')].map(d =>
      d.classList.contains('is-on'),
    );
    expect(dots).toEqual([true, true, false]);

    store.set({
      selection: { id: 'sniardwy', layerId: 'lakes', kind: 'lake', lat: 1, lng: 2 },
    });
    expect(panel.element.querySelector('tr.is-selected')?.getAttribute('data-id')).toBe('sniardwy');
  });

  it('keeps keyboard focus on the same row button across re-renders', async () => {
    const { panel, store } = await setup();
    const button = panel.element.querySelector<HTMLButtonElement>(
      'tr[data-id="superior"] .tl-rankings-locate',
    )!;
    button.focus();
    store.set({ selection: { id: 'superior', layerId: 'lakes', kind: 'lake', lat: 1, lng: 2 } });
    expect(document.activeElement?.closest('tr')?.getAttribute('data-id')).toBe('superior');
  });

  it('moves between rows with the arrow keys', async () => {
    const { panel } = await setup();
    const first = panel.element.querySelector<HTMLButtonElement>(
      'tr[data-id="caspian"] .tl-rankings-locate',
    )!;
    first.focus();
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement?.closest('tr')?.getAttribute('data-id')).toBe('superior');
  });

  it('closes with the close button and with Escape', async () => {
    const { panel, store } = await setup();
    panel.element.querySelector<HTMLButtonElement>('.tl-card-close')!.click();
    expect(store.get().rankingsPanelOpen).toBe(false);
    expect(panel.isOpen()).toBe(false);

    store.set({ rankingsPanelOpen: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(store.get().rankingsPanelOpen).toBe(false);
  });

  it('shows an error with a retry when the data cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createStore<AppState>(createInitialState());
    const panel = new RankingsPanel({ container: document.body, store, onLocate: vi.fn() });
    store.set({ rankingsPanelOpen: true });
    await vi.waitFor(() => expect(panel.element.textContent).toContain('Could not load'));

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => makeData() })),
    );
    panel.element.querySelector<HTMLButtonElement>('.tl-rankings-more')!.click();
    await vi.waitFor(() =>
      expect(panel.element.querySelector('.tl-rankings-table')).not.toBeNull(),
    );
  });

  it('is hidden during a quiz', async () => {
    const { panel, store } = await setup();
    store.set({ mode: 'quiz' });
    expect(panel.isOpen()).toBe(false);
  });

  it('never marks an object without geometry as drawn, but still lets you locate it', async () => {
    const tableOnly = row({
      id: 'river-wd-q1',
      order: 2,
      layerOrder: undefined,
      name_en: 'Paraguay River',
      name_pl: 'Paragwaj',
    });
    const { panel, onLocate } = await setup(
      { layers: { ...createInitialState().layers, lakes: { enabled: true, topN: 50 } } },
      makeData([LAKES[0]!, tableOnly]),
    );
    const dots = [...panel.element.querySelectorAll('.tl-rankings-dot')].map(d =>
      d.classList.contains('is-on'),
    );
    expect(dots).toEqual([true, false]);
    panel.element
      .querySelector<HTMLButtonElement>('tr[data-id="river-wd-q1"] .tl-rankings-locate')!
      .click();
    expect(onLocate).toHaveBeenCalledWith(tableOnly, 'lakes');
  });
});
