import type { LayerDef, LayerId, LayerGroup } from './types';

export const LAYER_DEFINITIONS: readonly LayerDef[] = [
  // Physical geography
  {
    id: 'lakes',
    group: 'physical',
    labelKey: 'layers.lakes',
    icon: 'droplets',
    kind: 'polygon',
    source: '/data/lakes.json',
    defaultEnabled: false,
    topN: {
      min: 1,
      max: 50,
      default: 20,
      rankBy: 'area',
    },
    style: {
      capColor: 'hsla(190, 100%, 60%, 0.75)',
      sideColor: 'hsla(190, 100%, 40%, 0.4)',
      strokeColor: 'hsl(190, 100%, 75%)',
      altitude: 0.007,
    },
  },
  {
    id: 'rivers',
    group: 'physical',
    labelKey: 'layers.rivers',
    icon: 'waves',
    kind: 'path',
    source: '/data/rivers.json',
    defaultEnabled: false,
    topN: {
      min: 1,
      max: 50,
      default: 20,
      rankBy: 'length',
    },
    style: {
      color: 'hsl(190, 100%, 65%)',
      strokeWidth: 1.5,
    },
  },
  {
    id: 'mountains',
    group: 'physical',
    labelKey: 'layers.mountains',
    icon: 'mountain',
    kind: 'polygon',
    source: '/data/regions.json',
    defaultEnabled: false,
    topN: {
      min: 1,
      max: 30,
      default: 15,
      rankBy: 'elevation',
    },
    // Delicate outline of the range: faint fill, no sides, muted ochre stroke
    style: {
      capColor: 'hsla(28, 70%, 52%, 0.10)',
      sideColor: 'transparent',
      strokeColor: 'hsla(28, 75%, 62%, 0.6)',
      altitude: 0.013,
    },
  },
  {
    id: 'deserts',
    group: 'physical',
    labelKey: 'layers.deserts',
    icon: 'sun',
    kind: 'polygon',
    source: '/data/regions.json',
    defaultEnabled: false,
    topN: {
      min: 1,
      max: 20,
      default: 10,
      rankBy: 'area',
    },
    style: {
      capColor: 'hsla(38, 70%, 65%, 0.45)',
      sideColor: 'hsla(35, 60%, 45%, 0.3)',
      strokeColor: 'hsl(38, 80%, 75%)',
      altitude: 0.005,
    },
  },
  {
    id: 'peaks',
    group: 'physical',
    labelKey: 'layers.peaks',
    icon: 'triangle',
    kind: 'point',
    source: '/data/places.json',
    defaultEnabled: false,
    style: {
      color: 'hsl(0, 100%, 67%)',
      radius: 0.3,
    },
  },
  {
    id: 'landforms',
    group: 'physical',
    labelKey: 'layers.landforms',
    icon: 'compass',
    kind: 'polygon',
    source: '/data/landforms.json',
    defaultEnabled: false,
    topN: {
      min: 5,
      max: 100,
      default: 30,
      presets: [15, 30, 50, 100],
      rankBy: 'area',
    },
    style: {
      capColor: 'hsla(140, 50%, 45%, 0.28)',
      sideColor: 'hsla(140, 55%, 30%, 0.35)',
      strokeColor: 'hsl(140, 65%, 55%)',
      altitude: 0.006,
    },
  },
  {
    id: 'marine',
    group: 'physical',
    labelKey: 'layers.marine',
    icon: 'anchor',
    kind: 'polygon',
    source: '/data/marine.json',
    defaultEnabled: false,
    topN: {
      min: 5,
      max: 100,
      default: 30,
      presets: [10, 30, 60, 100],
      rankBy: 'area',
    },
    style: {
      capColor: 'hsla(205, 80%, 50%, 0.18)',
      sideColor: 'hsla(205, 70%, 35%, 0.25)',
      strokeColor: 'hsl(195, 90%, 65%)',
      altitude: 0.003,
    },
  },

  // Political geography
  {
    id: 'borders',
    group: 'political',
    labelKey: 'layers.borders',
    icon: 'globe',
    kind: 'polygon',
    source: '/data/countries.json',
    defaultEnabled: true,
    style: {
      capColor: 'transparent',
      sideColor: 'transparent',
      strokeColor: 'hsla(215, 30%, 55%, 0.45)',
      altitude: 0.004,
    },
  },
  {
    id: 'countriesTopN',
    group: 'political',
    labelKey: 'layers.countriesTopN',
    icon: 'flag',
    kind: 'polygon',
    source: '/data/countries.json',
    defaultEnabled: false,
    topN: {
      min: 1,
      max: 100,
      default: 20,
      presets: [10, 50, 100],
      rankBy: 'area',
    },
    style: {
      capColor: 'hsla(212, 95%, 58%, 0.25)',
      sideColor: 'hsla(212, 85%, 40%, 0.3)',
      strokeColor: 'hsl(212, 95%, 65%)',
      altitude: 0.012,
    },
  },
  {
    id: 'capitals',
    group: 'political',
    labelKey: 'layers.capitals',
    icon: 'map-pin',
    kind: 'point',
    source: '/data/places.json',
    defaultEnabled: true,
    style: {
      color: 'hsl(350, 85%, 62%)',
      radius: 0.25,
    },
  },
  {
    id: 'megacities',
    group: 'political',
    labelKey: 'layers.megacities',
    icon: 'building',
    kind: 'point',
    source: '/data/places.json',
    defaultEnabled: false,
    style: {
      color: 'hsl(45, 100%, 62%)',
      radius: 0.4,
    },
  },
] as const;

export function getLayer(id: LayerId): LayerDef | undefined {
  return LAYER_DEFINITIONS.find(def => def.id === id);
}

export function getLayersByGroup(group: LayerGroup): LayerDef[] {
  return LAYER_DEFINITIONS.filter(def => def.group === group);
}

export function defaultLayersState(): Record<LayerId, { enabled: boolean; topN?: number }> {
  const result: Partial<Record<LayerId, { enabled: boolean; topN?: number }>> = {};
  for (const layer of LAYER_DEFINITIONS) {
    result[layer.id] = {
      enabled: layer.defaultEnabled,
      ...(layer.topN ? { topN: layer.topN.default } : {}),
    };
  }
  return result as Record<LayerId, { enabled: boolean; topN?: number }>;
}
