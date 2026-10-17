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
  } else if (layerId === 'marine') {
    baseAltitude = 0.003;
  } else if (layerId === 'borders') {
    baseAltitude = 0.004;
  } else if (layerId === 'deserts') {
    baseAltitude = 0.005;
  } else if (layerId === 'landforms') {
    const subkind = feat.properties.landformType;
    if (subkind === 'plateau') {
      baseAltitude = 0.009;
    } else if (subkind === 'basin') {
      baseAltitude = 0.0045;
    } else {
      baseAltitude = 0.006;
    }
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
  feat: GeoFeature,
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
  if (feat.properties.layerId === 'marine') {
    const subkind = feat.properties.marineType;
    switch (subkind) {
      case 'sea':
        return 'hsla(210, 85%, 45%, 0.20)';
      case 'gulf':
      case 'bay':
        return 'hsla(195, 75%, 45%, 0.22)';
      case 'strait':
      case 'channel':
        return 'hsla(180, 80%, 45%, 0.25)';
      default:
        return 'hsla(205, 80%, 50%, 0.18)';
    }
  }
  if (feat.properties.layerId === 'landforms') {
    const subkind = feat.properties.landformType;
    switch (subkind) {
      case 'plateau':
        return 'hsla(32, 60%, 50%, 0.32)';
      case 'plain':
        return 'hsla(120, 45%, 45%, 0.25)';
      case 'delta':
        return 'hsla(165, 60%, 45%, 0.30)';
      case 'basin':
        return 'hsla(65, 40%, 45%, 0.25)';
      case 'peninsula':
        return 'hsla(150, 50%, 48%, 0.26)';
    }
  }
  return def?.style?.capColor || 'transparent';
}

/**
 * Calculates the polygon 3D extrusion side color for depth.
 */
export function getPolygonSideColor(
  feat: GeoFeature,
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
  if (feat.properties.layerId === 'marine') {
    const subkind = feat.properties.marineType;
    switch (subkind) {
      case 'sea':
        return 'hsla(210, 85%, 30%, 0.25)';
      case 'gulf':
      case 'bay':
        return 'hsla(195, 75%, 30%, 0.25)';
      case 'strait':
      case 'channel':
        return 'hsla(180, 80%, 30%, 0.28)';
      default:
        return 'hsla(205, 70%, 35%, 0.25)';
    }
  }
  if (feat.properties.layerId === 'landforms') {
    const subkind = feat.properties.landformType;
    switch (subkind) {
      case 'plateau':
        return 'hsla(32, 60%, 35%, 0.38)';
      case 'plain':
        return 'hsla(120, 45%, 30%, 0.30)';
      case 'delta':
        return 'hsla(165, 60%, 30%, 0.35)';
      case 'basin':
        return 'hsla(65, 40%, 30%, 0.30)';
      case 'peninsula':
        return 'hsla(150, 50%, 32%, 0.32)';
    }
  }
  return def?.style?.sideColor || 'transparent';
}

/**
 * Calculates polygon border stroke color with golden selection and cyan hover highlights.
 */
export function getPolygonStrokeColor(
  feat: GeoFeature,
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
  if (feat.properties.layerId === 'marine') {
    const subkind = feat.properties.marineType;
    switch (subkind) {
      case 'sea':
        return 'hsl(210, 90%, 65%)';
      case 'gulf':
      case 'bay':
        return 'hsl(195, 90%, 65%)';
      case 'strait':
      case 'channel':
        return 'hsl(180, 95%, 65%)';
      default:
        return 'hsl(195, 90%, 65%)';
    }
  }
  if (feat.properties.layerId === 'landforms') {
    const subkind = feat.properties.landformType;
    switch (subkind) {
      case 'plateau':
        return 'hsl(32, 75%, 60%)';
      case 'plain':
        return 'hsl(120, 60%, 55%)';
      case 'delta':
        return 'hsl(165, 75%, 55%)';
      case 'basin':
        return 'hsl(65, 55%, 55%)';
      case 'peninsula':
        return 'hsl(150, 65%, 55%)';
    }
  }
  return def?.style?.strokeColor || 'transparent';
}

/**
 * Calculates river/path color with glowing effects on hover/select and brightness scaled by rank.
 */
export function getPathColor(
  feat: GeoFeature,
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

  const baseColor = def?.style?.color;
  const len = feat.properties?.rank?.length;
  const order = feat.properties?.rank?.order;

  let lightness = 65;
  if (typeof len === 'number' && len > 0) {
    const factor = Math.max(0, Math.min(1, (len - 800) / (5500 - 800)));
    lightness = Math.round(55 + factor * 22); // 55% to 77%
  } else if (typeof order === 'number' && order > 0) {
    const factor = Math.max(0, Math.min(1, (50 - order) / 49));
    lightness = Math.round(55 + factor * 22);
  }

  if (baseColor && baseColor.startsWith('hsl(')) {
    return baseColor.replace(/,\s*\d+%\)/, `, ${lightness}%)`);
  }

  return `hsl(190, 100%, ${lightness}%)`;
}

/**
 * Calculates river stroke width scaled by length rank.
 * Major world rivers (Amazon, Nile, Parana > 4000 km) receive stroke up to ~2.3px.
 * Shorter tributaries receive finer stroke (~1.1px).
 */
export function getPathStroke(feat: GeoFeature, def?: LayerDef): number {
  const baseStroke = def?.style?.strokeWidth ?? 1.5;
  const len = feat.properties?.rank?.length;
  const order = feat.properties?.rank?.order;

  if (typeof len === 'number' && len > 0) {
    const factor = Math.max(0, Math.min(1, (len - 800) / (5500 - 800)));
    return Math.round((1.1 + factor * 1.2) * 10) / 10;
  }

  if (typeof order === 'number' && order > 0) {
    const factor = Math.max(0, Math.min(1, (50 - order) / 49));
    return Math.round((1.1 + factor * 1.2) * 10) / 10;
  }

  return baseStroke;
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
