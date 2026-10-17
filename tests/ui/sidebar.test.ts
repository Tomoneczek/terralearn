import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { SidebarController, getLayerColor } from '@/ui/sidebar';

describe('SidebarController', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders presets, mode switches, layer rows, and quiz action', () => {
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store });

    // Presets
    const presetBtns = container.querySelectorAll('.tl-preset-btn');
    expect(presetBtns.length).toBe(3);

    // Modes
    const titles = container.querySelectorAll('.tl-section-title');
    expect(titles.length).toBe(4);

    // Physical & political layers
    const layerCards = container.querySelectorAll('.tl-layer-card');
    expect(layerCards.length).toBeGreaterThan(8);

    // Start quiz button
    const quizBtn = container.querySelector('#btn-start-quiz');
    expect(quizBtn).not.toBeNull();

    sidebar.destroy();
  });

  it('toggling a layer updates store state and card classes', () => {
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store });

    const lakesCard = container.querySelector<HTMLElement>('[data-layer-id="lakes"]');
    expect(lakesCard).not.toBeNull();

    const lakesToggle = lakesCard?.querySelector<HTMLButtonElement>('.tl-toggle');
    expect(lakesToggle).not.toBeNull();

    // Toggle lakes off
    lakesToggle?.click();
    expect(store.get().layers.lakes.enabled).toBe(false);
    expect(lakesCard?.classList.contains('active')).toBe(false);

    // Toggle lakes back on
    lakesToggle?.click();
    expect(store.get().layers.lakes.enabled).toBe(true);
    expect(lakesCard?.classList.contains('active')).toBe(true);

    sidebar.destroy();
  });

  it('clicking a preset button updates all relevant layers in store', () => {
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store });

    const presetBtns = container.querySelectorAll<HTMLButtonElement>('.tl-preset-btn');
    // Button 0: Physical, Button 1: Political, Button 2: All
    const physicalBtn = presetBtns[0];
    physicalBtn?.click();

    const state = store.get();
    expect(state.layers.mountains.enabled).toBe(true);
    expect(state.layers.lakes.enabled).toBe(true);
    expect(state.layers.borders.enabled).toBe(false);
    expect(state.layers.capitals.enabled).toBe(false);

    sidebar.destroy();
  });

  it('external store changes synchronize back to sidebar UI', () => {
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store });

    store.set({
      ...store.get(),
      dayNight: true,
      hiddenLabels: true,
      layers: {
        ...store.get().layers,
        mountains: { enabled: false, topN: 5 },
      },
    });

    const mountainsCard = container.querySelector<HTMLElement>('[data-layer-id="mountains"]');
    const mountainsToggle = mountainsCard?.querySelector<HTMLButtonElement>('.tl-toggle');
    expect(mountainsToggle?.getAttribute('aria-checked')).toBe('false');

    sidebar.destroy();
  });

  it('dispatches start-quiz callback or custom event when quiz button is clicked', () => {
    const onStartQuiz = vi.fn();
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store, onStartQuiz });

    const quizBtn = container.querySelector<HTMLButtonElement>('#btn-start-quiz');
    quizBtn?.click();
    expect(onStartQuiz).toHaveBeenCalledTimes(1);

    sidebar.destroy();
  });

  it('returns valid color for every layer id in getLayerColor', () => {
    expect(getLayerColor('lakes')).toBe('hsl(190, 100%, 60%)');
    expect(getLayerColor('rivers')).toBe('hsl(190, 100%, 65%)');
    expect(getLayerColor('mountains')).toBe('hsl(28, 100%, 58%)');
    expect(getLayerColor('deserts')).toBe('hsl(38, 80%, 65%)');
    expect(getLayerColor('peaks')).toBe('hsl(0, 100%, 67%)');
    expect(getLayerColor('borders')).toBe('hsl(215, 35%, 65%)');
    expect(getLayerColor('countriesTopN')).toBe('hsl(212, 95%, 58%)');
    expect(getLayerColor('capitals')).toBe('hsl(350, 85%, 62%)');
    expect(getLayerColor('megacities')).toBe('hsl(45, 100%, 62%)');
  });

  it('updates quality preset in store and reflects store changes in select element', () => {
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store });

    const qualitySelect = container.querySelector<HTMLSelectElement>('#select-quality');
    expect(qualitySelect).not.toBeNull();
    expect(qualitySelect?.value).toBe('auto');

    // Change via UI
    if (qualitySelect) {
      qualitySelect.value = 'medium';
      qualitySelect.dispatchEvent(new Event('change'));
    }
    expect(store.get().quality).toBe('medium');

    // Change via store
    store.set({ ...store.get(), quality: 'low' });
    expect(qualitySelect?.value).toBe('low');

    sidebar.destroy();
  });
});
