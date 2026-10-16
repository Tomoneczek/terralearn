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

/**
 * Gets typography scale for globe label.
 */
export function getLabelSize(feat: GeoFeature): number {
  const kind = feat.properties.kind;
  switch (kind) {
    case 'country':
      return 1.35;
    case 'capital':
    case 'megacity':
      return 1.15;
    case 'mountain':
      return 1.05;
    case 'peak':
      return 0.95;
    default:
      return 1.0;
  }
}

/**
 * Gets marker dot radius for globe label (0 for regions/countries, >0 for cities/peaks).
 */
export function getLabelDotRadius(feat: GeoFeature): number {
  const kind = feat.properties.kind;
  switch (kind) {
    case 'country':
    case 'mountain':
    case 'desert':
      return 0.0;
    case 'capital':
      return 0.25;
    case 'megacity':
      return 0.3;
    case 'peak':
      return 0.22;
    default:
      return 0.15;
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
 * Selects and prioritizes labels to avoid globe clutter. Supports study mode (hiddenLabels).
 */
export function selectVisibleLabels(
  candidates: readonly GeoFeature[],
  options: LabelSelectionOptions,
): GeoFeature[] {
  const { hiddenLabels, selectedId, hoveredId, maxLabels = 50 } = options;

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

  const sliced = sorted.slice(0, maxLabels);

  // Ensure active selection or hover is never truncated out of the top slice
  const mustHaveIds = [selectedId, hoveredId].filter(Boolean) as string[];
  for (const id of mustHaveIds) {
    if (!sliced.some(f => f.properties.id === id)) {
      const match = uniqueMap.get(id);
      if (match) {
        sliced.push(match);
      }
    }
  }

  return sliced;
}
