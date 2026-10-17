import Globe, { type GlobeInstance } from 'globe.gl';
import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';
import { CameraController } from './camera';
import { LayerCompositor, type GlobeCompositorTarget } from './compositor';
import { attachGlobeEvents, type GlobeEventsDelegate } from './events';
import { DayNightController } from './day-night';
import { BloomController } from './bloom';
import { FPSMonitor } from './performance';

import type { ArcItem } from '@/geo/spherical';

export interface GlobeContext {
  globe: GlobeInstance;
  camera: CameraController;
  compositor: LayerCompositor;
  dayNight: DayNightController;
  bloom: BloomController;
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
  enableBloom?: boolean;
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

  globe
    .globeImageUrl(earthTexture)
    .backgroundImageUrl(backgroundTexture)
    .atmosphereColor(atmosphereColor)
    .atmosphereAltitude(atmosphereAltitude)
    .showAtmosphere(true);

  // Day/Night Terminator Controller & Material
  const dayNight = new DayNightController(store, {
    baseTextureUrl: earthTexture,
    dayTextureUrl: resolveAssetUrl('/textures/earth-day.jpg'),
    nightTextureUrl: options.nightTexture,
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
    minFps: 35,
    onDegrade: () => {
      bloom.setEnabled(false);
    },
  });
  fpsMonitor.start();

  const bloom = new BloomController(globe, { enabled: options.enableBloom ?? true }, fpsMonitor);

  // Events
  const detachEvents = attachGlobeEvents(globe as unknown as GlobeEventsDelegate, store, container);

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
    bloom,
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
      fpsMonitor.stop();
      // Remove globe canvas
      const canvas = container.querySelector('canvas');
      if (canvas) {
        canvas.remove();
      }
    },
  };
}
