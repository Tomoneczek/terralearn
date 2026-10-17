import type { LayerId } from '@/layers';

export interface FeatureRef {
  id: string;
  layerId: LayerId;
  kind: string;
  name?: string;
  name_pl?: string;
  name_en?: string;
  lat?: number;
  lng?: number;
}

export type AppMode = 'explore' | 'learn' | 'quiz';
export type AppPreset = 'physical' | 'political' | 'custom';
export type AppTheme = 'dark' | 'classic';
export type QualityPreset = 'auto' | 'low' | 'medium' | 'high';

export interface LayerState {
  enabled: boolean;
  topN?: number;
}

export interface AppState {
  layers: Record<LayerId, LayerState>;
  mode: AppMode;
  preset: AppPreset;
  theme: AppTheme;
  dayNight: boolean;
  clouds: boolean;
  quality: QualityPreset;
  hiddenLabels: boolean;
  selection: FeatureRef | null;
  hovered: FeatureRef | null;
  globeClick: { lat: number; lng: number } | null;
}

export type Selector<T, V> = (state: T) => V;
export type Listener<V> = (value: V, prevValue: V) => void;
export type EqualityFn<V> = (a: V, b: V) => boolean;

export interface Store<T> {
  get(): T;
  set(updater: Partial<T> | ((prev: T) => Partial<T> | T)): void;
  subscribe<V = T>(
    selector: Selector<T, V>,
    listener: Listener<V>,
    equalityFn?: EqualityFn<V>,
  ): () => void;
}
