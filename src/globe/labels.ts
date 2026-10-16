import type { GeoFeature } from './data-loader';

export const LABEL_PRIORITY: Readonly<Record<string, number>> = {
  country: 1,
  capital: 2,
  megacity: 3,
  mountain: 4,
  lake: 5,
  river: 6,
  desert: 7,
  peak: 8,
};

export interface LabelSelectionOptions {
  hiddenLabels: boolean;
  selectedId?: string;
  hoveredId?: string;
  maxLabels?: number;
}

/**
 * Formats label text according to geography category (Polish name, elevation or population suffix).
 */
export function formatLabelText(feat: GeoFeature): string {
  const name = feat.properties.name_pl || feat.properties.name_en || feat.properties.name || '';
  const kind = feat.properties.kind;

  const rawElevation = feat.properties.rank?.elevation ?? feat.properties.elevation;
  if ((kind === 'mountain' || kind === 'peak') && typeof rawElevation === 'number') {
    return `${name} (${rawElevation} m)`;
  }

  const rawPopulation = feat.properties.rank?.population ?? feat.properties.population;
  if (kind === 'megacity' && typeof rawPopulation === 'number') {
    const popMillions = (rawPopulation / 1_000_000).toFixed(1);
    return `${name} (${popMillions}M)`;
  }

  return name;
}

export interface LabelCoordinates {
  lat: number;
  lng: number;
}

/**
 * Extracts label coordinates for proximity collision checks.
 */
export function getFeatureCoordinates(feat: GeoFeature): LabelCoordinates {
  if (
    typeof feat.properties.labelLat === 'number' &&
    typeof feat.properties.labelLng === 'number'
  ) {
    return { lat: feat.properties.labelLat, lng: feat.properties.labelLng };
  }
  if (feat.geometry.type === 'Point') {
    const coords = feat.geometry.coordinates as number[];
    return { lat: Number(coords[1] ?? 0), lng: Number(coords[0] ?? 0) };
  }
  return { lat: 0, lng: 0 };
}

/**
 * Calculates approximate angular distance in degrees on the sphere surface.
 */
export function calculateAngularDistance(p1: LabelCoordinates, p2: LabelCoordinates): number {
  const dLat = p1.lat - p2.lat;
  const avgLatRad = ((p1.lat + p2.lat) / 2) * (Math.PI / 180);
  const dLng = (p1.lng - p2.lng) * Math.cos(avgLatRad);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Gets typography scale for globe label (in degrees of sphere latitude).
 */
export function getLabelSize(feat: GeoFeature): number {
  const kind = feat.properties.kind;
  switch (kind) {
    case 'country':
      return 0.45;
    case 'capital':
    case 'megacity':
      return 0.38;
    case 'mountain':
      return 0.35;
    case 'peak':
      return 0.3;
    default:
      return 0.32;
  }
}

/**
 * Gets marker dot radius for globe label (in degrees).
 */
export function getLabelDotRadius(feat: GeoFeature): number {
  const kind = feat.properties.kind;
  switch (kind) {
    case 'country':
    case 'mountain':
    case 'desert':
      return 0.0;
    case 'capital':
      return 0.12;
    case 'megacity':
      return 0.15;
    case 'peak':
      return 0.1;
    default:
      return 0.08;
  }
}

/**
 * Gets label altitude above globe surface to align with extruded 3D features.
 */
export function getLabelAltitude(feat: GeoFeature): number {
  const kind = feat.properties.kind;
  switch (kind) {
    case 'peak':
      return 0.03;
    case 'mountain':
      return 0.026;
    case 'country':
      return 0.016;
    case 'capital':
    case 'megacity':
      return 0.014;
    default:
      return 0.012;
  }
}

/**
 * Selects and prioritizes labels with proximity collision avoidance to avoid globe clutter.
 */
export function selectVisibleLabels(
  candidates: readonly GeoFeature[],
  options: LabelSelectionOptions,
): GeoFeature[] {
  const { hiddenLabels, selectedId, hoveredId, maxLabels = 25 } = options;

  if (hiddenLabels) {
    // In quiz/learning mode, reveal label only on hover or selection
    return candidates.filter(
      f =>
        (selectedId && f.properties.id === selectedId) ||
        (hoveredId && f.properties.id === hoveredId),
    );
  }

  // Deduplicate by feature id
  const uniqueMap = new Map<string, GeoFeature>();
  for (const feat of candidates) {
    if (!uniqueMap.has(feat.properties.id)) {
      uniqueMap.set(feat.properties.id, feat);
    }
  }

  const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
    const prioA = LABEL_PRIORITY[a.properties.kind] ?? 99;
    const prioB = LABEL_PRIORITY[b.properties.kind] ?? 99;
    if (prioA !== prioB) return prioA - prioB;

    const rankA = a.properties.rank?.order ?? 9999;
    const rankB = b.properties.rank?.order ?? 9999;
    return rankA - rankB;
  });

  const accepted: GeoFeature[] = [];
  const acceptedCoords: LabelCoordinates[] = [];
  const minDistanceDeg = 6.5; // Avoid overlapping text within 6.5 degrees

  for (const feat of sorted) {
    if (accepted.length >= maxLabels) break;

    const isMustHave = feat.properties.id === selectedId || feat.properties.id === hoveredId;
    const coords = getFeatureCoordinates(feat);

    if (isMustHave) {
      accepted.push(feat);
      acceptedCoords.push(coords);
      continue;
    }

    // Check collision against already accepted higher-priority labels
    const hasCollision = acceptedCoords.some(
      existing => calculateAngularDistance(existing, coords) < minDistanceDeg,
    );

    if (!hasCollision) {
      accepted.push(feat);
      acceptedCoords.push(coords);
    }
  }

  // Ensure active selection or hover is never missing
  const mustHaveIds = [selectedId, hoveredId].filter(Boolean) as string[];
  for (const id of mustHaveIds) {
    if (!accepted.some(f => f.properties.id === id)) {
      const match = uniqueMap.get(id);
      if (match) {
        accepted.push(match);
      }
    }
  }

  return accepted;
}
