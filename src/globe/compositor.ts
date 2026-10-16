import type { Store, AppState } from '@/state/types';
import { LAYER_DEFINITIONS, type LayerDef, type LayerId } from '@/layers';
import { loadGeoData, type GeoFeature } from './data-loader';

export interface PathItem {
  feature: GeoFeature;
  points: [number, number][];
}

export interface GlobeCompositorTarget {
  polygonsData(data: GeoFeature[]): this;
  pathsData(data: PathItem[]): this;
  pointsData(data: GeoFeature[]): this;
  labelsData(data: GeoFeature[]): this;

  polygonCapColor(fn: (d: GeoFeature) => string): this;
  polygonSideColor(fn: (d: GeoFeature) => string): this;
  polygonStrokeColor(fn: (d: GeoFeature) => string): this;
  polygonAltitude(fn: (d: GeoFeature) => number): this;

  pathPoints(fn: (d: PathItem) => [number, number][]): this;
  pathPointLat(fn: (pt: [number, number]) => number): this;
  pathPointLng(fn: (pt: [number, number]) => number): this;
  pathPointAlt(fn: (pt: [number, number]) => number): this;
  pathColor(fn: (d: PathItem) => string): this;
  pathStroke(fn: (d: PathItem) => number): this;
  pathDashLength?(len: number): this;
  pathDashGap?(gap: number): this;
  pathDashAnimateTime?(ms: number): this;

  pointLat(fn: (d: GeoFeature) => number): this;
  pointLng(fn: (d: GeoFeature) => number): this;
  pointColor(fn: (d: GeoFeature) => string): this;
  pointRadius(fn: (d: GeoFeature) => number): this;
  pointAltitude(fn: (d: GeoFeature) => number): this;

  labelLat(fn: (d: GeoFeature) => number): this;
  labelLng(fn: (d: GeoFeature) => number): this;
  labelText(fn: (d: GeoFeature) => string): this;
  labelSize(fn: (d: GeoFeature) => number): this;
  labelDotRadius(fn: (d: GeoFeature) => number): this;
  labelAltitude(fn: (d: GeoFeature) => number): this;
  labelColor(fn: (d: GeoFeature) => string): this;
}

export class LayerCompositor {
  private readonly globe: GlobeCompositorTarget;
  private readonly store: Store<AppState>;
  private readonly layerDefsMap: Map<LayerId, LayerDef>;
  private unsubscribe: (() => void) | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;

  constructor(globe: GlobeCompositorTarget, store: Store<AppState>) {
    this.globe = globe;
    this.store = store;
    this.layerDefsMap = new Map(LAYER_DEFINITIONS.map(def => [def.id, def]));

    this.configureAccessors();
    this.bindStore();
  }

  private configureAccessors(): void {
    // Polygons
    this.globe.polygonCapColor(feat => {
      const state = this.store.get();
      if (state.selection?.id === feat.properties.id) {
        return 'hsla(180, 100%, 70%, 0.65)';
      }
      if (state.hovered?.id === feat.properties.id) {
        return 'hsla(180, 100%, 80%, 0.45)';
      }
      const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
      return def?.style?.capColor || 'transparent';
    });

    this.globe.polygonSideColor(feat => {
      const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
      return def?.style?.sideColor || 'transparent';
    });

    this.globe.polygonStrokeColor(feat => {
      const state = this.store.get();
      if (state.selection?.id === feat.properties.id) {
        return 'hsl(50, 100%, 65%)'; // Gold highlight
      }
      if (state.hovered?.id === feat.properties.id) {
        return 'hsl(180, 100%, 80%)';
      }
      const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
      return def?.style?.strokeColor || 'transparent';
    });

    this.globe.polygonAltitude(feat => {
      const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
      let baseAlt = def?.style?.altitude || 0.005;
      const state = this.store.get();
      if (state.selection?.id === feat.properties.id) {
        baseAlt += 0.012;
      } else if (state.hovered?.id === feat.properties.id) {
        baseAlt += 0.004;
      }
      return baseAlt;
    });

    // Paths
    this.globe.pathPoints(item => item.points);
    this.globe.pathPointLat(pt => pt[1]);
    this.globe.pathPointLng(pt => pt[0]);
    this.globe.pathPointAlt(() => 0.004);
    this.globe.pathColor(item => {
      const state = this.store.get();
      if (state.selection?.id === item.feature.properties.id) {
        return 'hsl(50, 100%, 70%)';
      }
      if (state.hovered?.id === item.feature.properties.id) {
        return 'hsl(180, 100%, 85%)';
      }
      const def = this.layerDefsMap.get(item.feature.properties.layerId as LayerId);
      return def?.style?.color || 'hsl(190, 100%, 65%)';
    });
    this.globe.pathStroke(item => {
      const def = this.layerDefsMap.get(item.feature.properties.layerId as LayerId);
      return def?.style?.strokeWidth || 1.5;
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
    this.globe.pointColor(feat => {
      const state = this.store.get();
      if (state.selection?.id === feat.properties.id) {
        return 'hsl(50, 100%, 70%)';
      }
      if (state.hovered?.id === feat.properties.id) {
        return 'hsl(180, 100%, 80%)';
      }
      const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
      return def?.style?.color || 'hsl(350, 85%, 62%)';
    });
    this.globe.pointRadius(feat => {
      const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
      return def?.style?.radius || 0.3;
    });
    this.globe.pointAltitude(feat => (feat.properties.kind === 'peak' ? 0.015 : 0.008));

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
    this.globe.labelText(feat => feat.properties.name_pl);
    this.globe.labelSize(feat => (feat.properties.kind === 'country' ? 1.4 : 1.0));
    this.globe.labelDotRadius(feat => (feat.properties.kind === 'country' ? 0.0 : 0.2));
    this.globe.labelAltitude(() => 0.016);
    this.globe.labelColor(() => 'rgba(255, 255, 255, 0.95)');
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => ({
        layers: s.layers,
        hiddenLabels: s.hiddenLabels,
        selection: s.selection?.id,
        hovered: s.hovered?.id,
      }),
      () => {
        this.scheduleCompose();
      },
    );
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
  }> {
    if (this.isDestroyed) {
      return { polygonsCount: 0, pathsCount: 0, pointsCount: 0, labelsCount: 0 };
    }

    const state = this.store.get();
    const enabledLayers = LAYER_DEFINITIONS.filter(def => state.layers[def.id]?.enabled);

    const mergedPolygons: GeoFeature[] = [];
    const mergedPaths: PathItem[] = [];
    const mergedPoints: GeoFeature[] = [];
    const mergedLabels: GeoFeature[] = [];

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

      // Tag features with current layerId
      filtered = filtered.map(f => ({
        ...f,
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
            mergedPaths.push({
              feature: feat,
              points: feat.geometry.coordinates as [number, number][],
            });
          } else if (feat.geometry.type === 'MultiLineString') {
            const multi = feat.geometry.coordinates as [number, number][][];
            for (const line of multi) {
              mergedPaths.push({
                feature: feat,
                points: line,
              });
            }
          }
        }
      }

      // Collect labels if not hidden
      if (!state.hiddenLabels) {
        const labeledFeatures = filtered.slice(0, 50);
        mergedLabels.push(...labeledFeatures);
      }
    }

    this.globe.polygonsData(mergedPolygons);
    this.globe.pathsData(mergedPaths);
    this.globe.pointsData(mergedPoints);
    this.globe.labelsData(mergedLabels);

    return {
      polygonsCount: mergedPolygons.length,
      pathsCount: mergedPaths.length,
      pointsCount: mergedPoints.length,
      labelsCount: mergedLabels.length,
    };
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
