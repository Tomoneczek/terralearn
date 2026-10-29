import Globe, { type GlobeInstance } from 'globe.gl';
import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';
import { CameraController } from './camera';
import { LayerCompositor, type GlobeCompositorTarget } from './compositor';
import { attachGlobeEvents, type GlobeEventsDelegate } from './events';
import { DayNightController } from './day-night';
import { HighlightOverlay } from './highlight-overlay';
import { installPathHitTolerance } from './path-picking';
import { CapitalsLayer } from './capitals-layer';
import { PopulationLayer } from './population-layer';
import { HoverArbiter } from './hover-arbiter';
import { CloudsController } from './clouds';
import { AtmosphereController } from './atmosphere';
import { SunController } from './sun';
import { MoonController } from './moon';
import { MoonLabel } from './moon-label';
import { SkyClock } from './sky-clock';
import { FPSMonitor, QualityController } from './performance';

import type { ArcItem } from '@/geo/spherical';

import { RouteLayerController, type GlobeRouteDelegate } from './route-layer';
import {
  SizeComparisonLayerController,
  type GlobeSizeComparisonDelegate,
} from './size-comparison-layer';
import { AntipodesLayerController, type GlobeAntipodesDelegate } from './antipodes-layer';
import { GraticuleLayerController } from './graticule-layer';

export interface GlobeContext {
  globe: GlobeInstance;
  camera: CameraController;
  compositor: LayerCompositor;
  dayNight: DayNightController;
  atmosphere: AtmosphereController;
  sun: SunController;
  moon: MoonController;
  moonLabel: MoonLabel;
  skyClock: SkyClock;
  highlight: HighlightOverlay;
  capitals: CapitalsLayer;
  population: PopulationLayer;
  clouds: CloudsController;
  quality: QualityController;
  routes: RouteLayerController;
  sizeComparison: SizeComparisonLayerController;
  antipodes: AntipodesLayerController;
  graticule: GraticuleLayerController;
  fpsMonitor: FPSMonitor;
  setArcs: (arcs: ArcItem[]) => void;
  destroy: () => void;
}

export interface GlobeInitOptions {
  earthTexture?: string;
  nightTexture?: string;
  backgroundTexture?: string;
  atmosphereColor?: string;
  atmosphereAltitude?: number;
  enableAtmosphere?: boolean;
  enableClouds?: boolean;
}

