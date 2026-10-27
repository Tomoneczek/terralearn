import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setLocale } from '@/i18n';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { InfoCard } from '@/ui/info-card';
import type { ObjectFacts } from '../../scripts/data/buildSearchAndFacts';

// The app defaults to English; these tests assert Polish copy, so pin the locale explicitly.
beforeEach(() => setLocale('pl'));
const plState = () => ({ ...createInitialState(), locale: 'pl' as const });

describe('InfoCard', () => {
  let container: HTMLElement;

  const mockFacts: Record<string, ObjectFacts> = {
    PL: {
      id: 'PL',
      name_pl: 'Polska',
      name_en: 'Poland',
      kind: 'country',
      stats: [
        { key: 'area', value: 312_696 },
        { key: 'population', value: 38_000_000 },
      ],
      comparison: { metric: 'area', ref: 'poland', ratio: 1.0 },
    },
    'megacity-lodz': {
      id: 'megacity-lodz',
      name_pl: 'Łódź',
      name_en: 'Łódź',
      kind: 'megacity',
      stats: [{ key: 'population', value: 758_000 }],
      comparison: { metric: 'population', ref: 'warsaw', ratio: 0.423 },
    },
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
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

  it('remains hidden when no feature is selected', () => {
    const store = createStore<AppState>(plState());
    const card = new InfoCard({ container, store });

    const cardEl = container.querySelector('.tl-info-card');
    expect(cardEl?.classList.contains('hidden')).toBe(true);

    card.destroy();
  });

  it('renders title, stats, and comparison when feature is selected in store', async () => {
    const store = createStore<AppState>(plState());
    const card = new InfoCard({ container, store });
    await new Promise(r => setTimeout(r, 20));

    store.set({
      ...store.get(),
      selection: { id: 'PL', layerId: 'countriesTopN', kind: 'country' },
    });

    const cardEl = container.querySelector('.tl-info-card')!;
    expect(cardEl.classList.contains('hidden')).toBe(false);

    const title = cardEl.querySelector('.tl-card-title');
    expect(title?.textContent).toBe('Polska');

    const kind = cardEl.querySelector('.tl-card-kind');
    expect(kind?.textContent).toBe('Państwo');

    const statRows = cardEl.querySelectorAll('.tl-card-stat-row');
    expect(statRows.length).toBe(2);

    const compText = cardEl.querySelector('.tl-card-comp-text');
    expect(compText?.textContent).toContain('Powierzchnia równa');

    // Regression: the comparison box used a dollar-sign icon.
    const iconPath = cardEl.querySelector('.tl-card-comp-icon path')?.getAttribute('d') ?? '';
    expect(iconPath).not.toContain('M17 5H9.5');

    card.destroy();
  });

  // Regression: with English UI the card showed "Ludność … mieszkańców", "Kraj: Poland"
  // and "Populacja równa ok. 0,4x Warszawa", because facts.json stored Polish sentences.
  it('renders stats and comparison in English without Polish words', async () => {
    setLocale('en');
    const store = createStore<AppState>({ ...createInitialState(), locale: 'en' });
    const card = new InfoCard({ container, store });
    await new Promise(r => setTimeout(r, 20));

    store.set({
      ...store.get(),
      selection: { id: 'megacity-lodz', layerId: 'megacities', kind: 'megacity' },
    });

    const cardEl = container.querySelector('.tl-info-card')!;
    expect(cardEl.querySelector('.tl-card-kind')?.textContent).toBe('Megacity');
    expect(cardEl.querySelector('.tl-card-stat-label')?.textContent).toBe('Population');
    expect(cardEl.querySelector('.tl-card-stat-value')?.textContent).toBe('758,000');
    expect(cardEl.querySelector('.tl-card-comp-text')?.textContent).toBe(
      'Population ≈ 42% of Warsaw',
    );
    expect(cardEl.textContent).not.toMatch(/Ludność|Kraj|mieszkańców|Populacja|Warszawa/);

    card.destroy();
  });

  it('formats Polish numbers and comparisons with Polish grammar', async () => {
    const store = createStore<AppState>(plState());
    const card = new InfoCard({ container, store });
    await new Promise(r => setTimeout(r, 20));

    store.set({
      ...store.get(),
      selection: { id: 'megacity-lodz', layerId: 'megacities', kind: 'megacity' },
    });

    const cardEl = container.querySelector('.tl-info-card')!;
    expect(cardEl.querySelector('.tl-card-kind')?.textContent).toBe('Metropolia');
    expect(cardEl.querySelector('.tl-card-stat-value')?.textContent).toBe('758\u00a0000 os.');
    expect(cardEl.querySelector('.tl-card-comp-text')?.textContent).toBe(
      'Populacja stanowi ok. 42% ludności Warszawy',
    );

    card.destroy();
  });

  it('clears selection when close button is clicked or Escape key pressed', async () => {
    const store = createStore<AppState>({
      ...plState(),
      selection: { id: 'PL', layerId: 'countriesTopN', kind: 'country' },
    });
    const card = new InfoCard({ container, store });
    await new Promise(r => setTimeout(r, 20));

    const closeBtn = container.querySelector<HTMLButtonElement>('.tl-card-close');
    expect(closeBtn).not.toBeNull();
    closeBtn?.click();

    expect(store.get().selection).toBeNull();

    // Re-select and test Escape key
    store.set({
      ...store.get(),
      selection: { id: 'PL', layerId: 'countriesTopN', kind: 'country' },
    });
    expect(store.get().selection).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(store.get().selection).toBeNull();

    card.destroy();
  });
});
