import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { SidebarController } from '@/ui/sidebar';
import { InfoCard } from '@/ui/info-card';
import { LegendOverlay } from '@/ui/legend';
import { SearchOverlay } from '@/ui/search';
import { Toolbar } from '@/ui/toolbar';
import { setLocale } from '@/i18n';
import type { ObjectFacts } from '../../scripts/data/buildSearchAndFacts';

describe('G11-02 UI Locale Switch Components', () => {
  let container: HTMLElement;

  const mockFacts: Record<string, ObjectFacts> = {
    PL: {
      id: 'PL',
      name_pl: 'Polska',
      name_en: 'Poland',
      kind: 'country',
      stats: [{ key: 'area', value: 312_696 }],
    },
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    setLocale('pl');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => mockFacts,
        }),
      ),
    );
  });

  describe('Sidebar Language Select', () => {
    it('mounts with current locale and updates store on change', () => {
      const store = createStore<AppState>(createInitialState());
      const sidebar = new SidebarController({ container, store });

      const select = container.querySelector<HTMLSelectElement>('#select-language');
      expect(select).not.toBeNull();
      expect(select?.value).toBe('en');

      // Change to Polish
      select!.value = 'pl';
      select!.dispatchEvent(new Event('change'));

      expect(store.get().locale).toBe('pl');

      sidebar.destroy();
    });

    it('refresh() maintains current value and re-renders labels', () => {
      const store = createStore<AppState>(createInitialState());
      store.set({ ...store.get(), locale: 'en' });
      setLocale('en');

      const sidebar = new SidebarController({ container, store });
      const select = container.querySelector<HTMLSelectElement>('#select-language');
      expect(select?.value).toBe('en');

      sidebar.refresh();
      const selectAfter = container.querySelector<HTMLSelectElement>('#select-language');
      expect(selectAfter?.value).toBe('en');

      sidebar.destroy();
    });
  });

  describe('InfoCard bilingual display', () => {
    it('switches primary title and subtitle based on locale', async () => {
      const store = createStore<AppState>(createInitialState());
      const infoCard = new InfoCard({ container, store });
      await new Promise(r => setTimeout(r, 20));

      // 1. Select country in PL mode
      store.set({
        ...store.get(),
        locale: 'pl',
        selection: { id: 'PL', layerId: 'countriesTopN', kind: 'country' },
      });

      const cardEl = container.querySelector('.tl-info-card')!;
      expect(cardEl.classList.contains('hidden')).toBe(false);

      const titlePl = cardEl.querySelector('.tl-card-title')?.textContent;
      const subtitlePl = cardEl.querySelector('.tl-card-subtitle')?.textContent;
      expect(titlePl).toBe('Polska');
      expect(subtitlePl).toBe('Poland');

      // 2. Switch to EN mode
      setLocale('en');
      store.set({
        ...store.get(),
        locale: 'en',
      });

      const titleEn = cardEl.querySelector('.tl-card-title')?.textContent;
      const subtitleEn = cardEl.querySelector('.tl-card-subtitle')?.textContent;
      expect(titleEn).toBe('Poland');
      expect(subtitleEn).toBe('Polska');

      infoCard.destroy();
    });
  });

  describe('LegendOverlay', () => {
    it('updates title and layer names on refresh', () => {
      // The store must start in Polish too: the legend reacts to a change of `locale` in the
      // store, not to the global i18n locale alone (it used to pass only because the legend
      // re-rendered on every store update, see shallowEqual in src/state/store.ts).
      const store = createStore<AppState>({ ...createInitialState(), locale: 'pl' });
      const legend = new LegendOverlay({ container, store });

      const title = container.querySelector('.tl-legend-title');
      expect(title?.textContent).toBe('Legenda');

      setLocale('en');
      store.set({ ...store.get(), locale: 'en' });

      expect(title?.textContent).toBe('Legend');

      legend.destroy();
    });
  });

  describe('Toolbar & SearchOverlay', () => {
    it('refreshes aria-labels and placeholder on locale change', () => {
      const store = createStore<AppState>(createInitialState());
      const toolbar = new Toolbar({ container });
      const search = new SearchOverlay({ container, store });

      const searchInput = container.querySelector<HTMLInputElement>('.tl-search-input')!;
      expect(searchInput.placeholder).toBe('Szukaj obiektów, państw...');

      setLocale('en');
      toolbar.refresh();
      search.refresh();

      expect(searchInput.placeholder).toBe('Search places, countries...');
      expect(toolbar.element.getAttribute('aria-label')).toBe('Globe camera tools');

      toolbar.destroy();
      search.destroy();
    });
  });
});
