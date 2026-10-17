import type { Store, AppState } from '@/state/types';
import {
  LAYER_DEFINITIONS,
  type LayerDef,
  type LayerId,
  getPolygonAltitude,
  getPolygonCapColor,
  getPolygonSideColor,
  getPolygonStrokeColor,
  getPathColor,
  getPathStroke,
  getPathAltitude,
  getPointColor,
  getPointRadius,
  getPointAltitude,
} from '@/layers';
import { loadGeoData, type GeoFeature } from './data-loader';
import {
  formatLabelText,
  getLabelSize,
  getLabelDotRadius,
  getLabelAltitude,
  selectVisibleLabels,
} from './labels';

export interface PathItem {
  id: string;
  feature: GeoFeature;
  points: [number, number][];
}

export interface RingItem {
  lat: number;
  lng: number;
  maxRadius?: number;
  propagationSpeed?: number;
  repeatPeriod?: number;
  altitude?: number;
  color?: string | ((t: number) => string);
}

export interface GlobeCompositorTarget {
  polygonsData(data: GeoFeature[]): this;
  pathsData(data: PathItem[]): this;
  pointsData(data: GeoFeature[]): this;
  labelsData(data: GeoFeature[]): this;
  ringsData?(data: RingItem[]): this;

  polygonCapColor(fn: (d: GeoFeature) => string): this;
  polygonSideColor(fn: (d: GeoFeature) => string): this;
  polygonStrokeColor(fn: (d: GeoFeature) => string): this;
  polygonAltitude(fn: (d: GeoFeature) => number): this;
  polygonsTransitionDuration?(ms: number): this;

  pathPoints(fn: (d: PathItem) => [number, number][]): this;
  pathPointLat(fn: (pt: [number, number]) => number): this;
  pathPointLng(fn: (pt: [number, number]) => number): this;
  pathPointAlt(fn: (pt: [number, number]) => number): this;
  pathColor(fn: (d: PathItem) => string): this;
  pathStroke(fn: (d: PathItem) => number): this;
  pathDashLength?(len: number): this;
  pathDashGap?(gap: number): this;
  pathDashAnimateTime?(ms: number): this;
  pathTransitionDuration?(ms: number): this;
  pathsTransitionDuration?(ms: number): this;

  pointLat(fn: (d: GeoFeature) => number): this;
  pointLng(fn: (d: GeoFeature) => number): this;
  pointColor(fn: (d: GeoFeature) => string): this;
  pointRadius(fn: (d: GeoFeature) => number): this;
  pointAltitude(fn: (d: GeoFeature) => number): this;
  pointsTransitionDuration?(ms: number): this;

  labelLat(fn: (d: GeoFeature) => number): this;
  labelLng(fn: (d: GeoFeature) => number): this;
  labelText(fn: (d: GeoFeature) => string): this;
  labelSize(fn: (d: GeoFeature) => number): this;
  labelDotRadius(fn: (d: GeoFeature) => number): this;
  labelAltitude(fn: (d: GeoFeature) => number): this;
  labelColor(fn: (d: GeoFeature) => string): this;
  labelsTransitionDuration?(ms: number): this;

  ringLat?(fn: (d: RingItem) => number): this;
  ringLng?(fn: (d: RingItem) => number): this;
  ringAltitude?(fn: (d: RingItem) => number): this;
  ringColor?(fn: (d: RingItem) => string | ((t: number) => string)): this;
  ringMaxRadius?(fn: (d: RingItem) => number): this;
  ringPropagationSpeed?(fn: (d: RingItem) => number): this;
  ringRepeatPeriod?(fn: (d: RingItem) => number): this;
}

