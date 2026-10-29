import type { AppState, FeatureRef, Store } from '@/state/types';
import { getLayer } from '@/layers';
import { EARTH_RADIUS_KM } from '@/geo/spherical';
import { CATEGORY_KIND, rowLayer, type RankingCategory, type RankingRow } from './types';

const MIN_ALTITUDE = 0.4;
const MAX_ALTITUDE = 2;

/** Camera altitude (in globe radii) from which an object of the given size is seen whole. */
export function altitudeForExtent(extentKm: number): number {
  const altitude = 0.35 + (extentKm / EARTH_RADIUS_KM) * 1.4;
  return Math.min(MAX_ALTITUDE, Math.max(MIN_ALTITUDE, altitude));
}

export function featureRefForRow(row: RankingRow, category: RankingCategory): FeatureRef {
  return {
    id: row.id,
    layerId: rowLayer(row, category),
    kind: row.kind ?? CATEGORY_KIND[category],
    name_pl: row.name_pl,
    name_en: row.name_en,
    lat: row.lat,
    lng: row.lng,
  };
}

/** Whether the object is currently drawn on the globe (its layer is on, it has geometry and is within Top N). */
export function isRowDrawn(
  row: RankingRow,
  category: RankingCategory,
  layers: AppState['layers'],
): boolean {
  const layerId = rowLayer(row, category);
  const layer = layers[layerId];
  if (!layer?.enabled || row.layerOrder === undefined) return false;
  const limit = getLayer(layerId)?.topN ? layer.topN : undefined;
  return limit === undefined || row.layerOrder <= limit;
}

export interface LocateOptions {
  store: Store<AppState>;
  flyTo: (lat: number, lng: number, altitude: number) => void;
}

/**
 * Shows a table row on the globe: turns its layer on if needed, flies the camera there and selects
 * the object (which opens its card and highlights it, also when it is outside the Top N).
 */
export function locateRow(
  row: RankingRow,
  category: RankingCategory,
  { store, flyTo }: LocateOptions,
): void {
  const layerId = rowLayer(row, category);
  const layer = store.get().layers[layerId];
  // Only objects with geometry need their layer; the others get the selection halo alone
  if (layer && !layer.enabled && row.layerOrder !== undefined) {
    store.set(s => ({
      layers: { ...s.layers, [layerId]: { ...s.layers[layerId], enabled: true } },
    }));
  }
  flyTo(row.lat, row.lng, altitudeForExtent(row.extentKm));
  store.set({ selection: featureRefForRow(row, category), moonPanelOpen: false });
}
