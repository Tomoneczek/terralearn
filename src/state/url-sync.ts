import type { AppState, LayerState, AppMode } from './types';
import { getLayer, type LayerId } from '@/layers';

export function serializeStateToUrl(state: AppState): string {
  const params = new URLSearchParams();

  // Active layers
  const activeLayers = (Object.entries(state.layers) as [LayerId, LayerState][])
    .filter(([_, s]) => s.enabled)
    .map(([id]) => id);

  if (activeLayers.length > 0) {
    params.set('layers', activeLayers.join(','));
  }

  // TopN values for active layers
  for (const [id, s] of Object.entries(state.layers) as [LayerId, LayerState][]) {
    if (s.enabled && s.topN !== undefined) {
      params.set(`top.${id}`, String(s.topN));
    }
  }

  if (state.mode !== 'explore') {
    params.set('mode', state.mode);
  }

  if (!state.dayNight) {
    params.set('dayNight', '0');
  }

  if (state.hiddenLabels) {
    params.set('hiddenLabels', '1');
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

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
      const topNParam = params.get(`top.${key}`);

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

  const modeParam = params.get('mode');
  let mode: AppMode = baseState.mode;
  if (modeParam === 'explore' || modeParam === 'learn' || modeParam === 'quiz') {
    mode = modeParam;
  }

  const dayNightParam = params.get('dayNight');
  const dayNight = dayNightParam !== null ? dayNightParam === '1' : baseState.dayNight;

  const hiddenLabelsParam = params.get('hiddenLabels');
  const hiddenLabels =
    hiddenLabelsParam !== null ? hiddenLabelsParam === '1' : baseState.hiddenLabels;

  return {
    ...baseState,
    layers: nextLayers,
    mode,
    dayNight,
    hiddenLabels,
  };
}
