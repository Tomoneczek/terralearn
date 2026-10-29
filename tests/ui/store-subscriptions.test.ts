import { describe, it, expect, afterEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState, FeatureRef } from '@/state/types';
import { setLocale } from '@/i18n';
import { HoverTooltip } from '@/ui/hover-tooltip';
import { LegendOverlay } from '@/ui/legend';
import { RouteHud } from '@/ui/route-hud';
import { AntipodesHud } from '@/ui/antipodes-hud';
import { SizeComparisonHud } from '@/ui/size-comparison-hud';

/**
 * Regression: these components subscribed with selectors returning a fresh object and the
 * store's default Object.is equality, so every store update (each hover while moving the mouse)
 * re-ran their listeners and rebuilt their DOM. Each test plants a sentinel in the rendered DOM:
 * an unrelated update must leave it in place, a change of a field the component reads must not.
 */

const SENTINEL = '__untouched__';
const country = (id: string): FeatureRef => ({ id, layerId: 'countriesTopN', kind: 'country' });

function newStore(state: Partial<AppState> = {}): ReturnType<typeof createStore<AppState>> {
  return createStore<AppState>({ ...createInitialState(), locale: 'en', ...state });
}

function plant(root: Element, selector: string): Element {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`missing ${selector}`);
  el.textContent = SENTINEL;
  return el;
}

/** True while the planted node is still in the component with its sentinel text. */
function untouched(root: Element, el: Element): boolean {
  return root.contains(el) && el.textContent === SENTINEL;
}

function unrelatedUpdates(store: ReturnType<typeof newStore>): void {
  store.set({ moonScale: 3 });
  store.set({ hovered: country('DE') });
  store.set({ hovered: null, moonPanelOpen: true });
}

afterEach(() => {
  document.body.replaceChildren();
  setLocale('en');
});

describe('UI components ignore unrelated store updates', () => {
  it('HoverTooltip', () => {
    const container = document.createElement('div');
    const store = newStore();
    const tooltip = new HoverTooltip({ container, store });
    store.set({ hovered: { ...country('PL'), name_en: 'Poland', name_pl: 'Polska' } });
    const root = container.querySelector('.tl-hover-tooltip')!;
    const name = plant(root, '.tl-tooltip-name');

    store.set({ moonScale: 3 });
    store.set({ selection: country('FR') });
    expect(untouched(root, name)).toBe(true);

    store.set({ locale: 'pl' });
    expect(name.textContent).toBe('Polska');
    tooltip.destroy();
  });

  it('LegendOverlay', () => {
    const container = document.createElement('div');
    const store = newStore();
    const legend = new LegendOverlay({ container, store });
    const root = container.querySelector('.tl-legend-card')!;
    const row = plant(root, '.tl-legend-row');

    unrelatedUpdates(store);
    expect(untouched(root, row)).toBe(true);

    store.set({ locale: 'pl' });
    expect(untouched(root, row)).toBe(false);
    legend.destroy();
  });

  it('RouteHud', () => {
    const container = document.createElement('div');
    const store = newStore({ routeComparison: { active: true, from: null, to: null } });
    const hud = new RouteHud({ container, store });
    store.set({ routeComparison: { active: true, from: null, to: null } });
    const root = container.querySelector('.tl-route-hud')!;
    const prompt = plant(root, '.tl-route-prompt');

    unrelatedUpdates(store);
    expect(untouched(root, prompt)).toBe(true);

    // The HUD text follows the UI language without any other change
    store.set({ locale: 'pl' });
    expect(untouched(root, prompt)).toBe(false);
    hud.destroy();
  });

  it('AntipodesHud', () => {
    const container = document.createElement('div');
    const store = newStore();
    const hud = new AntipodesHud({ container, store });
    store.set({
      antipodes: {
        active: true,
        source: { lat: 52.23, lng: 21.01, label: { pl: 'Warszawa', en: 'Warsaw' } },
        antipode: { lat: -52.23, lng: -158.99, locationName: 'Pacific Ocean', isLand: false },
      },
    });
    const root = container.querySelector('.tl-antipodes-hud')!;
    const firstChild = root.firstElementChild!;
    firstChild.setAttribute('data-sentinel', SENTINEL);

    unrelatedUpdates(store);
    expect(root.firstElementChild).toBe(firstChild);

    store.set({ locale: 'pl' });
    expect(root.firstElementChild).not.toBe(firstChild);
    hud.destroy();
  });

  it('SizeComparisonHud', () => {
    const container = document.createElement('div');
    const store = newStore();
    const hud = new SizeComparisonHud({ container, store });
    store.set({
      sizeComparison: {
        active: true,
        countryId: 'GL',
        countryName: { pl: 'Grenlandia', en: 'Greenland' },
        countryAreaKm2: 2189751,
        targetLat: 0,
        targetLng: 20,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-40, 70],
              [-30, 70],
              [-35, 75],
              [-40, 70],
            ],
          ],
        },
      },
    });
    const root = container.querySelector('.tl-size-hud')!;
    const firstChild = root.firstElementChild!;

    unrelatedUpdates(store);
    expect(root.firstElementChild).toBe(firstChild);

    store.set({ locale: 'pl' });
    expect(root.firstElementChild).not.toBe(firstChild);
    hud.destroy();
  });
});
