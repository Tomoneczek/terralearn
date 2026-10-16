import type { GeoFeature } from '@/globe/data-loader';
import type { LayerDef, LayerId } from './types';

/**
 * Calculates 3D polygon altitude for Globe.gl to prevent Z-fighting and provide
 * physical elevation for mountains and highlights for selected/hovered items.
 */
export function getPolygonAltitude(
  feat: GeoFeature,
  isSelected: boolean,
  isHovered: boolean,
  def?: LayerDef,
): number {
  const kind = feat.properties.kind;
  const layerId = feat.properties.layerId as LayerId | undefined;

  let baseAltitude: number;

  if (kind === 'mountain') {
    // Dynamic elevation extrusion: 8848m (Everest) maps to ~0.048, 2000m to ~0.023
    const rawElevation = feat.properties.rank?.elevation ?? feat.properties.elevation;
    const elevation = typeof rawElevation === 'number' ? rawElevation : 3000;
    const clampedElevation = Math.max(500, Math.min(8848, elevation));
    baseAltitude = 0.015 + (clampedElevation / 8848) * 0.033;
  } else if (layerId === 'borders') {
    baseAltitude = 0.004;
  } else if (layerId === 'deserts') {
    baseAltitude = 0.005;
  } else if (layerId === 'lakes') {
    baseAltitude = 0.007;
  } else if (layerId === 'countriesTopN') {
    baseAltitude = 0.012;
  } else {
    baseAltitude = def?.style?.altitude ?? 0.005;
  }

  if (isSelected) {
    return baseAltitude + 0.012;
  }
  if (isHovered) {
    return baseAltitude + 0.004;
  }

  return baseAltitude;
}

/**
 * Calculates the polygon cap (fill) color based on selection, hover, and layer defaults.
 */
export function getPolygonCapColor(
  _feat: GeoFeature,
  isSelected: boolean,
  isHovered: boolean,
  def?: LayerDef,
): string {
  if (isSelected) {
    return 'hsla(180, 100%, 70%, 0.65)';
  }
  if (isHovered) {
    return 'hsla(180, 100%, 80%, 0.45)';
  }
  return def?.style?.capColor || 'transparent';
}

/**
 * Calculates the polygon 3D extrusion side color for depth.
 */
export function getPolygonSideColor(
  _feat: GeoFeature,
  isSelected: boolean,
  isHovered: boolean,
  def?: LayerDef,
): string {
  if (isSelected) {
    return 'hsla(180, 100%, 50%, 0.7)';
  }
  if (isHovered) {
    return 'hsla(180, 100%, 60%, 0.5)';
  }
  return def?.style?.sideColor || 'transparent';
}

/**
 * Calculates polygon border stroke color with golden selection and cyan hover highlights.
 */
export function getPolygonStrokeColor(
  _feat: GeoFeature,
  isSelected: boolean,
  isHovered: boolean,
  def?: LayerDef,
): string {
  if (isSelected) {
    return 'hsl(50, 100%, 65%)'; // Gold accent
  }
  if (isHovered) {
    return 'hsl(180, 100%, 80%)'; // Cyan glow
  }
  return def?.style?.strokeColor || 'transparent';
}

/**
 * Calculates river/path color with glowing effects on hover/select.
 */
export function getPathColor(
  _feat: GeoFeature,
  isSelected: boolean,
  isHovered: boolean,
  def?: LayerDef,
): string {
  if (isSelected) {
    return 'hsl(50, 100%, 70%)';
  }
  if (isHovered) {
    return 'hsl(180, 100%, 85%)';
  }
  return def?.style?.color || 'hsl(190, 100%, 65%)';
}

/**
 * Calculates river stroke width.
 */
export function getPathStroke(_feat: GeoFeature, def?: LayerDef): number {
  return def?.style?.strokeWidth ?? 1.5;
}

/**
 * Path altitude slightly above borders and lakes to prevent clipping.
 */
export function getPathAltitude(): number {
  return 0.008;
}

/**
 * Calculates point marker color for capitals, megacities, and peaks.
 */
export function getPointColor(
  _feat: GeoFeature,
  isSelected: boolean,
  isHovered: boolean,
  def?: LayerDef,
): string {
  if (isSelected) {
    return 'hsl(50, 100%, 70%)';
  }
  if (isHovered) {
    return 'hsl(180, 100%, 80%)';
  }
  return def?.style?.color || 'hsl(350, 85%, 62%)';
}

/**
 * Calculates point marker radius, using logarithmic scaling for megacity population.
 */
export function getPointRadius(feat: GeoFeature, def?: LayerDef): number {
  const kind = feat.properties.kind;
  if (kind === 'megacity') {
    const rawPop = feat.properties.rank?.population ?? feat.properties.population;
    const pop = typeof rawPop === 'number' ? rawPop : 10_000_000;
    // Scaled smoothly between 0.30 and 0.70 based on population above 1M
    const popFactor = Math.log10(Math.max(1, pop) / 1_000_000);
    return Math.min(0.7, Math.max(0.3, 0.3 + popFactor * 0.2));
  }
  if (kind === 'capital') {
    return 0.28;
  }
  if (kind === 'peak') {
    return 0.24;
  }
  return def?.style?.radius ?? 0.3;
}

/**
 * Calculates point altitude above the globe surface.
 */
export function getPointAltitude(feat: GeoFeature): number {
  if (feat.properties.kind === 'peak') {
    return 0.026;
  }
  return 0.01;
}
