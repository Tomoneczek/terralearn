import type { AppState, Store } from './types';
import {
  applyPersistedState,
  loadPersistedState,
  pickPersistedState,
  savePersistedState,
  type PersistedState,
} from './persistence';
import { parseStateFromUrl, serializeStateToUrl } from './url-sync';

/** Delay between the last settings change and writing it to localStorage and the URL. */
export const STATE_SYNC_DELAY_MS = 300;

/**
 * Restores settings on boot: defaults < localStorage < URL. Call it before any UI component reads
 * the store. It only sets the store; nothing is written back until the user changes something.
 */
export function restoreState(store: Store<AppState>, search = window.location.search): void {
  const fromStorage = applyPersistedState(store.get(), loadPersistedState());
  store.set(parseStateFromUrl(search, fromStorage));
}

function shallowEqual(a: PersistedState, b: PersistedState): boolean {
  const keys = Object.keys(a) as (keyof PersistedState)[];
  return keys.length === Object.keys(b).length && keys.every(key => Object.is(a[key], b[key]));
}

function writeUrl(state: AppState): void {
  const { pathname, search, hash } = window.location;
  const nextSearch = serializeStateToUrl(state, search);
  if (nextSearch === search) return;
  try {
    window.history.replaceState(window.history.state, '', `${pathname}${nextSearch}${hash}`);
  } catch (err) {
    console.warn('Failed to update the URL with the current view:', err);
  }
}

export interface StateSyncOptions {
  delayMs?: number;
}

/**
 * Saves persisted settings to localStorage and mirrors the view into the URL (`replaceState`),
 * debounced. Changes to transient fields (selection, hover, tools, quiz) never trigger a write.
 * A pending write is flushed when the page is hidden or unloaded. Returns a dispose function.
 */
export function startStateSync(
  store: Store<AppState>,
  { delayMs = STATE_SYNC_DELAY_MS }: StateSyncOptions = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const state = store.get();
    savePersistedState(state);
    writeUrl(state);
  };

  const unsubscribe = store.subscribe(
    pickPersistedState,
    () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    shallowEqual,
  );

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
