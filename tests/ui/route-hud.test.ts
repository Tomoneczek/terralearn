import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setLocale } from '@/i18n';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { RouteHud } from '@/ui/route-hud';

// The app defaults to English; these tests assert Polish copy, so pin the locale explicitly.
beforeEach(() => setLocale('pl'));
const plState = () => ({ ...createInitialState(), locale: 'pl' as const });

describe('RouteHud component', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('remains hidden when route comparison is inactive', () => {
    const store = createStore<AppState>(plState());
    const hud = new RouteHud({ container, store });

    const el = container.querySelector('.tl-route-hud');
    expect(el).not.toBeNull();
    expect(el?.classList.contains('hidden')).toBe(true);

    hud.destroy();
  });

  it('displays prompt when activated without points', () => {
    const store = createStore<AppState>(plState());
    const hud = new RouteHud({ container, store });

    store.set({
      routeComparison: {
        active: true,
        from: null,
        to: null,
      },
    });

    const el = container.querySelector('.tl-route-hud');
    expect(el?.classList.contains('hidden')).toBe(false);

    const prompt = el?.querySelector('.tl-route-prompt');
    expect(prompt).not.toBeNull();
    expect(prompt?.textContent).toContain('początkowy');

    hud.destroy();
  });

  it('displays start point badge when point A is selected', () => {
    const store = createStore<AppState>(plState());
    const hud = new RouteHud({ container, store });

    store.set({
      routeComparison: {
        active: true,
        from: { lat: 52.23, lng: 21.01, label: { pl: 'Warszawa', en: 'Warsaw' } },
        to: null,
      },
    });

    const badgeA = container.querySelector('.tl-point-badge.point-a');
    expect(badgeA).not.toBeNull();
    expect(container.textContent).toContain('Warszawa');

    const prompt = container.querySelector('.tl-route-prompt');
    expect(prompt?.textContent).toContain('docelowy');

    hud.destroy();
  });

  it('calculates and renders distances, difference, and cards when both points are set', () => {
    const store = createStore<AppState>(plState());
    const hud = new RouteHud({ container, store });

    store.set({
      routeComparison: {
        active: true,
        from: { lat: 52.23, lng: 21.01, label: { pl: 'Warszawa', en: 'Warsaw' } },
        to: { lat: 35.68, lng: 139.76, label: { pl: 'Tokio', en: 'Tokyo' } },
      },
    });

    // Endpoints
    expect(container.textContent).toContain('Warszawa');
    expect(container.textContent).toContain('Tokio');

    // Orthodrome distance: ~8 583 km
    const orthoCard = container.querySelector('.tl-metric-card.ortho');
    expect(orthoCard?.textContent).toContain('8');
    expect(orthoCard?.textContent).toContain('km');

    // Rhumb Line distance: ~9 590 km
    const rhumbCard = container.querySelector('.tl-metric-card.rhumb');
    expect(rhumbCard?.textContent).toContain('9');
    expect(rhumbCard?.textContent).toContain('km');

    // Difference: > 900 km
    const diffCard = container.querySelector('.tl-metric-card.diff');
    expect(diffCard?.textContent).toContain('+');
    expect(diffCard?.textContent).toContain('%');

    // Explanation
    const explanation = container.querySelector('.tl-route-explanation');
    expect(explanation).not.toBeNull();
    expect(explanation?.textContent).toContain('Merkatora');

    hud.destroy();
  });

  it('clicking a preset route sets store state and flies camera', () => {
    const onFlyTo = vi.fn();
    const store = createStore<AppState>(plState());
    const hud = new RouteHud({ container, store, onFlyTo });

    store.set({
      routeComparison: {
        active: true,
        from: null,
        to: null,
      },
    });

    const presetBtns = container.querySelectorAll<HTMLButtonElement>('.tl-route-preset-btn');
    expect(presetBtns.length).toBeGreaterThan(0);

    // Click Warsaw -> Tokyo
    presetBtns[0]?.click();

    const comparison = store.get().routeComparison;
    expect(comparison?.from?.label).toEqual({ pl: 'Warszawa', en: 'Warsaw' });
    expect(comparison?.to?.label).toEqual({ pl: 'Tokio', en: 'Tokyo' });
    expect(onFlyTo).toHaveBeenCalledTimes(1);

    hud.destroy();
  });

  it('clicking clear resets endpoints but leaves tool active', () => {
    const store = createStore<AppState>(plState());
    const hud = new RouteHud({ container, store });

    store.set({
      routeComparison: {
        active: true,
        from: { lat: 52.23, lng: 21.01 },
        to: { lat: 35.68, lng: 139.76 },
      },
    });

    const clearBtn = container.querySelector<HTMLButtonElement>('.tl-btn-subtle');
    clearBtn?.click();

    const comp = store.get().routeComparison;
    expect(comp?.active).toBe(true);
    expect(comp?.from).toBeNull();
    expect(comp?.to).toBeNull();

    hud.destroy();
  });

  it('clicking close button deactivates route comparison', () => {
    const store = createStore<AppState>(plState());
    const hud = new RouteHud({ container, store });

    store.set({
      routeComparison: {
        active: true,
        from: null,
        to: null,
      },
    });

    const closeBtn = container.querySelector<HTMLButtonElement>('.tl-route-close-btn');
    closeBtn?.click();

    expect(store.get().routeComparison).toBeNull();

    hud.destroy();
  });

  it('updates points from globe clicks sequentially', () => {
    const store = createStore<AppState>(plState());
    const hud = new RouteHud({ container, store });

    store.set({
      routeComparison: {
        active: true,
        from: null,
        to: null,
      },
    });

    // 1st globe click sets Point A
    store.set({
      globeClick: { lat: 50, lng: 20 },
    });
    expect(store.get().routeComparison?.from?.lat).toBe(50);
    expect(store.get().routeComparison?.to).toBeNull();

    // 2nd globe click sets Point B
    store.set({
      globeClick: { lat: 40, lng: -74 },
    });
    expect(store.get().routeComparison?.from?.lat).toBe(50);
    expect(store.get().routeComparison?.to?.lat).toBe(40);

    hud.destroy();
  });

  // Regression: preset routes were hard-coded in Polish ("Warszawa → Tokio") in the English UI.
  it('shows preset route names and endpoints in English', () => {
    setLocale('en');
    const store = createStore<AppState>({ ...createInitialState(), locale: 'en' });
    const hud = new RouteHud({ container, store });

    store.set({ routeComparison: { active: true, from: null, to: null } });
    const names = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.tl-route-preset-btn'),
      b => b.textContent,
    );
    expect(names).toEqual(['Warsaw → Tokyo', 'London → San Francisco', 'New York → Singapore']);

    container.querySelector<HTMLButtonElement>('.tl-route-preset-btn')?.click();
    const endpoints = container.querySelector('.tl-route-endpoints')?.textContent ?? '';
    expect(endpoints).toContain('Warsaw');
    expect(endpoints).toContain('Tokyo');
    expect(endpoints).not.toContain('Warszawa');

    hud.destroy();
  });

  it('can be dragged by its header so it does not cover the globe', () => {
    localStorage.removeItem('terralearn_panel_pos_route');
    const store = createStore<AppState>(plState());
    const hud = new RouteHud({ container, store });
    store.set({ routeComparison: { active: true, from: null, to: null } });

    const panel = container.querySelector<HTMLElement>('.tl-route-hud')!;
    expect(panel.classList.contains('tl-draggable')).toBe(true);

    const header = panel.querySelector('.tl-route-title')!;
    const down = new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 });
    Object.defineProperty(down, 'pointerId', { value: 1 });
    header.dispatchEvent(down);
    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 90 });
    Object.defineProperty(move, 'pointerId', { value: 1 });
    panel.dispatchEvent(move);
    expect(panel.style.translate).not.toBe('');

    hud.destroy();
  });
});
