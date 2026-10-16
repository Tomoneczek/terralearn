import Globe, { type GlobeInstance } from 'globe.gl';
import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';
import { CameraController } from './camera';
import { LayerCompositor, type GlobeCompositorTarget } from './compositor';
import { attachGlobeEvents, type GlobeEventsDelegate } from './events';

export interface GlobeContext {
  globe: GlobeInstance;
  camera: CameraController;
  compositor: LayerCompositor;
  destroy: () => void;
}

export interface GlobeInitOptions {
  earthTexture?: string;
  backgroundTexture?: string;
  atmosphereColor?: string;
  atmosphereAltitude?: number;
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
    destroy: () => {
      resizeObserver.disconnect();
      detachEvents();
      compositor.destroy();
      // Remove globe canvas
      const canvas = container.querySelector('canvas');
      if (canvas) {
        canvas.remove();
      }
    },
  };
}