export class LayerCompositor {
  private readonly globe: GlobeCompositorTarget;
  private readonly store: Store<AppState>;
  private readonly layerDefsMap: Map<LayerId, LayerDef>;
  private readonly unsubs: (() => void)[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private lastLabelCandidates: GeoFeature[] = [];

  // Path item instance cache by key, ensuring stable identity and preserving __threeObjPath
  private readonly pathItemCache = new Map<string, PathItem>();
  private lastPolygons: GeoFeature[] = [];
  private lastPaths: PathItem[] = [];
  private lastPoints: GeoFeature[] = [];
  private lastLabels: GeoFeature[] = [];

  // Stable accessor references so they can be re-applied on hover without recreating data
  private readonly polygonCapColorAccessor = (feat: GeoFeature): string => {
    const state = this.store.get();
    const isSelected = state.selection?.id === feat.properties.id;
    const isHovered = state.hovered?.id === feat.properties.id;
    const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
    return getPolygonCapColor(feat, isSelected, isHovered, def);
  };

  private readonly polygonSideColorAccessor = (feat: GeoFeature): string => {
    const state = this.store.get();
    const isSelected = state.selection?.id === feat.properties.id;
    const isHovered = state.hovered?.id === feat.properties.id;
    const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
    return getPolygonSideColor(feat, isSelected, isHovered, def);
  };

  private readonly polygonStrokeColorAccessor = (feat: GeoFeature): string => {
    const state = this.store.get();
    const isSelected = state.selection?.id === feat.properties.id;
    const isHovered = state.hovered?.id === feat.properties.id;
    const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
    return getPolygonStrokeColor(feat, isSelected, isHovered, def);
  };

  private readonly polygonAltitudeAccessor = (feat: GeoFeature): number => {
    const state = this.store.get();
    const isSelected = state.selection?.id === feat.properties.id;
    const isHovered = state.hovered?.id === feat.properties.id;
    const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
    return getPolygonAltitude(feat, isSelected, isHovered, def);
  };

  private readonly pathColorAccessor = (item: PathItem): string => {
    const state = this.store.get();
    const isSelected = state.selection?.id === item.feature.properties.id;
    const isHovered = state.hovered?.id === item.feature.properties.id;
    const def = this.layerDefsMap.get(item.feature.properties.layerId as LayerId);
    return getPathColor(item.feature, isSelected, isHovered, def);
  };

  private readonly pointColorAccessor = (feat: GeoFeature): string => {
    const state = this.store.get();
    const isSelected = state.selection?.id === feat.properties.id;
    const isHovered = state.hovered?.id === feat.properties.id;
    const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
    return getPointColor(feat, isSelected, isHovered, def);
  };

  private readonly labelColorAccessor = (feat: GeoFeature): string => {
    const state = this.store.get();
    if (state.selection?.id === feat.properties.id) {
      return 'rgba(255, 220, 100, 1)';
    }
    if (state.hovered?.id === feat.properties.id) {
      return 'rgba(180, 240, 255, 1)';
    }
    return 'rgba(255, 255, 255, 0.95)';
  };

  constructor(globe: GlobeCompositorTarget, store: Store<AppState>) {
    this.globe = globe;
    this.store = store;
    this.layerDefsMap = new Map(LAYER_DEFINITIONS.map(def => [def.id, def]));

    this.configureAccessors();
    this.bindStore();
  }

  private configureAccessors(): void {
    // Smooth entry transitions for newly added items (cached items do not re-animate)
    this.globe.polygonsTransitionDuration?.(400);
    this.globe.labelsTransitionDuration?.(0);
    this.globe.pathsTransitionDuration?.(0);
    this.globe.pathTransitionDuration?.(400);
    this.globe.pointsTransitionDuration?.(400);

    // Rings (Selection Pulsing Halo)
    this.globe.ringLat?.(d => d.lat);
    this.globe.ringLng?.(d => d.lng);
    this.globe.ringAltitude?.(d => d.altitude ?? 0.015);
    this.globe.ringColor?.(d => d.color ?? 'rgba(255, 215, 60, 0.8)');
    this.globe.ringMaxRadius?.(d => d.maxRadius ?? 3.5);
    this.globe.ringPropagationSpeed?.(d => d.propagationSpeed ?? 2.5);
    this.globe.ringRepeatPeriod?.(d => d.repeatPeriod ?? 1000);

    // Polygons
    this.globe.polygonCapColor(this.polygonCapColorAccessor);
    this.globe.polygonSideColor(this.polygonSideColorAccessor);
    this.globe.polygonStrokeColor(this.polygonStrokeColorAccessor);
    this.globe.polygonAltitude(this.polygonAltitudeAccessor);

    // Paths
    this.globe.pathPoints(item => item.points);
    this.globe.pathPointLat(pt => pt[1]);
    this.globe.pathPointLng(pt => pt[0]);
    this.globe.pathPointAlt(() => getPathAltitude());
    this.globe.pathColor(this.pathColorAccessor);
    this.globe.pathStroke(item => {
      const def = this.layerDefsMap.get(item.feature.properties.layerId as LayerId);
      return getPathStroke(item.feature, def);
    });
    this.globe.pathDashLength?.(0.08);
    this.globe.pathDashGap?.(0.04);
    this.globe.pathDashAnimateTime?.(7000);

    // Points
    this.globe.pointLat(feat => {
      const coords = feat.geometry.coordinates as number[];
      return Number(coords[1] ?? 0);
    });
    this.globe.pointLng(feat => {
      const coords = feat.geometry.coordinates as number[];
      return Number(coords[0] ?? 0);
    });
    this.globe.pointColor(this.pointColorAccessor);
    this.globe.pointRadius(feat => {
      const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
      return getPointRadius(feat, def);
    });
    this.globe.pointAltitude(feat => getPointAltitude(feat));

    // Labels
    this.globe.labelLat(feat => {
      if (typeof feat.properties.labelLat === 'number') return feat.properties.labelLat;
      const coords = feat.geometry.coordinates as number[];
      return Number(coords[1] ?? 0);
    });
    this.globe.labelLng(feat => {
      if (typeof feat.properties.labelLng === 'number') return feat.properties.labelLng;
      const coords = feat.geometry.coordinates as number[];
      return Number(coords[0] ?? 0);
    });
    this.globe.labelText(feat => formatLabelText(feat));
    this.globe.labelSize(feat => getLabelSize(feat));
    this.globe.labelDotRadius(feat => getLabelDotRadius(feat));
    this.globe.labelAltitude(feat => getLabelAltitude(feat));
    this.globe.labelColor(this.labelColorAccessor);
  }

  private bindStore(): void {
    // 1. Data re-composition ONLY when layer activation or topN changes
    const unsubLayers = this.store.subscribe(
      s => ({
        layers: s.layers,
        hiddenLabels: s.hiddenLabels,
      }),
      () => {
        this.scheduleCompose();
      },
      (a, b) => {
        if (a.hiddenLabels !== b.hiddenLabels) return false;
        const keysA = Object.keys(a.layers) as LayerId[];
        const keysB = Object.keys(b.layers) as LayerId[];
        if (keysA.length !== keysB.length) return false;
        for (const k of keysA) {
          if (a.layers[k]?.enabled !== b.layers[k]?.enabled) return false;
          if (a.layers[k]?.topN !== b.layers[k]?.topN) return false;
        }
        return true;
      },
    );
    this.unsubs.push(unsubLayers);

    // 2. Dynamic style refresh (hover/select) and selection halo without re-loading data
    const unsubInteractions = this.store.subscribe(
      s => ({
        sel: s.selection,
        hov: s.hovered?.id,
      }),
      () => {
        this.refreshDynamicStyles();
        this.updateSelectionHalo();
      },
      (a, b) =>
        a.sel?.id === b.sel?.id &&
        a.sel?.lat === b.sel?.lat &&
        a.sel?.lng === b.sel?.lng &&
        a.hov === b.hov,
    );
    this.unsubs.push(unsubInteractions);
  }

  public updateSelectionHalo(): void {
    if (this.isDestroyed || !this.globe.ringsData) return;
    const sel = this.store.get().selection;
    if (!sel || typeof sel.lat !== 'number' || typeof sel.lng !== 'number') {
      this.globe.ringsData([]);
      return;
    }

    const ring: RingItem = {
      lat: sel.lat,
      lng: sel.lng,
      maxRadius: 3.5,
      propagationSpeed: 2.5,
      repeatPeriod: 1000,
      altitude: 0.015,
      color: (t: number) => `rgba(255, 215, 60, ${Math.max(0, 1 - t)})`,
    };
    this.globe.ringsData([ring]);
  }

  public refreshDynamicStyles(): void {
    if (this.isDestroyed) return;

    // Fast material & altitude refresh without recreating meshes
    this.globe.polygonCapColor(this.polygonCapColorAccessor);
    this.globe.polygonSideColor(this.polygonSideColorAccessor);
    this.globe.polygonStrokeColor(this.polygonStrokeColorAccessor);
    this.globe.polygonAltitude(this.polygonAltitudeAccessor);
    this.globe.pathColor(this.pathColorAccessor);
    this.globe.pointColor(this.pointColorAccessor);
    this.globe.labelColor(this.labelColorAccessor);

    // If quiz mode (hiddenLabels) is on, reveal label only for hovered/selected
    const state = this.store.get();
    if (state.hiddenLabels && this.lastLabelCandidates.length > 0) {
      const mergedLabels = selectVisibleLabels(this.lastLabelCandidates, {
        hiddenLabels: true,
        selectedId: state.selection?.id,
        hoveredId: state.hovered?.id,
      });
      this.globe.labelsData(mergedLabels);
    }
  }

  public scheduleCompose(debounceMs = 60): void {
    if (this.isDestroyed) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.compose();
    }, debounceMs);
  }

  public async compose(): Promise<{
    polygonsCount: number;
    pathsCount: number;
    pointsCount: number;
    labelsCount: number;
    polygonsUpdated: boolean;
    pathsUpdated: boolean;
    pointsUpdated: boolean;
    labelsUpdated: boolean;
  }> {
    if (this.isDestroyed) {
      return {
        polygonsCount: 0,
        pathsCount: 0,
        pointsCount: 0,
        labelsCount: 0,
        polygonsUpdated: false,
        pathsUpdated: false,
        pointsUpdated: false,
        labelsUpdated: false,
      };
    }

    const state = this.store.get();
    const enabledLayers = LAYER_DEFINITIONS.filter(def => state.layers[def.id]?.enabled);

    const mergedPolygons: GeoFeature[] = [];
    const mergedPaths: PathItem[] = [];
    const mergedPoints: GeoFeature[] = [];
    const labelCandidates: GeoFeature[] = [];

    // Load data for all enabled layers in parallel
    const dataPromises = enabledLayers.map(async def => {
      try {
        const dataset = await loadGeoData(def.source);
        return { def, dataset };
      } catch (err) {
        console.warn(`[LayerCompositor] Could not load ${def.source} for layer ${def.id}:`, err);
        return { def, dataset: { type: 'FeatureCollection' as const, features: [] } };
      }
    });

    const loadedLayers = await Promise.all(dataPromises);

    for (const { def, dataset } of loadedLayers) {
      const layerState = state.layers[def.id];
      const maxRank = def.topN && layerState?.topN ? layerState.topN : Infinity;

      let filtered = dataset.features.filter(f => {
        // Match specific kind if multiple layers share the same file
        if (def.id === 'mountains' && f.properties.kind !== 'mountain') return false;
        if (def.id === 'deserts' && f.properties.kind !== 'desert') return false;
        if (def.id === 'capitals' && f.properties.kind !== 'capital') return false;
        if (def.id === 'megacities' && f.properties.kind !== 'megacity') return false;
        if (def.id === 'peaks' && f.properties.kind !== 'peak') return false;
        if (def.id === 'borders' && f.properties.kind !== 'country') return false;
        if (def.id === 'countriesTopN' && f.properties.kind !== 'country') return false;

        // TopN filter
        const order = f.properties.rank?.order ?? 1;
        return order <= maxRank;
      });

      // Tag features with current layerId and ensure stable id for ThreeDigest
      filtered = filtered.map(f => ({
        ...f,
        id: f.properties.id,
        properties: {
          ...f.properties,
          layerId: def.id,
        },
      }));

      if (def.kind === 'polygon') {
        mergedPolygons.push(...filtered);
      } else if (def.kind === 'point') {
        mergedPoints.push(...filtered);
      } else if (def.kind === 'path') {
        for (const feat of filtered) {
          if (feat.geometry.type === 'LineString') {
            const pathKey = `${feat.properties.id}-seg-0`;
            let item = this.pathItemCache.get(pathKey);
            if (!item) {
              item = {
                id: pathKey,
                feature: feat,
                points: feat.geometry.coordinates as [number, number][],
              };
              this.pathItemCache.set(pathKey, item);
            } else {
              item.feature = feat;
              item.points = feat.geometry.coordinates as [number, number][];
            }
            mergedPaths.push(item);
          } else if (feat.geometry.type === 'MultiLineString') {
            const multi = feat.geometry.coordinates as [number, number][][];
            multi.forEach((line, idx) => {
              const pathKey = `${feat.properties.id}-seg-${idx}`;
              let item = this.pathItemCache.get(pathKey);
              if (!item) {
                item = {
                  id: pathKey,
                  feature: feat,
                  points: line,
                };
                this.pathItemCache.set(pathKey, item);
              } else {
                item.feature = feat;
                item.points = line;
              }
              mergedPaths.push(item);
            });
          }
        }
      }

      // Collect label candidates
      labelCandidates.push(...filtered);
    }

    this.lastLabelCandidates = labelCandidates;

    const mergedLabels = selectVisibleLabels(labelCandidates, {
      hiddenLabels: state.hiddenLabels,
      selectedId: state.selection?.id,
      hoveredId: state.hovered?.id,
      maxLabels: 25,
    });

    let polygonsUpdated = false;
    let pathsUpdated = false;
    let pointsUpdated = false;
    let labelsUpdated = false;

    if (!this.areFeaturesIdentical(this.lastPolygons, mergedPolygons)) {
      this.globe.polygonsData(mergedPolygons);
      this.lastPolygons = mergedPolygons;
      polygonsUpdated = true;
    }

    if (!this.arePathsIdentical(this.lastPaths, mergedPaths)) {
      this.globe.pathsData(mergedPaths);
      this.lastPaths = mergedPaths;
      pathsUpdated = true;
    }

    if (!this.areFeaturesIdentical(this.lastPoints, mergedPoints)) {
      this.globe.pointsData(mergedPoints);
      this.lastPoints = mergedPoints;
      pointsUpdated = true;
    }

    if (!this.areFeaturesIdentical(this.lastLabels, mergedLabels)) {
      this.globe.labelsData(mergedLabels);
      this.lastLabels = mergedLabels;
      labelsUpdated = true;
    }

    return {
      polygonsCount: mergedPolygons.length,
      pathsCount: mergedPaths.length,
      pointsCount: mergedPoints.length,
      labelsCount: mergedLabels.length,
      polygonsUpdated,
      pathsUpdated,
      pointsUpdated,
      labelsUpdated,
    };
  }

  private areFeaturesIdentical(a: GeoFeature[], b: GeoFeature[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]?.id !== b[i]?.id) return false;
    }
    return true;
  }

  private arePathsIdentical(a: PathItem[], b: PathItem[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i] && a[i]?.id !== b[i]?.id) return false;
    }
    return true;
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs.length = 0;
    this.pathItemCache.clear();
    this.lastPolygons = [];
    this.lastPaths = [];
    this.lastPoints = [];
    this.lastLabels = [];
    this.globe.ringsData?.([]);
  }
}
