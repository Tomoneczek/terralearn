import type { LocalizedText } from '@/i18n/t';
import type { LayerId } from '@/layers';
import type { RankingCategory } from '@/rankings/types';

export interface FeatureRef {
  id: string;
  layerId: LayerId;
  kind: string;
  name?: string;
  name_pl?: string;
  name_en?: string;
  /** Value of a data cell under the pointer (people/km² for the population grid). */
  value?: number;
  lat?: number;
  lng?: number;
}

export type AppMode = 'explore' | 'learn' | 'quiz';
export type AppPreset = 'physical' | 'political' | 'custom';
export type AppTheme = 'dark' | 'classic';
export type QualityPreset = 'auto' | 'low' | 'medium' | 'high';
export type GraticuleMode = 'off' | 'major' | '15deg';

export interface LayerState {
  enabled: boolean;
  topN?: number;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  label?: LocalizedText;
}

export interface RouteComparisonState {
  active: boolean;
  from: RoutePoint | null;
  to: RoutePoint | null;
}

export interface SizeComparisonState {
  active: boolean;
  countryId: string | null;
  countryName: LocalizedText | null;
  countryAreaKm2: number | null;
  targetLat: number;
  targetLng: number;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
}

export interface AntipodesPoint {
  lat: number;
  lng: number;
  label?: LocalizedText;
  locationName?: string;
  isLand?: boolean;
}

export interface AntipodesState {
  active: boolean;
  source: AntipodesPoint | null;
  antipode: AntipodesPoint | null;
}

export interface AppState {
  layers: Record<LayerId, LayerState>;
  mode: AppMode;
  preset: AppPreset;
  theme: AppTheme;
  dayNight: boolean;
  clouds: boolean;
  quality: QualityPreset;
  graticule: GraticuleMode;
  locale: 'pl' | 'en';
  hiddenLabels: boolean;
  hideSelectionLabel?: boolean;
  knowledgeMap?: boolean;
  selection: FeatureRef | null;
  hovered: FeatureRef | null;
  globeClick: { lat: number; lng: number } | null;
  routeComparison: RouteComparisonState | null;
  sizeComparison: SizeComparisonState | null;
  antipodes: AntipodesState | null;
  /** Moon size multiplier on the globe; 1 = real scale. */
  moonScale: number;
  /** Whether the Moon panel is open (not persisted). */
  moonPanelOpen: boolean;
  /** Whether the rankings table is open (not persisted). */
  rankingsPanelOpen: boolean;
  /** Category shown in the rankings table; the last one used is remembered. */
  rankingsCategory: RankingCategory;
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
