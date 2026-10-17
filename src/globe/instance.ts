import Globe, { type GlobeInstance } from 'globe.gl';
import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';
import { CameraController } from './camera';
import { LayerCompositor, type GlobeCompositorTarget } from './compositor';
import { attachGlobeEvents, type GlobeEventsDelegate } from './events';
import { DayNightController } from './day-night';
import { BloomController } from './bloom';
import { CloudsController } from './clouds';
import { AtmosphereController } from './atmosphere';
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
  bloom: BloomController;
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
  enableBloom?: boolean;
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

  // Day/Night Terminator Controller & Material
  const dayNight = new DayNightController(store, {
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

  // Performance Monitor & Bloom Post-Processing
  const fpsMonitor = new FPSMonitor({
    minFps: 22,
    consecutiveDropsThreshold: 6,
  });
  fpsMonitor.start();

  const bloom = new BloomController(globe, { enabled: options.enableBloom ?? true });

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

  const clouds = new CloudsController(globeScene, store, {
    enabled: options.enableClouds ?? true,
    cloudsTextureUrl: '/textures/clouds.png',
  });

  // Quality Controller managing presets and FPS degradation
  const quality = new QualityController(
    store,
    {
      bloom,
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
  const detachEvents = attachGlobeEvents(globe as unknown as GlobeEventsDelegate, store, container);

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
    bloom,
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
