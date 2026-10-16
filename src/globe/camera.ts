export interface GlobeCameraTarget {
  lat?: number;
  lng?: number;
  altitude?: number;
}

export interface GlobeInstanceLike {
  pointOfView(pov?: GlobeCameraTarget, ms?: number): { lat: number; lng: number; altitude: number };
  controls?(): {
    autoRotate?: boolean;
    autoRotateSpeed?: number;
    minDistance?: number;
    maxDistance?: number;
  };
}

export interface CameraControllerOptions {
  minAltitude?: number;
  maxAltitude?: number;
  defaultPov?: { lat: number; lng: number; altitude: number };
}

export class CameraController {
  private readonly globe: GlobeInstanceLike;
  private readonly minAltitude: number;
  private readonly maxAltitude: number;
  private readonly defaultPov: { lat: number; lng: number; altitude: number };

  constructor(globe: GlobeInstanceLike, options: CameraControllerOptions = {}) {
    this.globe = globe;
    this.minAltitude = options.minAltitude ?? 0.2;
    this.maxAltitude = options.maxAltitude ?? 4.0;
    this.defaultPov = options.defaultPov ?? { lat: 20, lng: 0, altitude: 2.2 };
  }

  public getPointOfView(): { lat: number; lng: number; altitude: number } {
    return this.globe.pointOfView();
  }

  public flyTo(lat: number, lng: number, altitude = 1.5, durationMs = 1200): void {
    const clampedAltitude = Math.max(this.minAltitude, Math.min(this.maxAltitude, altitude));
    this.globe.pointOfView({ lat, lng, altitude: clampedAltitude }, durationMs);
  }

  public zoomIn(factor = 0.7, durationMs = 400): void {
    const current = this.globe.pointOfView();
    const newAltitude = Math.max(this.minAltitude, current.altitude * factor);
    this.globe.pointOfView({ altitude: newAltitude }, durationMs);
  }

  public zoomOut(factor = 1.4, durationMs = 400): void {
    const current = this.globe.pointOfView();
    const newAltitude = Math.min(this.maxAltitude, current.altitude * factor);
    this.globe.pointOfView({ altitude: newAltitude }, durationMs);
  }

  public resetView(durationMs = 1000): void {
    this.globe.pointOfView(this.defaultPov, durationMs);
  }

  public setAutoRotate(enabled: boolean, speed = 0.6): void {
    const controls = this.globe.controls?.();
    if (controls) {
      controls.autoRotate = enabled;
      controls.autoRotateSpeed = speed;
    }
  }

  public toggleAutoRotate(speed = 0.6): boolean {
    const next = !this.isAutoRotating();
    this.setAutoRotate(next, speed);
    return next;
  }

  public isAutoRotating(): boolean {
    return Boolean(this.globe.controls?.()?.autoRotate);
  }
}
