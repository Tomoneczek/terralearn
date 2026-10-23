import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setLocale } from '@/i18n';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { SearchOverlay } from '@/ui/search';
import type { SearchIndexItem } from '@/geo/search';

// The app defaults to English; these tests assert Polish copy, so pin the locale explicitly.
beforeEach(() => setLocale('pl'));
const plState = () => ({ ...createInitialState(), locale: 'pl' as const });

describe('SearchOverlay', () => {
  let container: HTMLElement;

  const mockIndex: SearchIndexItem[] = [
    {
      id: 'PL',
      name_pl: 'Polska',
      name_en: 'Poland',
      normalized_name: 'polska poland',
      kind: 'country',
      layerId: 'countriesTopN',
      lat: 52.0,
      lng: 19.0,
      rank: 1,
    },
    {
      id: 'l1',
      name_pl: 'Śniardwy',
      name_en: 'Sniardwy',
      normalized_name: 'sniardwy jezioro',
      kind: 'lake',
      layerId: 'lakes',
      lat: 53.7,
      lng: 21.7,
      rank: 2,
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => mockIndex,
        }),
      ),
    );
  });

  it('renders input, placeholder, and kbd badge', () => {
    const store = createStore<AppState>(plState());
    const search = new SearchOverlay({ container, store });

    const input = container.querySelector<HTMLInputElement>('.tl-search-input');
    expect(input).not.toBeNull();
    expect(input?.placeholder).toContain('Szukaj');

    const kbd = container.querySelector('.tl-search-kbd');
    expect(kbd?.textContent).toBe('/');

    search.destroy();
  });

  it('typing filters results and selecting an item activates layer and selection', async () => {
    const onSelect = vi.fn();
    const store = createStore<AppState>({
      ...plState(),
      layers: {
        ...plState().layers,
        lakes: { enabled: false, topN: 10 },
      },
    });

    const search = new SearchOverlay({ container, store, onSelect });
    // Wait for fetch to resolve
    await new Promise(r => setTimeout(r, 20));

    const input = container.querySelector<HTMLInputElement>('.tl-search-input')!;
    input.value = 'sniard';
    input.dispatchEvent(new Event('input'));

    const items = container.querySelectorAll('.tl-search-item');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Śniardwy');

    // Click item
    (items[0] as HTMLElement).click();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(store.get().layers.lakes.enabled).toBe(true);
    expect(store.get().selection?.id).toBe('l1');

    search.destroy();
  });

  it('closes dropdown on Escape key', async () => {
    const store = createStore<AppState>(plState());
    const search = new SearchOverlay({ container, store });
    await new Promise(r => setTimeout(r, 20));

    const input = container.querySelector<HTMLInputElement>('.tl-search-input')!;
    input.value = 'pol';
    input.dispatchEvent(new Event('input'));

    const dropdown = container.querySelector('.tl-search-dropdown')!;
    expect(dropdown.classList.contains('open')).toBe(true);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dropdown.classList.contains('open')).toBe(false);

    search.destroy();
  });

  it('navigates search results with ArrowDown/ArrowUp and selects via Enter', async () => {
    const onSelect = vi.fn();
    const store = createStore<AppState>(plState());
    const search = new SearchOverlay({ container, store, onSelect });
    await new Promise(r => setTimeout(r, 20));

    const input = container.querySelector<HTMLInputElement>('.tl-search-input')!;
    input.value = 'pol';
    input.dispatchEvent(new Event('input'));

    // Press ArrowDown
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // Press ArrowUp
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    // Press Enter to select highlighted
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onSelect).toHaveBeenCalled();
    search.destroy();
  });

  it('displays empty state for unmatched query and closes on empty input or outside click', async () => {
    const store = createStore<AppState>(plState());
    const search = new SearchOverlay({ container, store });
    await new Promise(r => setTimeout(r, 20));

    const input = container.querySelector<HTMLInputElement>('.tl-search-input')!;
    const dropdown = container.querySelector('.tl-search-dropdown')!;

    // 1. Unmatched query
    input.value = 'xyz123nonexistent';
    input.dispatchEvent(new Event('input'));
    expect(dropdown.querySelector('.tl-search-empty')).not.toBeNull();
    expect(dropdown.classList.contains('open')).toBe(true);

    // 2. Clear input -> closes dropdown
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(dropdown.classList.contains('open')).toBe(false);

    // 3. Re-open and click outside
    input.value = 'pol';
    input.dispatchEvent(new Event('input'));
    expect(dropdown.classList.contains('open')).toBe(true);

    document.body.click();
    expect(dropdown.classList.contains('open')).toBe(false);

    search.destroy();
  });

  it('handles global shortcut "/" and formats items in English locale', async () => {
    const store = createStore<AppState>({
      ...plState(),
      locale: 'en',
    });
    const search = new SearchOverlay({ container, store });
    await new Promise(r => setTimeout(r, 20));

    const input = container.querySelector<HTMLInputElement>('.tl-search-input')!;

    // Global "/" keypress focuses input
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(document.activeElement).toBe(input);

    // Typing in English locale
    input.value = 'Poland';
    input.dispatchEvent(new Event('input'));

    const items = container.querySelectorAll('.tl-search-item');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.textContent).toContain('Poland');

    search.destroy();
  });

  it('handles network fetch errors gracefully without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network error loading index'))),
    );

    const store = createStore<AppState>(plState());
    const search = new SearchOverlay({ container, store });
    await new Promise(r => setTimeout(r, 20));

    const input = container.querySelector<HTMLInputElement>('.tl-search-input')!;
    input.value = 'test';
    input.dispatchEvent(new Event('input'));

    search.destroy();
  });
});
