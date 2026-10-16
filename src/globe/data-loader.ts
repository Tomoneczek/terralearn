import { resolveAssetUrl } from '@/utils/assets';

export interface GeoFeatureProperties {
  id: string;
  kind: string;
  layerId: string;
  name_pl: string;
  name_en: string;
  aliases?: string[];
  rank?: {
    area?: number;
    population?: number;
    length?: number;
    elevation?: number;
    order?: number;
  };
  labelLat?: number;
  labelLng?: number;
  countryCode?: string;
  countryName?: string;
}

export type GeoJsonCoordinates = number[] | number[][] | number[][][] | number[][][][];

export interface GeoFeature {
  type: 'Feature';
  id?: string | number;
  properties: GeoFeatureProperties;
  geometry: {
    type: string;
    coordinates: GeoJsonCoordinates;
  };
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

const memoryCache = new Map<string, GeoFeatureCollection>();
const inFlightRequests = new Map<string, Promise<GeoFeatureCollection>>();

export async function loadGeoData(sourceUrl: string): Promise<GeoFeatureCollection> {
  const cached = memoryCache.get(sourceUrl);
  if (cached) {
    return cached;
  }

  const inFlight = inFlightRequests.get(sourceUrl);
  if (inFlight) {
    return inFlight;
  }

  const fetchPromise = (async () => {
    try {
      const targetUrl = resolveAssetUrl(sourceUrl);
      const response = await fetch(targetUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to load ${sourceUrl}: HTTP ${response.status} ${response.statusText}`,
        );
      }
      const data = (await response.json()) as GeoFeatureCollection;
      if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error(`Invalid GeoJSON in ${sourceUrl}: missing FeatureCollection`);
      }
      memoryCache.set(sourceUrl, data);
      return data;
    } finally {
      inFlightRequests.delete(sourceUrl);
    }
  })();

  inFlightRequests.set(sourceUrl, fetchPromise);
  return fetchPromise;
}

export function getCachedGeoData(sourceUrl: string): GeoFeatureCollection | undefined {
  return memoryCache.get(sourceUrl);
}

export function clearGeoDataCache(): void {
  memoryCache.clear();
  inFlightRequests.clear();
}
