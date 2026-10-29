import { describe, it, expect, vi } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { altitudeForExtent, isRowDrawn, locateRow } from '@/rankings/locate';
import type { RankingRow } from '@/rankings/types';

const NILE: RankingRow = {
  id: 'river-nile',
  order: 1,
  value: 6650,
  name_pl: 'Nil',
  name_en: 'Nile',
  lat: 18.1,
  lng: 33.94,
  extentKm: 6650,
};
const MINOR: RankingRow = { ...NILE, id: 'river-minor', order: 40, extentKm: 300 };

describe('altitudeForExtent', () => {
  it('moves the camera further out for bigger objects, within fixed bounds', () => {
    expect(altitudeForExtent(0)).toBe(0.4);
    expect(altitudeForExtent(300)).toBeLessThan(altitudeForExtent(3000));
    expect(altitudeForExtent(3000)).toBeLessThan(altitudeForExtent(6000));
    expect(altitudeForExtent(1_000_000)).toBe(2);
  });
});

describe('isRowDrawn', () => {
  const layers = (over: Partial<AppState['layers']>): AppState['layers'] => ({
    ...createInitialState().layers,
    ...over,
  });

  it('is false while the layer is off', () => {
    expect(isRowDrawn(NILE, 'rivers', layers({ rivers: { enabled: false, topN: 20 } }))).toBe(
      false,
    );
  });

  it('follows the Top N limit of the layer', () => {
    const on = layers({ rivers: { enabled: true, topN: 20 } });
    expect(isRowDrawn(NILE, 'rivers', on)).toBe(true);
    expect(isRowDrawn(MINOR, 'rivers', on)).toBe(false);
  });

  it('draws every peak when the layer is on (peaks have no Top N)', () => {
    expect(isRowDrawn({ ...NILE, order: 900 }, 'peaks', layers({ peaks: { enabled: true } }))).toBe(
      true,
    );
  });
});

describe('locateRow', () => {
  it('turns the layer on, flies to the object and selects it', () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      moonPanelOpen: true,
      layers: { ...createInitialState().layers, rivers: { enabled: false, topN: 5 } },
    });
    const flyTo = vi.fn();

    locateRow(MINOR, 'rivers', { store, flyTo });

    expect(store.get().layers.rivers).toEqual({ enabled: true, topN: 5 });
    expect(flyTo).toHaveBeenCalledWith(18.1, 33.94, altitudeForExtent(300));
    expect(store.get().selection).toMatchObject({
      id: 'river-minor',
      layerId: 'rivers',
      kind: 'river',
      name_en: 'Nile',
      lat: 18.1,
      lng: 33.94,
    });
    // The Moon panel shares the card slot with the object card
    expect(store.get().moonPanelOpen).toBe(false);
  });

  it('leaves the Top N slider alone for an object outside it', () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      layers: { ...createInitialState().layers, rivers: { enabled: true, topN: 5 } },
    });
    locateRow(MINOR, 'rivers', { store, flyTo: vi.fn() });
    expect(store.get().layers.rivers.topN).toBe(5);
  });
});
