import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import { createGlobe } from '@/globe/instance';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGlobeInstance: any = {
  globeImageUrl: vi.fn().mockReturnThis(),
  backgroundImageUrl: vi.fn().mockReturnThis(),
  atmosphereColor: vi.fn().mockReturnThis(),
  atmosphereAltitude: vi.fn().mockReturnThis(),
  showAtmosphere: vi.fn().mockReturnThis(),
  width: vi.fn().mockReturnThis(),
  height: vi.fn().mockReturnThis(),
  pointOfView: vi.fn().mockReturnValue({ lat: 0, lng: 0, altitude: 2.5 }),
  controls: vi.fn().mockReturnValue({ autoRotate: false }),
  polygonsData: vi.fn().mockReturnThis(),
  pathsData: vi.fn().mockReturnThis(),
  pointsData: vi.fn().mockReturnThis(),
  labelsData: vi.fn().mockReturnThis(),
  polygonCapColor: vi.fn().mockReturnThis(),
  polygonSideColor: vi.fn().mockReturnThis(),
  polygonStrokeColor: vi.fn().mockReturnThis(),
  polygonAltitude: vi.fn().mockReturnThis(),
  pathPoints: vi.fn().mockReturnThis(),
  pathPointLat: vi.fn().mockReturnThis(),
  pathPointLng: vi.fn().mockReturnThis(),
  pathPointAlt: vi.fn().mockReturnThis(),
  pathColor: vi.fn().mockReturnThis(),
  pathStroke: vi.fn().mockReturnThis(),
  pointLat: vi.fn().mockReturnThis(),
  pointLng: vi.fn().mockReturnThis(),
  pointColor: vi.fn().mockReturnThis(),
  pointRadius: vi.fn().mockReturnThis(),
  pointAltitude: vi.fn().mockReturnThis(),
  labelLat: vi.fn().mockReturnThis(),
  labelLng: vi.fn().mockReturnThis(),
  labelText: vi.fn().mockReturnThis(),
  labelSize: vi.fn().mockReturnThis(),
  labelDotRadius: vi.fn().mockReturnThis(),
  labelAltitude: vi.fn().mockReturnThis(),
  labelColor: vi.fn().mockReturnThis(),
  onPolygonClick: vi.fn().mockReturnThis(),
  onPolygonHover: vi.fn().mockReturnThis(),
  onPathClick: vi.fn().mockReturnThis(),
  onPathHover: vi.fn().mockReturnThis(),
  onPointClick: vi.fn().mockReturnThis(),
  onPointHover: vi.fn().mockReturnThis(),
  onGlobeClick: vi.fn().mockReturnThis(),
  globeMaterial: vi.fn().mockReturnThis(),
  postProcessingComposer: vi.fn().mockReturnValue(null),
};

vi.mock('globe.gl', () => {
  return {
    default: function MockGlobe() {
      return mockGlobeInstance;
    },
  };
});

describe('Globe Instance Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes globe instance, sets textures and atmosphere, and returns context', () => {
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    const store = createStore(createInitialState());

    const context = createGlobe(container, store, {
      earthTexture: '/test-earth.jpg',
      backgroundTexture: '/test-sky.png',
      atmosphereColor: 'hsl(200, 100%, 50%)',
      atmosphereAltitude: 0.2,
    });

    expect(mockGlobeInstance.globeImageUrl).toHaveBeenCalledWith('/test-earth.jpg');
    expect(mockGlobeInstance.backgroundImageUrl).toHaveBeenCalledWith('/test-sky.png');
    expect(mockGlobeInstance.atmosphereColor).toHaveBeenCalledWith('hsl(200, 100%, 50%)');
    expect(mockGlobeInstance.atmosphereAltitude).toHaveBeenCalledWith(0.2);
    expect(mockGlobeInstance.showAtmosphere).toHaveBeenCalledWith(true);

    expect(context.camera).toBeDefined();
    expect(context.compositor).toBeDefined();
    expect(context.dayNight).toBeDefined();
    expect(context.bloom).toBeDefined();
    expect(context.fpsMonitor).toBeDefined();
    expect(typeof context.destroy).toBe('function');

    // Canvas removal on destroy
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    context.destroy();
    expect(container.querySelector('canvas')).toBeNull();
  });
});
