import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEY, STATE_SYNC_DELAY_MS } from '@/state';

vi.mock('globe.gl', () => import('./globe-gl-mock'));

type StateModule = typeof import('@/state');

/**
 * Simulates a page load: fresh modules (so a fresh store with default values), an empty DOM,
 * then importing `@/main`, which runs `bootstrap()` just like the browser does.
 */
async function loadPage(): Promise<StateModule> {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  const state = await import('@/state');
  await import('@/main');
  return state;
}

/** Leaves the page the way a browser does on reload, flushing pending writes. */
function unloadPage(): void {
  window.dispatchEvent(new Event('pagehide'));
  document.body.innerHTML = '';
}

function layerSwitch(layerId: string): HTMLButtonElement {
  const toggle = document.querySelector<HTMLButtonElement>(
    `[data-layer-id="${layerId}"] button[role="switch"]`,
  );
  if (!toggle) throw new Error(`No switch for layer ${layerId}`);
  return toggle;
}

function select(id: string): HTMLSelectElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLSelectElement)) throw new Error(`No select #${id}`);
  return el;
}

describe('Settings persistence across reloads (E2E smoke)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ type: 'FeatureCollection', features: [] }),
    } as unknown as Response);
  });

  afterEach(() => {
    unloadPage();
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('keeps settings changed in the UI after a reload, and drops the selection', async () => {
    const first = await loadPage();
    const lakesWereOn = first.store.get().layers.lakes.enabled;

    const theme = select('select-theme');
    theme.value = 'classic';
    theme.dispatchEvent(new Event('change'));
    const language = select('select-language');
    language.value = 'pl';
    language.dispatchEvent(new Event('change'));
    layerSwitch('lakes').click();
    first.store.set({ moonScale: 6 });
    first.store.set({ selection: { id: 'PL', layerId: 'countriesTopN', kind: 'country' } });
    unloadPage();

    const second = await loadPage();
    const state = second.store.get();
    expect(second.store).not.toBe(first.store);
    expect(state.theme).toBe('classic');
    expect(state.locale).toBe('pl');
    expect(state.layers.lakes.enabled).toBe(!lakesWereOn);
    expect(state.moonScale).toBe(6);
    expect(state.selection).toBeNull();

    // The UI was built from the restored state, not from defaults
    expect(document.documentElement.getAttribute('data-theme')).toBe('classic');
    expect(document.documentElement.getAttribute('lang')).toBe('pl');
    expect(select('select-theme').value).toBe('classic');
    expect(layerSwitch('lakes').getAttribute('aria-checked')).toBe(String(!lakesWereOn));
  });

  it('saves on its own after the debounce delay, without an unload', async () => {
    vi.useFakeTimers();
    const { store } = await loadPage();

    store.set({ dayNight: false });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(STATE_SYNC_DELAY_MS);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').dayNight).toBe(false);
    expect(new URLSearchParams(window.location.search).get('dayNight')).toBe('0');
  });

  it('opens a shared link with its view, keeping the local language and dev flag', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', locale: 'pl' }));
    window.history.replaceState(null, '', '/?dev=false&theme=classic&grid=major&clouds=0');

    const { store } = await loadPage();
    const state = store.get();
    expect(state.theme).toBe('classic');
    expect(state.graticule).toBe('major');
    expect(state.clouds).toBe(false);
    expect(state.locale).toBe('pl');

    // Opening the link alone does not overwrite saved preferences
    unloadPage();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
      theme: 'dark',
      locale: 'pl',
    });
    expect(new URLSearchParams(window.location.search).get('dev')).toBe('false');
  });
});
