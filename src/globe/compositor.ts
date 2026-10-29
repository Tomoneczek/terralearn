import { DoubleSide, MeshBasicMaterial, type Material } from 'three';
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
  getSrsColor,
} from '@/layers';
import { loadSrsState, type SrsState } from '@/quiz/srs';
import { loadGeoData, type GeoFeature } from './data-loader';

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

/** Receives the capitals instead of globe.gl's per-point meshes (see CapitalsLayer). */
export interface CapitalsSink {
  setFeatures(features: readonly GeoFeature[]): void;
  setColors(overrides: Record<string, string> | null): void;
}

export interface GlobeCompositorTarget {
  polygonsData(data: GeoFeature[]): this;
  pathsData(data: PathItem[]): this;
  pointsData(data: GeoFeature[]): this;
  ringsData?(data: RingItem[]): this;

  polygonCapColor(fn: (d: GeoFeature) => string): this;
  polygonSideColor(fn: (d: GeoFeature) => string): this;
  polygonCapMaterial?(fn: (d: GeoFeature) => Material | undefined): this;
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
  private lastFeatures: GeoFeature[] = [];

  // Path item instance cache by key, ensuring stable identity and preserving __threeObjPath
  private readonly pathItemCache = new Map<string, PathItem>();
  private lastPolygons: GeoFeature[] = [];
  private lastPaths: PathItem[] = [];
  private lastPoints: GeoFeature[] = [];
  private srsState: SrsState = {};
  // Features of all enabled layers by id, used to resolve hover/selection geometry
  private featureIndex = new Map<string, GeoFeature>();
  // Features of enabled layers that the Top N slider currently leaves out, by id
  private hiddenByTopN = new Map<string, { def: LayerDef; feature: GeoFeature }>();
  /** Invoked after every compose so dependents can re-resolve features. */
  public onComposed: (() => void) | null = null;
  /** Where capitals are rendered; without a sink they fall back to regular globe points. */
  public capitalsSink: CapitalsSink | null = null;
  private lastCapitalKey = '\u0000';

  // Stable accessor references so they can be re-applied on hover without recreating data
  // Hover/selection highlighting is drawn by HighlightOverlay, so the accessors below depend only
  // on layer style and knowledge-map state; pointer moves never re-evaluate them.
  private readonly polygonCapColorAccessor = (feat: GeoFeature): string => {
    const state = this.store.get();
    const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);

