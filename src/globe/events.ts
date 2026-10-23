import type { Store, AppState, FeatureRef } from '@/state/types';
import type { LayerId } from '@/layers';
import type { GeoFeature } from './data-loader';
import type { HoverArbiter } from './hover-arbiter';

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

export function toFeatureRef(
  feat: GeoFeature,
  fallbackCoords?: { lat: number; lng: number },
): FeatureRef {
  let lat = feat.properties.labelLat;
  let lng = feat.properties.labelLng;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    if (feat.geometry.type === 'Point') {
      const coords = feat.geometry.coordinates as [number, number];
      lng = coords[0];
      lat = coords[1];
    } else if (fallbackCoords) {
      lat = fallbackCoords.lat;
      lng = fallbackCoords.lng;
    }
  }

  return {
    id: feat.properties.id,
    layerId: feat.properties.layerId as LayerId,
    kind: feat.properties.kind,
    name: feat.properties.name_pl,
    name_pl: feat.properties.name_pl,
    name_en: feat.properties.name_en,
    lat,
    lng,
  };
}

/**
 * globe.gl hands path callbacks the PathItem wrapper ({ id, feature, points }), while polygon
 * and point callbacks receive the GeoFeature itself. Returns the GeoFeature in both cases.
 */
export function resolveFeature(obj: object): GeoFeature | null {
  const wrapped = (obj as { feature?: GeoFeature }).feature;
  const feat = wrapped?.properties ? wrapped : (obj as GeoFeature);
  return feat?.properties?.id ? feat : null;
}

export function attachGlobeEvents(
  globe: GlobeEventsDelegate,
  store: Store<AppState>,
  container?: HTMLElement,
  arbiter?: HoverArbiter,
): () => void {
  const handleFeatureClick = (obj: object, coords?: { lat: number; lng: number }) => {
    // The capitals layer handles clicks on its own markers
    if (arbiter?.isCapitalClaimed()) return;
    const feat = resolveFeature(obj);
    if (feat) {
      store.set({ selection: toFeatureRef(feat, coords) });
    }
  };

  const handleFeatureHover = (obj: object | null) => {
    const feat = obj ? resolveFeature(obj) : null;
    if (arbiter) {
      // The arbiter owns `hovered` and the cursor (a capital marker may take precedence)
      arbiter.setGlobeHover(feat ? toFeatureRef(feat) : null);
      return;
    }
    if (container) {
      container.style.cursor = obj ? 'pointer' : 'default';
    }
    store.set({ hovered: feat ? toFeatureRef(feat) : null });
  };

  globe.onPolygonClick?.((obj, _event, coords) => handleFeatureClick(obj, coords));
  globe.onPolygonHover?.(obj => handleFeatureHover(obj));

  globe.onPathClick?.((obj, _event, coords) => handleFeatureClick(obj, coords));
  globe.onPathHover?.(obj => handleFeatureHover(obj));

  globe.onPointClick?.((obj, _event, coords) => handleFeatureClick(obj, coords));
  globe.onPointHover?.(obj => handleFeatureHover(obj));

  globe.onGlobeClick?.(coords => {
    if (arbiter?.isCapitalClaimed()) return;
    store.set({
      globeClick: { lat: coords.lat, lng: coords.lng },
      selection: null,
    });
  });

  return () => {
    // Teardown / cleanup if needed
  };
}
