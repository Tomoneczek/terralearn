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
        from: { lat: 52.23, lng: 21.01, label: 'Warszawa' },
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
        from: { lat: 52.23, lng: 21.01, label: 'Warszawa' },
        to: { lat: 35.68, lng: 139.76, label: 'Tokio' },
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
    expect(comparison?.from?.label).toBe('Warszawa');
    expect(comparison?.to?.label).toBe('Tokio');
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
});
