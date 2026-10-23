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
    expect(titles.length).toBe(5); // modes, physical, political, tools + settings

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

    // Lakes (a Top-N layer) are off by default
    expect(store.get().layers.lakes.enabled).toBe(false);
    expect(lakesCard?.classList.contains('active')).toBe(false);

    // Toggle lakes on
    lakesToggle?.click();
    expect(store.get().layers.lakes.enabled).toBe(true);
    expect(lakesCard?.classList.contains('active')).toBe(true);

    // Toggle lakes back off
    lakesToggle?.click();
    expect(store.get().layers.lakes.enabled).toBe(false);
    expect(lakesCard?.classList.contains('active')).toBe(false);

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
    expect(onStartQuiz).toHaveBeenCalledWith('classic');

    const quizReverseBtn = container.querySelector<HTMLButtonElement>('#btn-start-quiz-reverse');
    expect(quizReverseBtn).not.toBeNull();
    quizReverseBtn?.click();
    expect(onStartQuiz).toHaveBeenCalledWith('reverse');

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
    expect(getLayerColor('landforms')).toBe('hsl(140, 65%, 55%)');
    expect(getLayerColor('marine')).toBe('hsl(205, 90%, 60%)');
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

  it('updates graticule mode in store and reflects store changes in select element', () => {
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store });

    const graticuleSelect = container.querySelector<HTMLSelectElement>('#select-graticule');
    expect(graticuleSelect).not.toBeNull();
    expect(graticuleSelect?.value).toBe('off');

    // Change via UI
    if (graticuleSelect) {
      graticuleSelect.value = 'major';
      graticuleSelect.dispatchEvent(new Event('change'));
    }
    expect(store.get().graticule).toBe('major');

    // Change via UI to 15deg
    if (graticuleSelect) {
      graticuleSelect.value = '15deg';
      graticuleSelect.dispatchEvent(new Event('change'));
    }
    expect(store.get().graticule).toBe('15deg');

    // Change via store
    store.set({ ...store.get(), graticule: 'off' });
    expect(graticuleSelect?.value).toBe('off');

    sidebar.destroy();
  });

  it('updates theme in store and reflects store changes in select element', () => {
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store });

    const themeSelect = container.querySelector<HTMLSelectElement>('#select-theme');
    expect(themeSelect).not.toBeNull();
    expect(themeSelect?.value).toBe('dark');

    // Change via UI to classic
    if (themeSelect) {
      themeSelect.value = 'classic';
      themeSelect.dispatchEvent(new Event('change'));
    }
    expect(store.get().theme).toBe('classic');

    // Change via store back to dark
    store.set({ ...store.get(), theme: 'dark' });
    expect(themeSelect?.value).toBe('dark');

    sidebar.destroy();
  });

  it('toggles route comparison in store when clicking route comparison button', () => {
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store });

    const routeBtn = container.querySelector<HTMLButtonElement>('#btn-route-compare');
    expect(routeBtn).not.toBeNull();

    // Activate route comparison
    routeBtn?.click();
    expect(store.get().routeComparison?.active).toBe(true);

    // Deactivate route comparison
    routeBtn?.click();
    expect(store.get().routeComparison).toBeNull();

    sidebar.destroy();
  });

  it('toggles size comparison and antipodes tools in store', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                id: 'PL',
                properties: {
                  id: 'PL',
                  name_pl: 'Polska',
                  rank: { area: 312696 },
                  labelLat: 52,
                  labelLng: 19,
                },
                geometry: { type: 'Polygon', coordinates: [] },
              },
            ],
          }),
        }),
      ),
    );

    const store = createStore<AppState>({
      ...createInitialState(),
      selection: {
        id: 'PL',
        layerId: 'countriesTopN',
        kind: 'country',
        name_pl: 'Polska',
        lat: 52,
        lng: 19,
      },
    });
    const sidebar = new SidebarController({ container, store });

    // 1. Size Comparison
    const sizeBtn = container.querySelector<HTMLButtonElement>('#btn-size-compare');
    expect(sizeBtn).not.toBeNull();
    sizeBtn?.click();
    await new Promise(r => setTimeout(r, 20));
    expect(store.get().sizeComparison?.active).toBe(true);
    expect(store.get().sizeComparison?.countryId).toBe('PL');

    // Click again to deactivate
    sizeBtn?.click();
    expect(store.get().sizeComparison).toBeNull();

    // 2. Antipodes Simulator
    const antipodesBtn = container.querySelector<HTMLButtonElement>('#btn-antipodes');
    expect(antipodesBtn).not.toBeNull();
    antipodesBtn?.click();
    expect(store.get().antipodes?.active).toBe(true);
    expect(store.get().antipodes?.source?.lat).toBe(52);

    // Click again to deactivate
    antipodesBtn?.click();
    expect(store.get().antipodes).toBeNull();

    sidebar.destroy();
  });

  it('handles language switcher and clouds / knowledgeMap toggles', () => {
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store });

    // Language select
    const langSelect = container.querySelector<HTMLSelectElement>('#select-language');
    expect(langSelect).not.toBeNull();
    if (langSelect) {
      langSelect.value = 'en';
      langSelect.dispatchEvent(new Event('change'));
      expect(store.get().locale).toBe('en');
    }

    // Find cards by label
    const allCards = Array.from(container.querySelectorAll<HTMLElement>('.tl-layer-card'));
    const cloudsCard = allCards.find(
      c => c.textContent?.includes('Chmury') || c.textContent?.includes('Clouds'),
    );
    const cloudsToggle = cloudsCard?.querySelector<HTMLButtonElement>('.tl-toggle');
    expect(cloudsToggle).toBeDefined();
    cloudsToggle?.click();
    expect(store.get().clouds).toBe(false);

    // Knowledge map toggle in UI
    const kmCard = allCards.find(
      c => c.textContent?.includes('opanowania') || c.textContent?.includes('Knowledge'),
    );
    const kmToggle = kmCard?.querySelector<HTMLButtonElement>('.tl-toggle');
    expect(kmToggle).toBeDefined();
    kmToggle?.click();
    expect(store.get().knowledgeMap).toBe(true);

    sidebar.destroy();
  });

  it('handles progress export and import file interactions', () => {
    const store = createStore<AppState>(createInitialState());
    const sidebar = new SidebarController({ container, store });

    const exportBtn = container.querySelector<HTMLButtonElement>('#btn-export-progress');
    const importBtn = container.querySelector<HTMLButtonElement>('#btn-import-progress');
    const fileInput = container.querySelector<HTMLInputElement>('#input-import-progress');

    expect(exportBtn).not.toBeNull();
    expect(importBtn).not.toBeNull();
    expect(fileInput).not.toBeNull();

    // Click export
    exportBtn?.click();

    // Trigger fileInput click via importBtn
    let inputClicked = false;
    if (fileInput) {
      fileInput.click = () => {
        inputClicked = true;
      };
    }
    importBtn?.click();
    expect(inputClicked).toBe(true);

    // Test file input with empty files
    fileInput?.dispatchEvent(new Event('change'));

    // Test refresh
    sidebar.refresh();

    sidebar.destroy();
  });

  describe('map / settings views', () => {
    const view = (): string | null =>
      container.querySelector('.tl-sidebar')?.getAttribute('data-view') ?? null;

    it('keeps app settings out of the map view', () => {
      const store = createStore<AppState>(createInitialState());
      const sidebar = new SidebarController({ container, store });

      const settings = container.querySelector('.tl-settings-view')!;
      const map = container.querySelector('.tl-map-view')!;
      for (const id of ['select-theme', 'select-quality', 'select-graticule', 'select-language']) {
        expect(settings.querySelector(`#${id}`)).not.toBeNull();
        expect(map.querySelector(`#${id}`)).toBeNull();
      }
      // map toggles stay in the map view
      expect(map.querySelector('.tl-toggle')).not.toBeNull();

      sidebar.destroy();
    });

    it('starts on the map view and switches with the tabs', () => {
      const store = createStore<AppState>(createInitialState());
      const sidebar = new SidebarController({ container, store });
      const tab = (name: string): HTMLButtonElement =>
        container.querySelector<HTMLButtonElement>(`#tl-tab-${name}`)!;

      expect(view()).toBe('map');
      expect(tab('map').getAttribute('aria-selected')).toBe('true');
      expect(tab('settings').getAttribute('aria-selected')).toBe('false');

      tab('settings').click();
      expect(view()).toBe('settings');
      expect(sidebar.getView()).toBe('settings');
      expect(tab('settings').getAttribute('aria-selected')).toBe('true');
      expect(tab('settings').classList.contains('active')).toBe(true);

      tab('map').click();
      expect(view()).toBe('map');

      sidebar.destroy();
    });

    it('follows the navigation rail and announces view changes', () => {
      const store = createStore<AppState>(createInitialState());
      const sidebar = new SidebarController({ container, store });
      const changed = vi.fn();
      window.addEventListener('tl-view-changed', changed);

      window.dispatchEvent(new CustomEvent('tl-rail-select', { detail: { id: 'settings' } }));
      expect(view()).toBe('settings');
      expect((changed.mock.calls[0]![0] as CustomEvent).detail.view).toBe('settings');

      window.dispatchEvent(new CustomEvent('tl-rail-select', { detail: { id: 'explore' } }));
      expect(view()).toBe('map');

      window.removeEventListener('tl-view-changed', changed);
      sidebar.destroy();
    });

    it('stays on the settings view across a re-render (e.g. a language change)', () => {
      const store = createStore<AppState>(createInitialState());
      const sidebar = new SidebarController({ container, store });

      sidebar.setView('settings');
      sidebar.refresh();
      expect(view()).toBe('settings');
      expect(container.querySelector('#tl-tab-settings')?.getAttribute('aria-selected')).toBe(
        'true',
      );

      sidebar.destroy();
    });

    it('shows no color dots on the settings rows (they encode nothing)', () => {
      const store = createStore<AppState>(createInitialState());
      const sidebar = new SidebarController({ container, store });

      expect(container.querySelectorAll('.tl-settings-view .tl-layer-dot')).toHaveLength(0);
      expect(container.querySelectorAll('.tl-map-view .tl-layer-dot').length).toBeGreaterThan(0);

      sidebar.destroy();
    });

    it('stops listening to the rail after destroy', () => {
      const store = createStore<AppState>(createInitialState());
      const sidebar = new SidebarController({ container, store });
      sidebar.destroy();
      expect(() =>
        window.dispatchEvent(new CustomEvent('tl-rail-select', { detail: { id: 'settings' } })),
      ).not.toThrow();
    });
  });
});
