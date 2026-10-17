import type { Store, AppState } from '@/state/types';
import type { BloomController } from './bloom';
import type { CloudsController } from './clouds';
import type { AtmosphereController } from './atmosphere';

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualityProfile {
  name: QualityTier;
  dprMax: number;
  enableBloom: boolean;
  enableClouds: boolean;
  enableAtmosphere: boolean;
}

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    name: 'low',
    dprMax: 1.0,
    enableBloom: false,
    enableClouds: false,
    enableAtmosphere: true,
  },
  medium: {
    name: 'medium',
    dprMax: 1.5,
    enableBloom: false,
    enableClouds: true,
    enableAtmosphere: true,
  },
  high: {
    name: 'high',
    dprMax: 2.0,
    enableBloom: true,
    enableClouds: true,
    enableAtmosphere: true,
  },
};

export interface QualityTargets {
  bloom?: BloomController | null;
  clouds?: CloudsController | null;
  atmosphere?: AtmosphereController | null;
  setPixelRatio?: (ratio: number) => void;
}

export interface FPSMonitorOptions {
  minFps?: number;
  sampleIntervalMs?: number;
  consecutiveDropsThreshold?: number;
  warmupPeriodMs?: number;
  highFpsThreshold?: number;
  consecutiveHighThreshold?: number;
  onDegrade?: () => void;
  onUpgrade?: () => void;
}

export class FPSMonitor {
  public readonly minFps: number;
  private readonly sampleIntervalMs: number;
  private readonly consecutiveDropsThreshold: number;
  private readonly warmupPeriodMs: number;
  private readonly highFpsThreshold: number;
  private readonly consecutiveHighThreshold: number;
  public onDegrade?: () => void;
  public onUpgrade?: () => void;

  private isRunning = false;
  private frameCount = 0;
  private lastSampleTime = 0;
  private startTime = 0;
  private currentFps = 60;
  private consecutiveLowFpsCount = 0;
  private consecutiveHighFpsCount = 0;
  private rafId: number | null = null;

