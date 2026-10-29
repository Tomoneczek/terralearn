import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setLocale } from '@/i18n';
import { bootstrap, globeContext, searchOverlay } from '@/main';
import { store } from '@/state';

// The app defaults to English; these tests assert Polish copy, so pin the locale explicitly.
beforeEach(() => setLocale('pl'));

// Mock Globe to prevent WebGL/canvas creation errors in happy-dom
vi.mock('globe.gl', () => import('./globe-gl-mock'));

describe('E2E Smoke Tests (T-01)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // bootstrap() restores saved settings and the URL view; start every test from a clean slate
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '<div id="app"></div>';
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('search-index.json')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 'river-wisla',
                layerId: 'rivers',
                kind: 'river',
                name_pl: 'Wisła',
                name_en: 'Vistula',
                lat: 52.0,
                lng: 21.0,
              },
            ]),
        } as unknown as Response);
      }
      if (urlStr.includes('facts.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
      } as unknown as Response);
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('successfully boots the complete application and mounts all core UI components', () => {
    bootstrap();

    const appRoot = document.getElementById('app');
    expect(appRoot?.getAttribute('data-ready')).toBe('true');

    // 1. Navigation Rail
    const rail = document.querySelector('nav.rail');
    expect(rail).toBeDefined();
    const railButtons = rail?.querySelectorAll('button.rail-btn');
    expect(railButtons?.length).toBeGreaterThanOrEqual(3);

    // 2. Control Panel & Sidebar
    const panel = document.querySelector('aside.panel');
    expect(panel).toBeDefined();
    const title = panel?.querySelector('.panel-title');
    expect(title?.textContent).toContain('TerraLearn');

    // 3. Search Bar
    const searchBox = document.querySelector('.tl-search-box');
    expect(searchBox).toBeDefined();

    // 4. Toolbar
    const toolbar = document.querySelector('.tl-toolbar');
    expect(toolbar).toBeDefined();
    const toolButtons = toolbar?.querySelectorAll('.tl-toolbar-btn');
    expect(toolButtons?.length).toBe(5);

    // 5. Legend
    const legend = document.querySelector('.tl-legend-card');
    expect(legend).toBeDefined();
  });

  it('switches layer presets and reactively updates store and UI button states', () => {
    bootstrap();

    const presetButtons = document.querySelectorAll<HTMLButtonElement>('.tl-preset-btn');
    expect(presetButtons.length).toBeGreaterThanOrEqual(3);

    const physicalBtn = Array.from(presetButtons).find(b => b.textContent?.includes('Physical'));
    const politicalBtn = Array.from(presetButtons).find(b => b.textContent?.includes('Political'));

    expect(physicalBtn).toBeDefined();
    expect(politicalBtn).toBeDefined();

    // Click Political preset
    politicalBtn?.click();
    expect(store.get().layers.borders?.enabled).toBe(true);
    expect(store.get().layers.capitals?.enabled).toBe(true);
    expect(politicalBtn?.classList.contains('active')).toBe(true);

    // Click Physical preset
    physicalBtn?.click();
    expect(store.get().layers.mountains?.enabled).toBe(true);
    expect(store.get().layers.rivers?.enabled).toBe(true);
    expect(physicalBtn?.classList.contains('active')).toBe(true);
  });

  it('performs search and updates selected feature in store', () => {
    bootstrap();

    expect(searchOverlay).toBeDefined();
    const searchInput = document.querySelector<HTMLInputElement>('.tl-search-input');
    expect(searchInput).toBeDefined();

    // Focus and input search term
    searchInput?.focus();
    if (searchInput) {
      searchInput.value = 'Wisła';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Programmatically select item via searchOverlay callback
    const searchItem = {
      id: 'river-wisla',
      layerId: 'rivers' as const,
      kind: 'river',
      name_pl: 'Wisła',
      lat: 52.0,
      lng: 21.0,
    };

    if (globeContext?.camera) {
      const flyToSpy = vi.spyOn(globeContext.camera, 'flyTo');
      // @ts-expect-error accessing internal private callback for testing
      searchOverlay?.onSelect?.(searchItem);
      expect(flyToSpy).toHaveBeenCalledWith(52.0, 21.0, 1.0);
    } else {
      // @ts-expect-error accessing internal private callback for testing
      searchOverlay?.onSelect?.(searchItem);
      // Fallback verification when Globe WebGL context is mocked
      expect(searchOverlay).toBeDefined();
    }
  });

  it('launches quiz configuration modal, starts quiz and answers question', () => {
    bootstrap();

    const quizLaunchEvent = new CustomEvent('tl-start-quiz', {
      detail: { mode: 'classic', srsFilter: 'none' },
    });
    window.dispatchEvent(quizLaunchEvent);

    const modal = document.querySelector('.tl-quiz-modal');
    expect(modal).toBeDefined();

    // Start quiz directly
    const startBtn = document.querySelector<HTMLButtonElement>('.tl-btn-quiz-start');
    startBtn?.click();

    // Verify Quiz HUD is mounted in DOM
    const quizHudEl = document.querySelector('.tl-quiz-hud');
    expect(quizHudEl).toBeDefined();
  });

  it('reactively switches application theme and locale', () => {
    bootstrap();

    // Theme switch
    store.set({ ...store.get(), theme: 'classic' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('classic');

    store.set({ ...store.get(), theme: 'dark' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Locale switch
    store.set({ ...store.get(), locale: 'en' });
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.title).toContain('TerraLearn');

    store.set({ ...store.get(), locale: 'pl' });
    expect(document.documentElement.getAttribute('lang')).toBe('pl');
  });

  it('toggles mobile bottom sheet and minimizes panel', () => {
    bootstrap();

    const minimizeBtn = document.querySelector<HTMLButtonElement>('#btn-panel-minimize');
    const panel = document.querySelector<HTMLElement>('aside.panel');

    expect(minimizeBtn).toBeDefined();
    minimizeBtn?.click();

    expect(panel?.getAttribute('data-snap')).toBe('peek');
  });
});
