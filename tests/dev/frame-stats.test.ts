import { describe, it, expect } from 'vitest';
import { FrameStats, summarizeFrames } from '@/dev/frame-stats';

describe('summarizeFrames', () => {
  it('returns null without samples', () => {
    expect(summarizeFrames([])).toBeNull();
  });

  it('computes average, p95 and max', () => {
    const deltas = [...Array.from({ length: 19 }, () => 10), 100];
    const s = summarizeFrames(deltas)!;
    expect(s.frames).toBe(20);
    expect(s.avgMs).toBeCloseTo(14.5, 6);
    expect(s.maxMs).toBe(100);
    // 95th percentile of 20 samples is the 19th value, still the "fast" frame
    expect(s.p95Ms).toBe(10);
  });

  it('reports the slow tail in p95 when slow frames are frequent', () => {
    const deltas = [
      ...Array.from({ length: 90 }, () => 16),
      ...Array.from({ length: 10 }, () => 80),
    ];
    expect(summarizeFrames(deltas)!.p95Ms).toBe(80);
  });
});

describe('FrameStats', () => {
  it('derives frame deltas from consecutive timestamps', () => {
    const stats = new FrameStats(5000);
    stats.record(1000);
    expect(stats.getSummary()).toBeNull();
    stats.record(1016);
    stats.record(1050);
    const s = stats.getSummary()!;
    expect(s.frames).toBe(2);
    expect(s.maxMs).toBe(34);
  });

  it('drops samples older than the window', () => {
    const stats = new FrameStats(1000);
    stats.record(0);
    stats.record(500); // 500 ms frame
    stats.record(516);
    stats.record(2000); // window cut-off at 1000: the first two samples fall out
    const s = stats.getSummary()!;
    expect(s.frames).toBe(1);
    expect(s.maxMs).toBe(1484);
  });

  it('start/stop are safe to repeat and clear the samples', () => {
    const stats = new FrameStats();
    stats.start();
    stats.start();
    stats.record(0);
    stats.record(16);
    stats.stop();
    stats.stop();
    expect(stats.getSummary()).toBeNull();
  });
});
