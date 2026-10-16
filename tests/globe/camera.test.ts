import { describe, it, expect, vi } from 'vitest';
import { CameraController, type GlobeInstanceLike, type GlobeCameraTarget } from '@/globe/camera';

describe('CameraController', () => {
  function createMockGlobe(initialPov = { lat: 20, lng: 0, altitude: 2.5 }): GlobeInstanceLike {
    let pov = { ...initialPov };
    const controls = {
      autoRotate: false,
      autoRotateSpeed: 0.5,
    };

    return {
      pointOfView: vi.fn((newPov?: Partial<GlobeCameraTarget>) => {
        if (newPov) {
          pov = { ...pov, ...newPov };
        }
        return { ...pov };
      }),
      controls: vi.fn(() => controls),
    };
  }

  it('initializes with default options and retrieves point of view', () => {
    const globe = createMockGlobe({ lat: 10, lng: 20, altitude: 2.0 });
    const camera = new CameraController(globe);

    expect(camera.getPointOfView()).toEqual({ lat: 10, lng: 20, altitude: 2.0 });
    expect(globe.pointOfView).toHaveBeenCalled();
  });

  it('flyTo clamps altitude and calls pointOfView with duration', () => {
    const globe = createMockGlobe();
    const camera = new CameraController(globe, { minAltitude: 0.2, maxAltitude: 3.5 });

    camera.flyTo(52, 21, 1.2, 1000);
    expect(globe.pointOfView).toHaveBeenCalledWith({ lat: 52, lng: 21, altitude: 1.2 }, 1000);

    // Test min clamping
    camera.flyTo(52, 21, 0.05, 500);
    expect(globe.pointOfView).toHaveBeenCalledWith({ lat: 52, lng: 21, altitude: 0.2 }, 500);

    // Test max clamping
    camera.flyTo(52, 21, 10.0, 500);
    expect(globe.pointOfView).toHaveBeenCalledWith({ lat: 52, lng: 21, altitude: 3.5 }, 500);
  });

  it('zoomIn decreases altitude and respects minAltitude', () => {
    const globe = createMockGlobe({ lat: 0, lng: 0, altitude: 2.0 });
    const camera = new CameraController(globe, { minAltitude: 0.5 });

    camera.zoomIn(0.5); // 2.0 * 0.5 = 1.0
    expect(globe.pointOfView).toHaveBeenCalledWith({ altitude: 1.0 }, 400);

    camera.zoomIn(0.1); // 1.0 * 0.1 = 0.1 -> clamped to 0.5
    expect(globe.pointOfView).toHaveBeenCalledWith({ altitude: 0.5 }, 400);
  });

  it('zoomOut increases altitude and respects maxAltitude', () => {
    const globe = createMockGlobe({ lat: 0, lng: 0, altitude: 2.0 });
    const camera = new CameraController(globe, { maxAltitude: 3.0 });

    camera.zoomOut(1.2); // 2.0 * 1.2 = 2.4
    expect(globe.pointOfView).toHaveBeenCalledWith({ altitude: 2.4 }, 400);

    camera.zoomOut(2.0); // 2.4 * 2.0 = 4.8 -> clamped to 3.0
    expect(globe.pointOfView).toHaveBeenCalledWith({ altitude: 3.0 }, 400);
  });

  it('resetView animates to default point of view', () => {
    const globe = createMockGlobe();
    const defaultPov = { lat: 30, lng: 15, altitude: 2.8 };
    const camera = new CameraController(globe, { defaultPov });

    camera.resetView(800);
    expect(globe.pointOfView).toHaveBeenCalledWith(defaultPov, 800);
  });

  it('toggles and checks auto rotation via controls', () => {
    const globe = createMockGlobe();
    const camera = new CameraController(globe);

    expect(camera.isAutoRotating()).toBe(false);

    camera.setAutoRotate(true, 1.2);
    expect(camera.isAutoRotating()).toBe(true);
    expect(globe.controls?.()?.autoRotateSpeed).toBe(1.2);

    camera.setAutoRotate(false);
    expect(camera.isAutoRotating()).toBe(false);
  });
});
