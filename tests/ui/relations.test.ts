import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setLocale } from '@/i18n';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { InfoCard } from '@/ui/info-card';
import type { ObjectFacts } from '../../scripts/data/buildSearchAndFacts';

// The app defaults to English; these tests assert Polish copy, so pin the locale explicitly.
beforeEach(() => setLocale('pl'));
const plState = () => ({ ...createInitialState(), locale: 'pl' as const });

describe('Geographic Relations in InfoCard (G11-04)', () => {
  let container: HTMLElement;

  const mockFacts: Record<string, ObjectFacts> = {
    PL: {
      id: 'PL',
      name_pl: 'Polska',
      name_en: 'Poland',
      kind: 'country',
      stats: [{ key: 'area', value: 312_696 }],
      relations: {
        capital: {
          id: 'capital-warsaw',
          name_pl: 'Warszawa',
          name_en: 'Warsaw',
          kind: 'capital',
          layerId: 'capitals',
          lat: 52.231,
          lng: 21.005,
        },
        neighbors: [
          {
            id: 'DE',
            name_pl: 'Niemcy',
            name_en: 'Germany',
            kind: 'country',
            layerId: 'countriesTopN',
            lat: 51.263,
            lng: 9.709,
          },
          {
            id: 'CZ',
            name_pl: 'Czechy',
            name_en: 'Czech Republic',
            kind: 'country',
            layerId: 'countriesTopN',
            lat: 49.916,
            lng: 14.562,
          },
        ],
      },
    },
    'river-vistula': {
      id: 'river-vistula',
      name_pl: 'Wisła',
      name_en: 'Vistula',
      kind: 'river',
      stats: [{ key: 'length', value: 1047 }],
      relations: {
        countries: [
          {
            id: 'PL',
            name_pl: 'Polska',
            name_en: 'Poland',
            kind: 'country',
            layerId: 'countriesTopN',
            lat: 51.848,
            lng: 20.718,
          },
        ],
      },
    },
    'peak-everest': {
      id: 'peak-everest',
      name_pl: 'Mount Everest',
      name_en: 'Mount Everest',
      kind: 'peak',
      stats: [{ key: 'elevation', value: 8848 }],
      relations: {
        countries: [
          {
            id: 'NP',
            name_pl: 'Nepal',
            name_en: 'Nepal',
            kind: 'country',
            layerId: 'countriesTopN',
            lat: 28.394,
            lng: 84.124,
          },
        ],
        mountainRange: {
          id: 'mountain-himalayas',
          name_pl: 'Himalaje',
          name_en: 'Himalayas',
          kind: 'mountain',
          layerId: 'mountains',
          lat: 28.0,
          lng: 86.0,
        },
      },
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

  it('renders capital and neighboring country chips for a country', async () => {
    const store = createStore<AppState>(plState());
    const card = new InfoCard({ container, store });
    await new Promise(r => setTimeout(r, 20));

    store.set({
      ...store.get(),
      selection: { id: 'PL', layerId: 'countriesTopN', kind: 'country' },
    });

    const relationsSection = container.querySelector('.tl-card-relations');
    expect(relationsSection).not.toBeNull();

    const groups = relationsSection?.querySelectorAll('.tl-relation-group');
    expect(groups?.length).toBe(2);

    // Capital city group
    const capitalTitle = groups?.[0]?.querySelector('.tl-relation-group-title');
    expect(capitalTitle?.textContent).toBe('Stolica państwa');

    const capitalChip = groups?.[0]?.querySelector('.tl-relation-chip');
    expect(capitalChip?.textContent).toContain('Warszawa');

    // Neighbors group
    const neighborsTitle = groups?.[1]?.querySelector('.tl-relation-group-title');
    expect(neighborsTitle?.textContent).toBe('Graniczy z');

    const neighborChips = groups?.[1]?.querySelectorAll('.tl-relation-chip');
    expect(neighborChips?.length).toBe(2);
    expect(neighborChips?.[0]?.textContent).toContain('Niemcy');
    expect(neighborChips?.[1]?.textContent).toContain('Czechy');

    card.destroy();
  });

  it('navigates and updates store selection when a relation chip is clicked', async () => {
    const onFlyTo = vi.fn();
    const store = createStore<AppState>(plState());
    const card = new InfoCard({ container, store, onFlyTo });
    await new Promise(r => setTimeout(r, 20));

    store.set({
      ...store.get(),
      selection: { id: 'PL', layerId: 'countriesTopN', kind: 'country' },
    });

    const capitalChip = container.querySelector<HTMLButtonElement>(
      '.tl-relation-chip[data-id="capital-warsaw"]',
    );
    expect(capitalChip).not.toBeNull();

    capitalChip?.click();

    expect(store.get().selection).toEqual({
      id: 'capital-warsaw',
      layerId: 'capitals',
      kind: 'capital',
      lat: 52.231,
      lng: 21.005,
    });
    expect(onFlyTo).toHaveBeenCalledTimes(1);

    card.destroy();
  });

  it('renders flowsThrough label for rivers and locatedIn for peaks/mountains', async () => {
    const store = createStore<AppState>(plState());
    const card = new InfoCard({ container, store });
    await new Promise(r => setTimeout(r, 20));

    // River
    store.set({
      ...store.get(),
      selection: { id: 'river-vistula', layerId: 'rivers', kind: 'river' },
    });
    const riverGroupTitle = container.querySelector('.tl-relation-group-title');
    expect(riverGroupTitle?.textContent).toBe('Przepływa przez');

    // Peak
    store.set({
      ...store.get(),
      selection: { id: 'peak-everest', layerId: 'peaks', kind: 'peak' },
    });
    const peakGroups = container.querySelectorAll('.tl-relation-group');
    expect(peakGroups.length).toBe(2);
    expect(peakGroups[0]?.querySelector('.tl-relation-group-title')?.textContent).toBe('Kraj');
    expect(peakGroups[1]?.querySelector('.tl-relation-group-title')?.textContent).toBe(
      'Pasmo górskie',
    );

    const mountainChip = peakGroups[1]?.querySelector('.tl-relation-chip');
    expect(mountainChip?.textContent).toContain('Himalaje');

    card.destroy();
  });

  it('respects active English locale in relation group headers and chip names', async () => {
    const store = createStore<AppState>({
      ...plState(),
      locale: 'en',
    });
    const card = new InfoCard({ container, store });
    await new Promise(r => setTimeout(r, 20));

    store.set({
      ...store.get(),
      selection: { id: 'PL', layerId: 'countriesTopN', kind: 'country' },
    });

    const groups = container.querySelectorAll('.tl-relation-group');
    expect(groups[0]?.querySelector('.tl-relation-group-title')?.textContent).toBe('Capital city');
    expect(groups[0]?.querySelector('.tl-relation-chip')?.textContent).toContain('Warsaw');

    expect(groups[1]?.querySelector('.tl-relation-group-title')?.textContent).toBe('Borders with');
    expect(groups[1]?.querySelectorAll('.tl-relation-chip')[0]?.textContent).toContain('Germany');

    card.destroy();
  });
});
