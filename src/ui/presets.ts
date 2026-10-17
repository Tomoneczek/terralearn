import type { Store, AppState } from '@/state/types';
import type { LayerId } from '@/layers/types';

export type PresetId = 'physical' | 'political' | 'all';

export interface LayerPresetConfig {
  id: PresetId;
  nameKey: 'modes.physical' | 'modes.political' | 'modes.all';
  enabledLayers: readonly LayerId[];
  disabledLayers: readonly LayerId[];
}

export const PRESETS: readonly LayerPresetConfig[] = [
  {
    id: 'physical',
    nameKey: 'modes.physical',
    enabledLayers: ['lakes', 'rivers', 'mountains', 'deserts', 'peaks', 'landforms', 'marine'],
    disabledLayers: ['borders', 'countriesTopN', 'capitals', 'megacities'],
  },
  {
    id: 'political',
    nameKey: 'modes.political',
    enabledLayers: ['borders', 'countriesTopN', 'capitals', 'megacities'],
    disabledLayers: ['lakes', 'rivers', 'mountains', 'deserts', 'peaks', 'landforms', 'marine'],
  },
  {
    id: 'all',
    nameKey: 'modes.all',
    enabledLayers: [
      'borders',
      'countriesTopN',
      'capitals',
      'megacities',
      'lakes',
      'rivers',
      'mountains',
      'deserts',
      'peaks',
      'landforms',
      'marine',
    ],
    disabledLayers: [],
  },
] as const;

export function applyPreset(presetId: PresetId, store: Store<AppState>): void {
  const preset = PRESETS.find(p => p.id === presetId);
  if (!preset) return;

  const current = store.get();
  const nextLayers = { ...current.layers };

  for (const layerId of preset.enabledLayers) {
    nextLayers[layerId] = {
      ...nextLayers[layerId],
      enabled: true,
      topN: nextLayers[layerId]?.topN ?? 20,
    };
  }

  for (const layerId of preset.disabledLayers) {
    nextLayers[layerId] = {
      ...nextLayers[layerId],
      enabled: false,
    };
  }

  store.set({
    ...current,
    layers: nextLayers,
  });
}

export function detectActivePreset(layers: AppState['layers']): PresetId | 'custom' {
  for (const preset of PRESETS) {
    const isMatch =
      preset.enabledLayers.every(id => layers[id]?.enabled === true) &&
      preset.disabledLayers.every(id => layers[id]?.enabled === false);

    if (isMatch) {
      return preset.id;
    }
  }

  return 'custom';
}
