import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInitialState, createStore } from './store';
import { STORAGE_KEY } from './persistence';
import { restoreState, startStateSync, STATE_SYNC_DELAY_MS } from './state-sync';
import type { AppState, Store } from './types';

/**
 * In-memory Storage. happy-dom's localStorage is a Proxy whose methods cannot be reliably
 * spied on and restored, so tests swap the whole object instead.
 */
function createFakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, String(value))),
    removeItem: vi.fn((key: string) => void data.delete(key)),
    clear: vi.fn(() => data.clear()),
  };
}

let storage: ReturnType<typeof createFakeStorage>;

function saved(): Record<string, unknown> | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

describe('State sync', () => {
  let store: Store<AppState>;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = createFakeStorage();
    vi.stubGlobal('localStorage', storage);
    window.history.replaceState(null, '', '/');
    store = createStore(createInitialState());
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('restoreState', () => {
    it('applies defaults < localStorage < URL', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ theme: 'classic', locale: 'pl', clouds: false, moonScale: 5 }),
      );

      restoreState(store, '?theme=dark&grid=major');

      const state = store.get();
      expect(state.theme).toBe('dark'); // URL wins over storage
      expect(state.graticule).toBe('major'); // URL only
      expect(state.locale).toBe('pl'); // storage only
      expect(state.clouds).toBe(false);
      expect(state.moonScale).toBe(5);
      expect(state.dayNight).toBe(true); // default
    });

    it('does not write anything back', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'classic' }));

      // Same order as bootstrap(): restore first, then start syncing
      restoreState(store, '?clouds=0');
      dispose = startStateSync(store);
      vi.runAllTimers();

      // The shared view stays out of storage until the user changes something
      expect(saved()).toEqual({ theme: 'classic' });
      expect(store.get().clouds).toBe(false);
    });

    it('keeps defaults when storage is unreadable', () => {
      storage.getItem.mockImplementation(() => {
        throw new Error('SecurityError');
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => restoreState(store, '')).not.toThrow();
      expect(store.get().theme).toBe('dark');
    });
  });

  describe('startStateSync', () => {
    it('saves settings and mirrors the view into the URL after the debounce delay', () => {
      dispose = startStateSync(store);
      store.set({ theme: 'classic' });

      vi.advanceTimersByTime(STATE_SYNC_DELAY_MS - 1);
      expect(saved()).toBeNull();

      vi.advanceTimersByTime(1);
      expect(saved()?.theme).toBe('classic');
      expect(new URLSearchParams(window.location.search).get('theme')).toBe('classic');
    });

    it('collapses a burst of changes into one write', () => {
      const setItem = storage.setItem;
      dispose = startStateSync(store);

      store.set({ theme: 'classic' });
      vi.advanceTimersByTime(100);
      store.set({ clouds: false });
      vi.advanceTimersByTime(100);
      store.set({ locale: 'pl' });
      vi.runAllTimers();

      expect(setItem).toHaveBeenCalledTimes(1);
      expect(saved()).toMatchObject({ theme: 'classic', clouds: false, locale: 'pl' });
    });

    it('ignores changes to transient fields', () => {
      const setItem = storage.setItem;
      const replaceState = vi.spyOn(window.history, 'replaceState');
      dispose = startStateSync(store);

      store.set({
        selection: { id: 'PL', layerId: 'countriesTopN', kind: 'country' },
        hovered: { id: 'DE', layerId: 'countriesTopN', kind: 'country' },
        globeClick: { lat: 1, lng: 2 },
        routeComparison: { active: true, from: null, to: null },
        antipodes: { active: true, source: null, antipode: null },
        moonPanelOpen: true,
        hideSelectionLabel: true,
        mode: 'quiz',
      });
      vi.runAllTimers();

      expect(setItem).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();
    });

    it('never writes transient fields to storage', () => {
      dispose = startStateSync(store);
      store.set({
        selection: { id: 'PL', layerId: 'countriesTopN', kind: 'country' },
        moonPanelOpen: true,
        theme: 'classic',
      });
      vi.runAllTimers();

      const keys = Object.keys(saved() ?? {});
      expect(keys).toContain('theme');
      for (const key of ['selection', 'hovered', 'globeClick', 'moonPanelOpen', 'mode', 'preset']) {
        expect(keys).not.toContain(key);
      }
    });

    it('keeps params owned by other features in the URL', () => {
      window.history.replaceState(null, '', '/?dev=true#about');
      dispose = startStateSync(store);

      store.set({ graticule: '15deg' });
      vi.runAllTimers();

      const params = new URLSearchParams(window.location.search);
      expect(params.get('dev')).toBe('true');
      expect(params.get('grid')).toBe('15deg');
      expect(window.location.hash).toBe('#about');
    });

    it('does not put preferences into the URL', () => {
      const replaceState = vi.spyOn(window.history, 'replaceState');
      dispose = startStateSync(store);

      store.set({ locale: 'pl', quality: 'low', moonScale: 4 });
      vi.runAllTimers();

      expect(saved()).toMatchObject({ locale: 'pl', quality: 'low', moonScale: 4 });
      expect(replaceState).not.toHaveBeenCalled();
      expect(window.location.search).toBe('');
    });

    it('flushes a pending write when the page is hidden', () => {
      dispose = startStateSync(store);
      store.set({ dayNight: false });

      window.dispatchEvent(new Event('pagehide'));
      expect(saved()?.dayNight).toBe(false);
    });

    it('stops listening after dispose', () => {
      const setItem = storage.setItem;
      dispose = startStateSync(store);
      store.set({ theme: 'classic' });
      dispose();
      dispose = null;

      vi.runAllTimers();
      window.dispatchEvent(new Event('pagehide'));
      store.set({ clouds: false });
      vi.runAllTimers();

      expect(setItem).not.toHaveBeenCalled();
    });

    it('keeps the app running when storage is full', () => {
      storage.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      dispose = startStateSync(store);

      store.set({ theme: 'classic' });
      expect(() => vi.runAllTimers()).not.toThrow();
      expect(new URLSearchParams(window.location.search).get('theme')).toBe('classic');
    });
  });
});
