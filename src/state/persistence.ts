import { z } from 'zod';
import type { AppState, LayerState } from './types';
import type { LayerId } from '@/layers';

export const STORAGE_KEY = 'terralearn_state_v1';

const LayerStateSchema = z.object({
  enabled: z.boolean(),
  topN: z.number().int().positive().optional(),
});

const PersistedStateSchema = z.object({
  layers: z.record(z.string(), LayerStateSchema).optional(),
  theme: z.enum(['dark', 'classic']).optional(),
  dayNight: z.boolean().optional(),
  clouds: z.boolean().optional(),
  quality: z.enum(['auto', 'low', 'medium', 'high']).optional(),
  graticule: z.enum(['off', 'major', '15deg']).optional(),
  hiddenLabels: z.boolean().optional(),
  knowledgeMap: z.boolean().optional(),
});

export type PersistedState = z.infer<typeof PersistedStateSchema>;

export function loadPersistedState(): PersistedState | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const validated = PersistedStateSchema.safeParse(parsed);

    if (!validated.success) {
      console.warn('Invalid persisted state in localStorage, resetting.', validated.error);
      return null;
    }

    return validated.data;
  } catch (err) {
    console.warn('Failed to read persisted state from localStorage:', err);
    return null;
  }
}

export function savePersistedState(state: AppState): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    const toSave: PersistedState = {
      layers: state.layers,
      theme: state.theme,
      dayNight: state.dayNight,
      clouds: state.clouds,
      quality: state.quality,
      graticule: state.graticule,
      hiddenLabels: state.hiddenLabels,
      knowledgeMap: state.knowledgeMap,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.warn('Failed to save state to localStorage:', err);
  }
}

export function applyPersistedState(
  baseState: AppState,
  persisted: PersistedState | null,
): AppState {
  if (!persisted) return baseState;

  const mergedLayers = { ...baseState.layers };

  if (persisted.layers) {
    for (const [key, val] of Object.entries(persisted.layers)) {
      if (key in mergedLayers) {
        mergedLayers[key as LayerId] = val as LayerState;
      }
    }
  }

  return {
    ...baseState,
    layers: mergedLayers,
    theme: persisted.theme ?? baseState.theme,
    dayNight: persisted.dayNight ?? baseState.dayNight,
    clouds: persisted.clouds ?? baseState.clouds,
    quality: persisted.quality ?? baseState.quality,
    graticule: persisted.graticule ?? baseState.graticule,
    hiddenLabels: persisted.hiddenLabels ?? baseState.hiddenLabels,
    knowledgeMap: persisted.knowledgeMap ?? baseState.knowledgeMap,
  };
}

export function clearPersistedState(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear persisted state from localStorage:', err);
    }
  }
}