export function createGlobe(
  container: HTMLElement,
  store: Store<AppState>,
  options: GlobeInitOptions = {},
): GlobeContext {
  const globe = new Globe(container);

  const earthTexture = resolveAssetUrl(options.earthTexture ?? '/textures/earth-dark.jpg');
  const backgroundTexture = resolveAssetUrl(options.backgroundTexture ?? '/textures/night-sky.png');
  const atmosphereColor = options.atmosphereColor ?? 'hsl(215, 80%, 65%)';
  const atmosphereAltitude = options.atmosphereAltitude ?? 0.18;

  const initialTheme = store.get().theme;
  globe
    .globeImageUrl(earthTexture)
    .backgroundImageUrl(initialTheme === 'classic' ? '' : backgroundTexture)
    .atmosphereColor(atmosphereColor)
    .atmosphereAltitude(atmosphereAltitude)
    .showAtmosphere(false);

  try {
    (globe as unknown as { backgroundColor?(color: string): void }).backgroundColor?.(
      'rgba(0,0,0,0)',
    );
  } catch {
    // Fallback
  }

  store.subscribe(
    s => s.theme,
    theme => {
      try {
        if (theme === 'classic') {
          globe.backgroundImageUrl('');
        } else {
          globe.backgroundImageUrl(backgroundTexture);
        }
      } catch {
        // Fallback in test environment
      }
    },
  );

  // One clock for the whole sky (Sun, Moon, eclipses); ticks every minute
  const skyClock = new SkyClock();

  // Day/Night Terminator Controller & Material
  const dayNight = new DayNightController(store, {
    date: skyClock.now(),
    baseTextureUrl: earthTexture,
    dayTextureUrl: '/textures/earth-day.jpg',
    nightTextureUrl: options.nightTexture,
    waterMaskUrl: '/textures/water-mask.png',
    atlasTextureUrl: '/textures/earth-atlas.jpg',
  });

  try {
    globe.globeMaterial(dayNight.getMaterial());
  } catch {
    // Non-WebGL mock fallback
  }

  // Arc accessors for quiz/routing spherical feedback
  try {
    globe
      .arcStartLat((d: object) => (d as ArcItem).startLat)
      .arcStartLng((d: object) => (d as ArcItem).startLng)
      .arcEndLat((d: object) => (d as ArcItem).endLat)
      .arcEndLng((d: object) => (d as ArcItem).endLng)
      .arcColor((d: object) => (d as ArcItem).color)
      .arcAltitude(0.2)
      .arcStroke(2.0)
      .arcDashLength(0.5)
      .arcDashGap(0.1)
      .arcDashAnimateTime(1000);
  } catch {
    // In test environment without arc methods
  }

  // Initial sizing
  const rect = container.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    globe.width(rect.width);
    globe.height(rect.height);
  }

  // Camera Controller
  const camera = new CameraController(globe);
  camera.resetView(0);

  // Layer Compositor
  const compositor = new LayerCompositor(globe as unknown as GlobeCompositorTarget, store);
  void compositor.compose();

  // Performance Monitor
  const fpsMonitor = new FPSMonitor({
    minFps: 22,
    consecutiveDropsThreshold: 6,
  });
  fpsMonitor.start();

  // 3D Scene Objects (Clouds & Atmosphere)
  let globeScene = null;
  try {
    globeScene = globe.scene();
  } catch {
    // Mock environment fallback
  }

  // Dynamic Sun-dependent Fresnel Atmosphere
  const atmosphere = new AtmosphereController(globeScene, store, {
    altitude: atmosphereAltitude,
    sunDirection: dayNight.getSunDirection(),
    dayColor: atmosphereColor,
  });

  // The Sun in the sky at its real angular size, sharing the day/night sun direction
  const sun = new SunController(globeScene, store, {
    sunDirection: dayNight.getSunDirection(),
    date: skyClock.now(),
  });

  // The Moon at its real position and size, lit by the same sun direction (phase)
  const moon = new MoonController(globeScene, store, {
    moonPosition: dayNight.getMoonPosition(),
    sunDirection: dayNight.getSunDirection(),
    date: skyClock.now(),
  });

  const unsubscribeSunUpdate = dayNight.onSunUpdate(date => {
    sun.setDate(date);
    moon.setDate(date);
  });
  const unsubscribeSkyClock = skyClock.onTick(date => dayNight.updateSun(date));

  // Rivers are thin screen-space lines: give them a comfortable pointer hit area
  installPathHitTolerance();

  // Hover/selection highlight drawn on a dedicated overlay (see HighlightOverlay)
  const highlight = new HighlightOverlay(globeScene, store, id => compositor.getFeatureById(id));
  compositor.onComposed = () => highlight.sync();

  // Capitals: one shader point cloud with a screen-center spotlight instead of a mesh per city
  const hoverArbiter = new HoverArbiter(store, container);

  // "MOON" reticle at real scale + the Moon's own hit test (click opens the Moon panel)
  const moonLabel = new MoonLabel({
    container,
    store,
    moon,
    arbiter: hoverArbiter,
    getCamera: () => {
      try {
        return globe.camera();
      } catch {
        return null;
      }
    },
  });
  const capitals = new CapitalsLayer({
    scene: globeScene,
    store,
    arbiter: hoverArbiter,
    container,
    getCamera: () => {
      try {
        return globe.camera();
      } catch {
        return null;
      }
    },
  });
  compositor.capitalsSink = capitals;

  // Population density: one H3 grid mesh, loaded the first time the layer is enabled
  const population = new PopulationLayer({
    scene: globeScene,
    store,
    arbiter: hoverArbiter,
    container,
    toGlobeCoords: (x, y) => {
      try {
        return globe.toGlobeCoords(x, y);
      } catch {
        return null;
      }
    },
  });

  const clouds = new CloudsController(globeScene, store, {
    enabled: options.enableClouds ?? true,
    cloudsTextureUrl: '/textures/clouds.png',
  });

  // Quality Controller managing presets and FPS degradation
  const quality = new QualityController(
    store,
    {
      clouds,
      atmosphere,
      setPixelRatio: (ratio: number) => {
        try {
          globe.renderer()?.setPixelRatio(ratio);
        } catch {
          // Fallback in mock environment
        }
      },
    },
    fpsMonitor,
  );

  // Events
  const detachEvents = attachGlobeEvents(
    globe as unknown as GlobeEventsDelegate,
    store,
    container,
    hoverArbiter,
  );

  // Spherical Route Layer Controller (Orthodrome vs Loxodrome)
  const routes = new RouteLayerController(globe as unknown as GlobeRouteDelegate, store);

  // Size Comparison Ghost Layer Controller
  const sizeComparison = new SizeComparisonLayerController(
    globe as unknown as GlobeSizeComparisonDelegate,
    store,
  );

  // Antipodes Simulator Layer Controller
  const antipodes = new AntipodesLayerController(globe as unknown as GlobeAntipodesDelegate, store);

  // Cartographic Graticule Layer Controller (Equator, Tropics, 15° Grid)
  const graticule = new GraticuleLayerController(globeScene, store);

  // ResizeObserver with DPR protection
  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        globe.width(width);
        globe.height(height);
      }
    }
  });
  resizeObserver.observe(container);

  return {
    globe,
    camera,
    compositor,
    dayNight,
    atmosphere,
    sun,
    moon,
    moonLabel,
    skyClock,
    highlight,
    capitals,
    population,
    clouds,
    quality,
    routes,
    sizeComparison,
    antipodes,
    graticule,
    fpsMonitor,
    setArcs: (arcs: ArcItem[]) => {
      try {
        globe.arcsData(arcs);
      } catch {
        // Fallback in mock environment
      }
    },
    destroy: () => {
      resizeObserver.disconnect();
      detachEvents();
      compositor.destroy();
      highlight.destroy();
      capitals.destroy();
      population.destroy();
      unsubscribeSkyClock();
      unsubscribeSunUpdate();
      skyClock.destroy();
      sun.destroy();
      moonLabel.destroy();
      moon.destroy();
      dayNight.destroy();
      atmosphere.destroy();
      clouds.destroy();
      quality.destroy();
      routes.destroy();
      sizeComparison.destroy();
      antipodes.destroy();
      graticule.destroy();
      fpsMonitor.stop();
      // Remove globe canvas
      const canvas = container.querySelector('canvas');
      if (canvas) {
        canvas.remove();
      }
    },
  };
}
