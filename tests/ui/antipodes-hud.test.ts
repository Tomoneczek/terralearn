import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { AntipodesHud, ANTIPODE_PRESETS } from '@/ui/antipodes-hud';

describe('AntipodesHud', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('remains hidden by default when antipodes is inactive', () => {
    const store = createStore<AppState>(createInitialState());
    const hud = new AntipodesHud({ container, store });

    const el = container.querySelector('.tl-antipodes-hud');
    expect(el).not.toBeNull();
    expect(el?.classList.contains('hidden')).toBe(true);

    hud.destroy();
  });

  it('renders Point A and Point B details when antipodes is active', () => {
    const store = createStore<AppState>(createInitialState());
    const hud = new AntipodesHud({ container, store });

    store.set({
      antipodes: {
        active: true,
        source: { lat: 52.23, lng: 21.01, label: 'Warszawa' },
        antipode: {
          lat: -52.23,
          lng: -158.99,
          locationName: 'Ocean Spokojny',
          isLand: false,
        },
      },
    });

    const el = container.querySelector('.tl-antipodes-hud');
    expect(el?.classList.contains('hidden')).toBe(false);

    // Verify Point A card
    const cardA = el?.querySelector('.source-card');
    expect(cardA?.textContent).toContain('Warszawa');
    expect(cardA?.textContent).toContain('52.23° N, 21.01° E');

    // Verify Point B card
    const cardB = el?.querySelector('.antipode-card');
    expect(cardB?.textContent).toContain('Ocean Spokojny');
    expect(cardB?.textContent).toContain('-52.23° N, -158.99° E');

    // Nature badge
    const badge = el?.querySelector('.tl-nature-badge');
    expect(badge?.classList.contains('is-ocean')).toBe(true);

    hud.destroy();
  });

  it('clears antipodes state when close button is clicked', () => {
    const store = createStore<AppState>(createInitialState());
    const hud = new AntipodesHud({ container, store });

    store.set({
      antipodes: {
        active: true,
        source: { lat: 52.23, lng: 21.01, label: 'Warszawa' },
        antipode: { lat: -52.23, lng: -158.99, locationName: 'Ocean Spokojny', isLand: false },
      },
    });

    const closeBtn = container.querySelector('.tl-antipodes-close-btn') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(store.get().antipodes).toBeNull();
    hud.destroy();
  });

  it('calls onFlyTo when camera navigation buttons are clicked', () => {
    const store = createStore<AppState>(createInitialState());
    const onFlyTo = vi.fn();
    const hud = new AntipodesHud({ container, store, onFlyTo });

    store.set({
      antipodes: {
        active: true,
        source: { lat: 52.23, lng: 21.01, label: 'Warszawa' },
        antipode: { lat: -52.23, lng: -158.99, locationName: 'Ocean Spokojny', isLand: false },
      },
    });

    const flyToB = container.querySelector('.fly-to-b') as HTMLButtonElement;
    expect(flyToB).not.toBeNull();
    flyToB.click();
    expect(onFlyTo).toHaveBeenCalledWith(-52.23, -158.99, 1.8);

    const flyToA = container.querySelector('.fly-to-a') as HTMLButtonElement;
    expect(flyToA).not.toBeNull();
    flyToA.click();
    expect(onFlyTo).toHaveBeenCalledWith(52.23, 21.01, 1.8);

    hud.destroy();
  });

  it('updates state and flies camera when preset is selected', () => {
    const store = createStore<AppState>(createInitialState());
    const onFlyTo = vi.fn();
    const hud = new AntipodesHud({ container, store, onFlyTo });

    store.set({
      antipodes: {
        active: true,
        source: { lat: 52.23, lng: 21.01, label: 'Warszawa' },
        antipode: { lat: -52.23, lng: -158.99, locationName: 'Ocean Spokojny', isLand: false },
      },
    });

    const presetBtns = container.querySelectorAll('.tl-antipodes-preset-btn');
    expect(presetBtns.length).toBe(ANTIPODE_PRESETS.length);

    // Click Madrid -> NZ
    (presetBtns[1] as HTMLButtonElement).click();
    expect(onFlyTo).toHaveBeenCalledWith(40, -4, 2.0);

    hud.destroy();
  });

  it('updates origin point on raw globe click', async () => {
    const store = createStore<AppState>(createInitialState());
    const hud = new AntipodesHud({ container, store });

    store.set({
      antipodes: {
        active: true,
        source: { lat: 0, lng: 0 },
        antipode: { lat: 0, lng: 180 },
      },
    });

    store.set({
      globeClick: { lat: 10, lng: 20 },
    });

    await vi.waitFor(() => {
      const current = store.get().antipodes;
      expect(current?.source?.lat).toBe(10);
      expect(current?.source?.lng).toBe(20);
      expect(current?.antipode?.lat).toBe(-10);
      expect(current?.antipode?.lng).toBe(-160);
    });

    hud.destroy();
  });

  it('destroys cleanly and removes DOM element', () => {
    const store = createStore<AppState>(createInitialState());
    const hud = new AntipodesHud({ container, store });

    expect(container.querySelector('.tl-antipodes-hud')).not.toBeNull();
    hud.destroy();
    expect(container.querySelector('.tl-antipodes-hud')).toBeNull();
  });
});
