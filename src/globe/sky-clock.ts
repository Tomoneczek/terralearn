/**
 * Single source of time for everything in the sky (Sun, Moon, eclipses).
 *
 * Normally it runs on real time and ticks every minute. For demos and verification it can be
 * shifted by an offset or frozen at a fixed instant (dev panel / `?time=` in dev mode); a user
 * facing time slider can build on the same API.
 */
export interface SkyClockOptions {
  tickIntervalMs?: number;
  /** Source of real time; injectable for tests. */
  realNow?: () => number;
}

export class SkyClock {
  private readonly realNow: () => number;
  private readonly listeners = new Set<(date: Date) => void>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private offsetMs = 0;
  private fixedTimeMs: number | null = null;

  constructor(options: SkyClockOptions = {}) {
    this.realNow = options.realNow ?? (() => Date.now());
    const intervalMs = options.tickIntervalMs ?? 60_000;
    this.intervalId = setInterval(() => this.tick(), intervalMs);
  }

  /** Current sky time: the fixed instant if set, otherwise real time plus the offset. */
  public now(): Date {
    return new Date((this.fixedTimeMs ?? this.realNow()) + this.offsetMs);
  }

  public getOffsetMs(): number {
    return this.offsetMs;
  }

  public setOffsetMs(offsetMs: number): void {
    this.offsetMs = offsetMs;
    this.tick();
  }

  public getFixedTime(): Date | null {
    return this.fixedTimeMs === null ? null : new Date(this.fixedTimeMs);
  }

  /** Freezes the sky at `date` (offset still applies); `null` returns to real time. */
  public setFixedTime(date: Date | null): void {
    this.fixedTimeMs = date ? date.getTime() : null;
    this.tick();
  }

  public onTick(listener: (date: Date) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notifies listeners with the current sky time. */
  public tick(): void {
    const date = this.now();
    for (const listener of this.listeners) listener(date);
  }

  public destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.listeners.clear();
  }
}

/**
 * Parses the dev-only `?time=` parameter (any ISO 8601 instant, e.g. `2026-08-12T17:46:00Z`).
 * Returns `null` when absent or invalid.
 */
export function parseSkyTimeParam(search: string): Date | null {
  const value = new URLSearchParams(search).get('time');
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}