  constructor(options: FPSMonitorOptions = {}) {
    this.minFps = options.minFps ?? 22;
    this.sampleIntervalMs = options.sampleIntervalMs ?? 1000;
    this.consecutiveDropsThreshold = options.consecutiveDropsThreshold ?? 6;
    this.warmupPeriodMs = options.warmupPeriodMs ?? 5000;
    this.highFpsThreshold = options.highFpsThreshold ?? 48;
    this.consecutiveHighThreshold = options.consecutiveHighThreshold ?? 5;
    this.onDegrade = options.onDegrade;
    this.onUpgrade = options.onUpgrade;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.frameCount = 0;
    const now = performance.now();
    this.startTime = now;
    this.lastSampleTime = now;
    this.consecutiveLowFpsCount = 0;
    this.consecutiveHighFpsCount = 0;

    const loop = (timestamp: number): void => {
      if (!this.isRunning) return;

      // Skip measurement when tab is hidden or minimized (browser throttles rAF to 1 FPS)
      if (typeof document !== 'undefined' && document.hidden) {
        this.lastSampleTime = timestamp;
        this.frameCount = 0;
        this.rafId = requestAnimationFrame(loop);
        return;
      }

      this.frameCount++;
      const elapsed = timestamp - this.lastSampleTime;

      if (elapsed >= this.sampleIntervalMs) {
        this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
        this.frameCount = 0;
        this.lastSampleTime = timestamp;

        const isWarmingUp = timestamp - this.startTime < this.warmupPeriodMs;

        if (isWarmingUp) {
          // Warmup grace period: ignore startup drops from shader compilation & data loading
          this.consecutiveLowFpsCount = 0;
          this.consecutiveHighFpsCount = 0;
        } else if (this.currentFps < this.minFps) {
          this.consecutiveLowFpsCount++;
          this.consecutiveHighFpsCount = 0;
          if (this.consecutiveLowFpsCount >= this.consecutiveDropsThreshold) {
            this.onDegrade?.();
            this.consecutiveLowFpsCount = 0; // Reset after trigger
          }
        } else if (this.currentFps >= this.highFpsThreshold) {
          this.consecutiveHighFpsCount++;
          this.consecutiveLowFpsCount = 0;
          if (this.consecutiveHighFpsCount >= this.consecutiveHighThreshold) {
            this.onUpgrade?.();
            this.consecutiveHighFpsCount = 0;
          }
        } else {
          this.consecutiveLowFpsCount = 0;
          this.consecutiveHighFpsCount = 0;
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public getFps(): number {
    return this.currentFps;
  }

  public simulateFrameSample(fps: number, options: { isWarmup?: boolean } = {}): void {
    this.currentFps = fps;
    if (options.isWarmup) {
      this.consecutiveLowFpsCount = 0;
      this.consecutiveHighFpsCount = 0;
      return;
    }

    if (fps < this.minFps) {
      this.consecutiveLowFpsCount++;
      this.consecutiveHighFpsCount = 0;
      if (this.consecutiveLowFpsCount >= this.consecutiveDropsThreshold) {
        this.onDegrade?.();
        this.consecutiveLowFpsCount = 0;
      }
    } else if (fps >= this.highFpsThreshold) {
      this.consecutiveHighFpsCount++;
      this.consecutiveLowFpsCount = 0;
      if (this.consecutiveHighFpsCount >= this.consecutiveHighThreshold) {
        this.onUpgrade?.();
        this.consecutiveHighFpsCount = 0;
      }
    } else {
      this.consecutiveLowFpsCount = 0;
      this.consecutiveHighFpsCount = 0;
    }
  }
}

/**
 * Manages 3D rendering quality presets and adaptive performance budgets:
 * - 'low': 1.0 DPR, bloom & clouds disabled, lightweight rendering for weak GPUs.
 * - 'medium': 1.5 DPR, clouds & atmosphere enabled, bloom off, stable >= 50 FPS.
 * - 'high': Native DPR (up to 2.0), bloom, 3D clouds, and atmospheric glow.
 * - 'auto': Dynamically degrades preset when FPS drops below threshold, with warmup grace period.
 */
export class QualityController {
  private readonly store: Store<AppState>;
  private readonly targets: QualityTargets;
  private readonly fpsMonitor: FPSMonitor;
  private currentTier: QualityTier = 'high';
  private unsubscribe: (() => void) | null = null;

  constructor(store: Store<AppState>, targets: QualityTargets, fpsMonitor: FPSMonitor) {
    this.store = store;
    this.targets = targets;
    this.fpsMonitor = fpsMonitor;

    const isMobile =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse) and (max-width: 768px)').matches;
    this.currentTier = isMobile ? 'medium' : 'high';

    // Hook FPS degradation and upgrade in auto mode
    const prevDegrade = this.fpsMonitor.onDegrade;
    this.fpsMonitor.onDegrade = () => {
      prevDegrade?.();
      this.handleFpsDegrade();
    };

    const prevUpgrade = this.fpsMonitor.onUpgrade;
    this.fpsMonitor.onUpgrade = () => {
      prevUpgrade?.();
      this.handleFpsUpgrade();
    };

    this.bindStore();
    this.applyCurrentPreset();
  }

  public getActiveTier(): QualityTier {
    const preset = this.store.get().quality;
    return preset === 'auto' ? this.currentTier : preset;
  }

  public getProfile(): QualityProfile {
    return QUALITY_PROFILES[this.getActiveTier()];
  }

  public handleFpsDegrade(): void {
    const preset = this.store.get().quality;
    if (preset !== 'auto') {
      return; // Do not override explicit user setting
    }

    if (this.currentTier === 'high') {
      this.currentTier = 'medium';
      this.applyCurrentPreset();
    } else if (this.currentTier === 'medium') {
      this.currentTier = 'low';
      this.applyCurrentPreset();
    }
  }

  public handleFpsUpgrade(): void {
    const preset = this.store.get().quality;
    if (preset !== 'auto') {
      return;
    }

    if (this.currentTier === 'low') {
      this.currentTier = 'medium';
      this.applyCurrentPreset();
    } else if (this.currentTier === 'medium') {
      const isMobile =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse) and (max-width: 768px)').matches;
      if (!isMobile) {
        this.currentTier = 'high';
        this.applyCurrentPreset();
      }
    }
  }

  public applyCurrentPreset(): void {
    const profile = this.getProfile();
    const state = this.store.get();

    // 1. Bloom post-processing
    this.targets.bloom?.setEnabled(profile.enableBloom);

    // 2. 3D Clouds (respects both quality profile and user toggle)
    const cloudsVisible = profile.enableClouds && state.clouds;
    this.targets.clouds?.setVisible(cloudsVisible);

    // 3. Atmosphere shell
    this.targets.atmosphere?.setVisible(profile.enableAtmosphere);

    // 4. Renderer Device Pixel Ratio clamp
    if (this.targets.setPixelRatio && typeof window !== 'undefined') {
      const nativeDpr = window.devicePixelRatio || 1;
      const targetDpr = Math.min(nativeDpr, profile.dprMax);
      this.targets.setPixelRatio(targetDpr);
    }
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => ({
        quality: s.quality,
        clouds: s.clouds,
      }),
      () => {
        this.applyCurrentPreset();
      },
      (a, b) => a.quality === b.quality && a.clouds === b.clouds,
    );
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
