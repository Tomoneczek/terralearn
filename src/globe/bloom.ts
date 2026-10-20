import { Vector2 } from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { FPSMonitor } from './performance';

export interface BloomOptions {
  strength?: number;
  radius?: number;
  threshold?: number;
  enabled?: boolean;
}

export interface BloomTarget {
  postProcessingComposer?: () => EffectComposer | null;
}

export class BloomController {
  private readonly pass: UnrealBloomPass | null = null;
  private isBloomEnabled = true;

  constructor(target: BloomTarget, options: BloomOptions = {}, monitor?: FPSMonitor) {
    this.isBloomEnabled = options.enabled ?? true;

    try {
      const composer = target.postProcessingComposer ? target.postProcessingComposer() : null;
      if (composer) {
        const resolution = new Vector2(window.innerWidth || 1024, window.innerHeight || 768);
        const strength = options.strength ?? 0.25;
        const radius = options.radius ?? 0.35;
        const threshold = options.threshold ?? 0.88;

        this.pass = new UnrealBloomPass(resolution, strength, radius, threshold);
        this.pass.enabled = this.isBloomEnabled;
        composer.addPass(this.pass);
      }
    } catch {
      // In non-WebGL test environments, composer may not be available
      this.pass = null;
    }

    if (monitor) {
      // Hook graceful degradation into the monitor's real degrade signal (fired by the
      // rAF sampling loop and by simulateFrameSample), chaining any existing handler.
      const prevDegrade = monitor.onDegrade;
      monitor.onDegrade = () => {
        prevDegrade?.();
        if (this.isBloomEnabled) {
          this.setEnabled(false);
        }
      };
    }
  }

  public setEnabled(enabled: boolean): void {
    this.isBloomEnabled = enabled;
    if (this.pass) {
      this.pass.enabled = enabled;
    }
  }

  public isEnabled(): boolean {
    return this.isBloomEnabled;
  }

  public getPass(): UnrealBloomPass | null {
    return this.pass;
  }
}
