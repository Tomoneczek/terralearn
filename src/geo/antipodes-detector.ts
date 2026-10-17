import { geoContains, type GeoGeometryObjects } from 'd3-geo';
import type { GeoFeatureCollection } from '@/globe/data-loader';

export type OceanId = 'arctic' | 'southern' | 'atlantic' | 'indian' | 'pacific';

export interface AntipodeLocationResult {
  countryName_pl?: string;
  countryName_en?: string;
  oceanId?: OceanId;
  isLand: boolean;
}

/**
 * Identifies the major ocean based on latitude and longitude coordinates.
 */
export function identifyOcean(lat: number, lng: number): OceanId {
  if (lat >= 66.5) {
    return 'arctic';
  }
  if (lat <= -60) {
    return 'southern';
  }

  // Normalize lng to -180..180
  let normalizedLng = lng;
  while (normalizedLng > 180) normalizedLng -= 360;
  while (normalizedLng <= -180) normalizedLng += 360;

  if (normalizedLng >= -70 && normalizedLng <= 20) {
    return 'atlantic';
  }
  if (normalizedLng > 20 && normalizedLng <= 147) {
    return 'indian';
  }
  return 'pacific';
}

/**
 * Detects whether the given coordinates land on a known country or in the ocean.
 */
export function detectLocationAtCoords(
  lat: number,
  lng: number,
  countries?: GeoFeatureCollection,
): AntipodeLocationResult {
  if (countries?.features) {
    const point: [number, number] = [lng, lat];
    for (const feat of countries.features) {
      if (feat.geometry && geoContains(feat as unknown as GeoGeometryObjects, point)) {
        return {
          countryName_pl: feat.properties.name_pl || feat.properties.countryName,
          countryName_en: feat.properties.name_en || feat.properties.countryName,
          isLand: true,
        };
      }
    }
  }

  return {
    oceanId: identifyOcean(lat, lng),
    isLand: false,
  };
}