    if (state.knowledgeMap) {
      const srsColor = getSrsColor(feat.properties.id, this.srsState, 'fill');
      if (srsColor) return srsColor;
    }
    return getPolygonCapColor(feat, false, false, def);
  };

  // Fully transparent parts are expensive for nothing: globe.gl builds side geometry and draws
  // an (invisible) stroke for any truthy color string. An empty string skips them entirely.
  private readonly polygonSideColorAccessor = (feat: GeoFeature): string => {
    const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
    const color = getPolygonSideColor(feat, false, false, def);
    return color === 'transparent' ? '' : color;
  };

  // Transparent caps stay in the scene for pointer picking, but with a non-rendered material:
  // three.js skips `material.visible === false` when drawing yet still raycasts the mesh.
  // DoubleSide like globe.gl's default cap material: raycasting skips back faces otherwise.
  private readonly invisibleCapMaterial = new MeshBasicMaterial({
    visible: false,
    side: DoubleSide,
  });
  private readonly polygonCapMaterialAccessor = (feat: GeoFeature): Material | undefined =>
    this.polygonCapColorAccessor(feat) === 'transparent' ? this.invisibleCapMaterial : undefined;

  private readonly polygonStrokeColorAccessor = (feat: GeoFeature): string => {
    const state = this.store.get();
    const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);

    if (state.knowledgeMap) {
      const srsStroke = getSrsColor(feat.properties.id, this.srsState, 'stroke');
      if (srsStroke) return srsStroke;
    }
    const color = getPolygonStrokeColor(feat, false, false, def);
    return color === 'transparent' ? '' : color;
  };

  private readonly polygonAltitudeAccessor = (feat: GeoFeature): number => {
    const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);
    return getPolygonAltitude(feat, false, false, def);
  };

  private readonly pathColorAccessor = (item: PathItem): string => {
    const state = this.store.get();
    const def = this.layerDefsMap.get(item.feature.properties.layerId as LayerId);

    if (state.knowledgeMap) {
      const srsPath = getSrsColor(item.feature.properties.id, this.srsState, 'path');
      if (srsPath) return srsPath;
    }
    return getPathColor(item.feature, false, false, def);
  };

  private readonly pointColorAccessor = (feat: GeoFeature): string => {
    const state = this.store.get();
    const def = this.layerDefsMap.get(feat.properties.layerId as LayerId);

    if (state.knowledgeMap) {
      const srsPoint = getSrsColor(feat.properties.id, this.srsState, 'point');
      if (srsPoint) return srsPoint;
    }
    return getPointColor(feat, false, false, def);
  };

  constructor(globe: GlobeCompositorTarget, store: Store<AppState>) {
    this.globe = globe;
    this.store = store;
    this.layerDefsMap = new Map(LAYER_DEFINITIONS.map(def => [def.id, def]));

    if (this.store.get().knowledgeMap) {
      this.srsState = loadSrsState();
    }

    this.configureAccessors();
    this.bindStore();
  }

  private configureAccessors(): void {
    // Smooth entry transitions for newly added items (cached items do not re-animate)
    this.globe.polygonsTransitionDuration?.(400);
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
    this.globe.polygonCapMaterial?.(this.polygonCapMaterialAccessor);
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
  }
  private bindStore(): void {
    // 1. Data re-composition ONLY when layer activation or topN changes
    const unsubLayers = this.store.subscribe(
      s => ({ layers: s.layers }),
      () => {
        this.scheduleCompose();
      },
      (a, b) => {
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

    // 2. Selection halo. Hover/select highlighting of the polygon/path/point itself is drawn by
    // HighlightOverlay, so the main layers are never restyled here.
    const unsubInteractions = this.store.subscribe(
      s => s.selection,
      () => this.updateSelectionHalo(),
      (a, b) => a?.id === b?.id && a?.lat === b?.lat && a?.lng === b?.lng,
    );
    this.unsubs.push(unsubInteractions);

    // 3. Knowledge map mode toggle and SRS updates
    const unsubKnowledge = this.store.subscribe(
      s => s.knowledgeMap,
      km => {
        if (km) {
          this.srsState = loadSrsState();
        }
        this.refreshDynamicStyles();
      },
    );
    this.unsubs.push(unsubKnowledge);

    const handleSrsUpdated = (): void => {
      if (this.store.get().knowledgeMap) {
        this.srsState = loadSrsState();
        this.refreshDynamicStyles();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('tl-srs-updated', handleSrsUpdated);
      this.unsubs.push(() => window.removeEventListener('tl-srs-updated', handleSrsUpdated));
    }
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
    this.globe.polygonCapMaterial?.(this.polygonCapMaterialAccessor);
    this.globe.polygonSideColor(this.polygonSideColorAccessor);
    this.globe.polygonStrokeColor(this.polygonStrokeColorAccessor);
    this.globe.polygonAltitude(this.polygonAltitudeAccessor);
    this.globe.pathColor(this.pathColorAccessor);
    this.globe.pointColor(this.pointColorAccessor);
    this.updateCapitalColors();
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
    polygonsUpdated: boolean;
    pathsUpdated: boolean;
    pointsUpdated: boolean;
  }> {
    if (this.isDestroyed) {
      return {
        polygonsCount: 0,
        pathsCount: 0,
        pointsCount: 0,
        polygonsUpdated: false,
        pathsUpdated: false,
        pointsUpdated: false,
      };
    }

    const state = this.store.get();
    // `hex` layers (population grid) are not GeoJSON features: they draw themselves.
    const enabledLayers = LAYER_DEFINITIONS.filter(
      def => def.kind !== 'hex' && state.layers[def.id]?.enabled,
    );

    const mergedPolygons: GeoFeature[] = [];
    const mergedPaths: PathItem[] = [];
    const mergedPoints: GeoFeature[] = [];
    const allFeatures: GeoFeature[] = [];
    const hiddenByTopN = new Map<string, { def: LayerDef; feature: GeoFeature }>();
    let capitalFeatures: GeoFeature[] = [];

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
        if (def.id === 'landforms' && f.properties.kind !== 'landform') return false;
        if (def.id === 'marine' && f.properties.kind !== 'marine') return false;
        if (def.id === 'borders' && f.properties.kind !== 'country') return false;
        if (def.id === 'countriesTopN' && f.properties.kind !== 'country') return false;

        // TopN filter. Objects beyond it are not drawn, but stay resolvable for the highlight
        // overlay (the rankings table can locate an object that is outside the Top N).
        const order = f.properties.rank?.order ?? 1;
        if (order > maxRank) {
          hiddenByTopN.set(f.properties.id, { def, feature: f });
          return false;
        }
        return true;
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
        if (def.id === 'capitals' && this.capitalsSink) {
          capitalFeatures = filtered;
        } else {
          mergedPoints.push(...filtered);
        }
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

      allFeatures.push(...filtered);
    }

    this.lastFeatures = allFeatures;
    this.featureIndex = new Map(allFeatures.map(f => [f.properties.id, f]));
    this.hiddenByTopN = hiddenByTopN;
    this.syncCapitals(capitalFeatures);

    let polygonsUpdated = false;
    let pathsUpdated = false;
    let pointsUpdated = false;

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

    this.onComposed?.();

    return {
      polygonsCount: mergedPolygons.length,
      pathsCount: mergedPaths.length,
      pointsCount: mergedPoints.length,
      polygonsUpdated,
      pathsUpdated,
      pointsUpdated,
    };
  }

  private syncCapitals(features: GeoFeature[]): void {
    if (!this.capitalsSink) return;
    const key = features.map(f => f.properties.id).join('|');
    if (key !== this.lastCapitalKey) {
      this.lastCapitalKey = key;
      this.capitalsSink.setFeatures(features);
    }
    this.updateCapitalColors();
  }

  /** Knowledge-map mastery colors for capitals (they are no longer globe.gl points). */
  private updateCapitalColors(): void {
    if (!this.capitalsSink) return;
    const state = this.store.get();
    if (!state.knowledgeMap) {
      this.capitalsSink.setColors(null);
      return;
    }
    const overrides: Record<string, string> = {};
    for (const f of this.lastFeatures) {
      if (f.properties.layerId !== 'capitals') continue;
      const color = getSrsColor(f.properties.id, this.srsState, 'point');
      if (color) overrides[f.properties.id] = color;
    }
    this.capitalsSink.setColors(overrides);
  }

  /**
   * Feature of an enabled layer by id (for highlight geometry), including objects the Top N
   * slider leaves out of the globe.
   */
  public getFeatureById(id: string): GeoFeature | undefined {
    const drawn = this.featureIndex.get(id);
    if (drawn) return drawn;
    const hidden = this.hiddenByTopN.get(id);
    if (!hidden) return undefined;
    return {
      ...hidden.feature,
      id,
      properties: { ...hidden.feature.properties, layerId: hidden.def.id },
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
    this.invisibleCapMaterial.dispose();
    this.featureIndex.clear();
    this.hiddenByTopN.clear();
    this.onComposed = null;
    this.capitalsSink = null;
    this.lastPolygons = [];
    this.lastPaths = [];
    this.lastPoints = [];
    this.lastFeatures = [];
    this.globe.ringsData?.([]);
  }
}
