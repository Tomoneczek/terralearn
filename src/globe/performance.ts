export interface FPSMonitorOptions {
  minFps?: number;
  sampleIntervalMs?: number;
  consecutiveDropsThreshold?: number;
  onDegrade?: () => void;
}

export class FPSMonitor {
  private readonly minFps: number;
  private readonly sampleIntervalMs: number;
  private readonly consecutiveDropsThreshold: number;
  private readonly onDegrade?: () => void;

  private isRunning = false;
  private frameCount = 0;
  private lastSampleTime = 0;
  private currentFps = 60;
  private consecutiveLowFpsCount = 0;
  private rafId: number | null = null;

  constructor(options: FPSMonitorOptions = {}) {
    this.minFps = options.minFps ?? 35;
    this.sampleIntervalMs = options.sampleIntervalMs ?? 1000;
    this.consecutiveDropsThreshold = options.consecutiveDropsThreshold ?? 3;
    this.onDegrade = options.onDegrade;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.frameCount = 0;
    this.lastSampleTime = performance.now();
    this.consecutiveLowFpsCount = 0;

    const loop = (now: number): void => {
      if (!this.isRunning) return;
      this.frameCount++;
      const elapsed = now - this.lastSampleTime;

      if (elapsed >= this.sampleIntervalMs) {
        this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
        this.frameCount = 0;
        this.lastSampleTime = now;

        if (this.currentFps < this.minFps) {
          this.consecutiveLowFpsCount++;
          if (this.consecutiveLowFpsCount >= this.consecutiveDropsThreshold) {
            this.onDegrade?.();
            this.consecutiveLowFpsCount = 0; // Reset after trigger
          }
        } else {
          this.consecutiveLowFpsCount = 0;
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

  public simulateFrameSample(fps: number): void {
    this.currentFps = fps;
    if (fps < this.minFps) {
      this.consecutiveLowFpsCount++;
      if (this.consecutiveLowFpsCount >= this.consecutiveDropsThreshold) {
        this.onDegrade?.();
        this.consecutiveLowFpsCount = 0;
      }
    } else {
      this.consecutiveLowFpsCount = 0;
    }
  }
}
