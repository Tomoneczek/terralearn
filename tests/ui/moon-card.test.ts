import { describe, it, expect, afterEach } from 'vitest';
import { MoonCard, calculateMoonFacts, moonPhasePath } from '@/ui/moon-card';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { setLocale } from '@/i18n';

const DATE = new Date(Date.UTC(2026, 9, 28, 12));

function setup(state: Partial<AppState> = {}): {
  store: ReturnType<typeof createStore<AppState>>;
  card: MoonCard;
  tick: (date: Date) => void;
} {
  const store = createStore<AppState>({ ...createInitialState(), ...state });
  const container = document.createElement('div');
  document.body.appendChild(container);
  let listener: ((date: Date) => void) | null = null;
  const card = new MoonCard({
    container,
    store,
    getDate: () => DATE,
    onTick: l => {
      listener = l;
      return () => {
        listener = null;
      };
    },
  });
  return { store, card, tick: date => listener?.(date) };
}

function statValues(card: MoonCard): string[] {
  return [...card.element.querySelectorAll('.tl-card-stat-value')].map(el => el.textContent ?? '');
}

afterEach(() => {
  document.body.replaceChildren();
  setLocale('en');
});

describe('calculateMoonFacts', () => {
  it('describes the Moon for an instant', () => {
    const f = calculateMoonFacts(DATE);
    expect(f.diameterKm).toBeCloseTo(3474.8, 1);
    expect(Math.round(f.diameterPctOfEarth)).toBe(27);
    expect(f.distanceKm).toBeGreaterThan(356_000);
    expect(f.distanceKm).toBeLessThan(407_000);
    expect(f.distanceInEarthDiameters).toBeCloseTo(f.distanceKm / 12_742, 9);
    expect(f.lightTimeSeconds).toBeGreaterThan(1.18);
    expect(f.lightTimeSeconds).toBeLessThan(1.36);
    expect(f.apparentSizeArcmin).toBeGreaterThan(29.3);
    expect(f.apparentSizeArcmin).toBeLessThan(33.6);
    expect(f.sunApparentSizeArcmin).toBeCloseTo(32.2, 0);
    expect(f.phase.phase).toBe('waningGibbous');
  });
});

describe('moonPhasePath', () => {
  it('draws a half disc at quarters and the terminator ellipse otherwise', () => {
    // First quarter: lit right half, straight terminator (rx = 0)
    expect(moonPhasePath(0.5, true, 10)).toBe(
      'M 0 -10 A 10 10 0 0 1 0 10 A 0.000 10 0 0 0 0 -10 Z',
    );
    // Waning crescent: lit on the left, terminator bulging left
    expect(moonPhasePath(0.25, false, 10)).toBe(
      'M 0 -10 A 10 10 0 0 0 0 10 A 5.000 10 0 0 1 0 -10 Z',
    );
    // Waxing gibbous: terminator on the left side
    expect(moonPhasePath(0.75, true, 10)).toBe(
      'M 0 -10 A 10 10 0 0 1 0 10 A 5.000 10 0 0 1 0 -10 Z',
    );
  });
});

describe('MoonCard', () => {
  it('stays hidden until the Moon panel is opened', () => {
    const { card, store } = setup();
    expect(card.isOpen()).toBe(false);
    store.set({ moonPanelOpen: true });
    expect(card.isOpen()).toBe(true);
    expect(card.element.querySelector('.tl-card-title')?.textContent).toBe('Moon');
    card.destroy();
  });

  it('shows size, distance, light time, apparent size and phase', () => {
    const { card } = setup({ moonPanelOpen: true });
    const f = calculateMoonFacts(DATE);
    const [diameter, distance, light, apparent, phase] = statValues(card);
    expect(diameter).toBe('3,474.8 km · 27% of Earth');
    expect(distance).toContain(Math.round(f.distanceKm).toLocaleString('en-US'));
    expect(distance).toContain('Earth diameters');
    expect(light).toMatch(/^1\.\d{2} s$/);
    expect(apparent).toMatch(/^\d{2}\.\d′ \(Sun 32\.\d′\)$/);
    expect(phase).toBe(`Waning gibbous, ${Math.round(f.phase.illuminatedFraction * 100)}% lit`);
    expect(card.element.querySelector('.tl-moon-phase-lit')?.getAttribute('d')).toMatch(/^M 0 -10/);
    card.destroy();
  });

  it('is translated to Polish', () => {
    const { card } = setup({ moonPanelOpen: true, locale: 'pl' });
    expect(card.element.querySelector('.tl-card-title')?.textContent).toBe('Księżyc');
    expect(statValues(card)[0]).toBe('3474,8 km · 27% średnicy Ziemi');
    expect(statValues(card)[4]).toContain('Ubywający garb');
    card.destroy();
  });

  it('refreshes the live values on sky clock ticks', () => {
    const { card, tick } = setup({ moonPanelOpen: true });
    const before = statValues(card)[1];
    tick(new Date(DATE.getTime() + 5 * 86_400_000));
    expect(statValues(card)[1]).not.toBe(before);
    card.destroy();
  });

  it('sets the Moon size on the globe with the slider, labelled at real scale', () => {
    const { card, store } = setup({ moonPanelOpen: true });
    const caption = card.element.querySelector('.tl-moon-scale-caption');
    expect(caption?.textContent).toBe('Real scale');

    const input = card.element.querySelector<HTMLInputElement>('#tl-moon-scale input');
    expect(input).not.toBeNull();
    const preset = [...card.element.querySelectorAll<HTMLButtonElement>('.tl-preset-pill')].find(
      b => b.textContent === '10',
    );
    preset?.click();
    expect(store.get().moonScale).toBe(10);
    expect(caption?.textContent).toBe('Enlarged 10×, for illustration only');

    store.set({ moonScale: 1 });
    expect(input?.value).toBe('1');
    expect(caption?.textContent).toBe('Real scale');
    card.destroy();
  });

  it('closes with the close button and with Escape', () => {
    const { card, store } = setup({ moonPanelOpen: true });
    card.element.querySelector<HTMLButtonElement>('.tl-card-close')?.click();
    expect(store.get().moonPanelOpen).toBe(false);
    expect(card.isOpen()).toBe(false);

    store.set({ moonPanelOpen: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(store.get().moonPanelOpen).toBe(false);
    card.destroy();
  });

  it('gives way to the object card and to quiz mode', () => {
    const { card, store } = setup({ moonPanelOpen: true });
    store.set({ selection: { id: 'pl', layerId: 'countriesTopN', kind: 'country' } });
    expect(store.get().moonPanelOpen).toBe(false);
    expect(card.isOpen()).toBe(false);

    store.set({ selection: null, moonPanelOpen: true, mode: 'quiz' });
    expect(card.isOpen()).toBe(false);
    card.destroy();
  });

  // Regression: an object selector with the default Object.is equality re-rendered the whole
  // card on every store update, replacing the slider under the user's pointer mid-drag.
  it('does not re-render on unrelated store updates', () => {
    const { card, store } = setup({ moonPanelOpen: true });
    const slider = card.element.querySelector('#tl-moon-scale');
    store.set({ hovered: { id: 'pl', layerId: 'countriesTopN', kind: 'country' } });
    store.set({ moonScale: 3 });
    expect(card.element.querySelector('#tl-moon-scale')).toBe(slider);
    card.destroy();
  });
});
