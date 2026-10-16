import type { Store, AppState, FeatureRef } from '@/state/types';
import type { LayerId } from '@/layers';
import type { GeoFeature } from './data-loader';

export interface GlobeEventsDelegate {
  onPolygonClick?(
    fn: (
      polygon: object,
      event: MouseEvent,
      coords: { lat: number; lng: number; altitude: number },
    ) => void,
  ): this;
  onPolygonHover?(fn: (polygon: object | null, prevPolygon: object | null) => void): this;
  onPathClick?(
    fn: (
      path: object,
      event: MouseEvent,
      coords: { lat: number; lng: number; altitude: number },
    ) => void,
  ): this;
  onPathHover?(fn: (path: object | null, prevPath: object | null) => void): this;
  onPointClick?(
    fn: (
      point: object,
      event: MouseEvent,
      coords: { lat: number; lng: number; altitude: number },
    ) => void,
  ): this;
  onPointHover?(fn: (point: object | null, prevPoint: object | null) => void): this;
  onGlobeClick?(fn: (coords: { lat: number; lng: number }, event: MouseEvent) => void): this;
}

export function toFeatureRef(feat: GeoFeature): FeatureRef {
  return {
    id: feat.properties.id,
    layerId: feat.properties.layerId as LayerId,
    kind: feat.properties.kind,
    name: feat.properties.name_pl,
    name_pl: feat.properties.name_pl,
    name_en: feat.properties.name_en,
    lat: feat.properties.labelLat,
    lng: feat.properties.labelLng,
  };
}

export function attachGlobeEvents(
  globe: GlobeEventsDelegate,
  store: Store<AppState>,
  container?: HTMLElement,
): () => void {
  const handleFeatureClick = (obj: object) => {
    const feat = obj as GeoFeature;
    if (feat?.properties?.id) {
      store.set({ selection: toFeatureRef(feat) });
    }
  };

  const handleFeatureHover = (obj: object | null) => {
    if (container) {
      container.style.cursor = obj ? 'pointer' : 'default';
    }
    if (obj) {
      const feat = obj as GeoFeature;
      if (feat?.properties?.id) {
        store.set({ hovered: toFeatureRef(feat) });
        return;
      }
    }
    store.set({ hovered: null });
  };

  globe.onPolygonClick?.(obj => handleFeatureClick(obj));
  globe.onPolygonHover?.(obj => handleFeatureHover(obj));

  globe.onPathClick?.(obj => handleFeatureClick(obj));
  globe.onPathHover?.(obj => handleFeatureHover(obj));

  globe.onPointClick?.(obj => handleFeatureClick(obj));
  globe.onPointHover?.(obj => handleFeatureHover(obj));

  globe.onGlobeClick?.(coords => {
    store.set({
      globeClick: { lat: coords.lat, lng: coords.lng },
      selection: null,
    });
  });

  return () => {
    // Teardown / cleanup if needed
  };
}
