import type { AppState, AppTheme, GraticuleMode, LayerState } from './types';
import { createInitialState } from './store';
import { getLayer, type LayerId } from '@/layers';

/**
 * The URL carries the shareable *view* (what the map looks like), not personal preferences:
 * locale, quality, knowledge map and Moon size stay in localStorage only (see persistence.ts).
 */
const VIEW_PARAMS = ['layers', 'theme', 'dayNight', 'clouds', 'grid', 'hiddenLabels'] as const;
const TOP_N_PREFIX = 'top.';
/** Params this module used to write; removed from the URL so old links do not keep them. */
const LEGACY_PARAMS = ['mode'] as const;

const THEMES: readonly AppTheme[] = ['dark', 'classic'];
const GRATICULE_MODES: readonly GraticuleMode[] = ['off', 'major', '15deg'];

type ViewState = Pick<
  AppState,
  'layers' | 'theme' | 'dayNight' | 'clouds' | 'graticule' | 'hiddenLabels'
>;

function pickView(state: AppState): ViewState {
  return {
    layers: state.layers,
    theme: state.theme,
    dayNight: state.dayNight,
    clouds: state.clouds,
    graticule: state.graticule,
    hiddenLabels: state.hiddenLabels,
  };
}

function isOwnParam(key: string): boolean {
  return (
    (VIEW_PARAMS as readonly string[]).includes(key) ||
    (LEGACY_PARAMS as readonly string[]).includes(key) ||
    key.startsWith(TOP_N_PREFIX)
  );
}

function sameLayers(a: AppState['layers'], b: AppState['layers']): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<LayerId>;
  for (const key of keys) {
    if (a[key]?.enabled !== b[key]?.enabled || a[key]?.topN !== b[key]?.topN) return false;
  }
  return true;
}

function isDefaultView(view: ViewState): boolean {
  const defaults = pickView(createInitialState());
  return (
    sameLayers(view.layers, defaults.layers) &&
    view.theme === defaults.theme &&
    view.dayNight === defaults.dayNight &&
    view.clouds === defaults.clouds &&
    view.graticule === defaults.graticule &&
    view.hiddenLabels === defaults.hiddenLabels
  );
}

/**
 * Serializes the view part of the state into a query string (with a leading `?`, or `''`).
 *
 * The default view yields no view params at all. Any other view is written in full, so a shared
 * link reproduces it regardless of the recipient's saved preferences. Params owned by other
 * features in `currentSearch` (e.g. `dev`, `time`) are kept as they are.
 */
export function serializeStateToUrl(state: AppState, currentSearch = ''): string {
  const params = new URLSearchParams(
    currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch,
  );
  for (const key of [...params.keys()]) {
    if (isOwnParam(key)) params.delete(key);
  }

  const view = pickView(state);
  if (!isDefaultView(view)) {
    const entries = Object.entries(view.layers) as [LayerId, LayerState][];
    params.set(
      'layers',
      entries
        .filter(([, s]) => s.enabled)
        .map(([id]) => id)
        .join(','),
    );
    for (const [id, s] of entries) {
      if (s.enabled && s.topN !== undefined) {
        params.set(`${TOP_N_PREFIX}${id}`, String(s.topN));
      }
    }
    params.set('theme', view.theme);
    params.set('dayNight', view.dayNight ? '1' : '0');
    params.set('clouds', view.clouds ? '1' : '0');
    params.set('grid', view.graticule);
    params.set('hiddenLabels', view.hiddenLabels ? '1' : '0');
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

function parseFlag(value: string | null, fallback: boolean): boolean {
  if (value === '1') return true;
  if (value === '0') return false;
  return fallback;
}

function parseEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Applies the view params of a query string on top of `baseState`. Missing or invalid params
 * leave the corresponding field untouched.
 */
export function parseStateFromUrl(queryString: string, baseState: AppState): AppState {
  if (!queryString || queryString === '?') {
    return baseState;
  }

  const params = new URLSearchParams(
    queryString.startsWith('?') ? queryString.slice(1) : queryString,
  );
  const layersParam = params.get('layers');

  const nextLayers = { ...baseState.layers };

  if (layersParam !== null) {
    const enabledSet = new Set(layersParam.split(',').map(s => s.trim()));

    // Disable all by default when explicit list provided, enable only whitelisted
    for (const key of Object.keys(nextLayers) as LayerId[]) {
      const def = getLayer(key);
      const isEnabled = enabledSet.has(key);

      let topNVal = nextLayers[key].topN;
      const topNParam = params.get(`${TOP_N_PREFIX}${key}`);

      if (topNParam !== null && def?.topN) {
        const parsed = parseInt(topNParam, 10);
        if (!isNaN(parsed)) {
          topNVal = Math.min(Math.max(parsed, def.topN.min), def.topN.max);
        }
      }

      nextLayers[key] = {
        enabled: isEnabled,
        ...(topNVal !== undefined ? { topN: topNVal } : {}),
      };
    }
  }

  return {
    ...baseState,
    layers: nextLayers,
    theme: parseEnum(params.get('theme'), THEMES, baseState.theme),
    dayNight: parseFlag(params.get('dayNight'), baseState.dayNight),
    clouds: parseFlag(params.get('clouds'), baseState.clouds),
    graticule: parseEnum(params.get('grid'), GRATICULE_MODES, baseState.graticule),
    hiddenLabels: parseFlag(params.get('hiddenLabels'), baseState.hiddenLabels),
  };
}
