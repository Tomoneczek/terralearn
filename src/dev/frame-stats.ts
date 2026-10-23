export interface FrameSummary {
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  frames: number;
}

interface Sample {
  at: number;
  delta: number;
}

/** Summarizes frame durations (ms): average, 95th percentile and worst frame. */
export function summarizeFrames(deltas: readonly number[]): FrameSummary | null {
  if (deltas.length === 0) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, d) => acc + d, 0);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    avgMs: sum / sorted.length,
    p95Ms: sorted[p95Index] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    frames: sorted.length,
  };
}

/**
 * Rolling frame-time sampler (own rAF loop, so it measures what the browser actually presents,
 * independent of FPSMonitor's 1 s averaging). Dev tooling only.
 */
export class FrameStats {
  private samples: Sample[] = [];
  private last: number | null = null;
  private rafId: number | null = null;

  constructor(private readonly windowMs = 5000) {}

  /** Records one frame ending at `at` (ms); drops samples older than the window. */
  public record(at: number): void {
    if (this.last !== null) {
      this.samples.push({ at, delta: at - this.last });
    }
    this.last = at;
    const cutoff = at - this.windowMs;
    while (this.samples.length > 0 && (this.samples[0] as Sample).at < cutoff) {
      this.samples.shift();
    }
  }

  public getSummary(): FrameSummary | null {
    return summarizeFrames(this.samples.map(s => s.delta));
  }

  public start(): void {
    if (this.rafId !== null || typeof requestAnimationFrame === 'undefined') return;
    const loop = (timestamp: number): void => {
      this.record(timestamp);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  public stop(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.last = null;
    this.samples = [];
  }
}
