import { describe, it, expect, vi, afterEach } from 'vitest';
import { SkyClock, parseSkyTimeParam } from '@/globe/sky-clock';

const REAL = Date.UTC(2026, 9, 28, 12);

describe('SkyClock', () => {
  afterEach(() => vi.useRealTimers());

  it('runs on real time, shifted by the offset', () => {
    const clock = new SkyClock({ realNow: () => REAL });
    expect(clock.now().getTime()).toBe(REAL);
    clock.setOffsetMs(-3_600_000);
    expect(clock.now().getTime()).toBe(REAL - 3_600_000);
    clock.destroy();
  });

  it('freezes at a fixed instant and returns to real time', () => {
    const clock = new SkyClock({ realNow: () => REAL });
    const fixed = new Date(Date.UTC(2026, 7, 12, 17, 46));
    clock.setFixedTime(fixed);
    expect(clock.getFixedTime()?.getTime()).toBe(fixed.getTime());
    expect(clock.now().getTime()).toBe(fixed.getTime());
    clock.setFixedTime(null);
    expect(clock.now().getTime()).toBe(REAL);
    clock.destroy();
  });

  it('notifies listeners on every change and periodic tick, until unsubscribed or destroyed', () => {
    vi.useFakeTimers();
    const clock = new SkyClock({ realNow: () => REAL, tickIntervalMs: 1000 });
    const listener = vi.fn();
    const unsubscribe = clock.onTick(listener);

    clock.setOffsetMs(5000);
    expect(listener).toHaveBeenLastCalledWith(new Date(REAL + 5000));
    vi.advanceTimersByTime(3000);
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    clock.setOffsetMs(0);
    expect(listener).toHaveBeenCalledTimes(4);

    const other = vi.fn();
    clock.onTick(other);
    clock.destroy();
    vi.advanceTimersByTime(5000);
    expect(other).not.toHaveBeenCalled();
  });
});

describe('parseSkyTimeParam', () => {
  it('parses an ISO instant and rejects missing or invalid values', () => {
    expect(parseSkyTimeParam('?dev=true&time=2026-08-12T17:46:00Z')?.toISOString()).toBe(
      '2026-08-12T17:46:00.000Z',
    );
    expect(parseSkyTimeParam('?dev=true')).toBeNull();
    expect(parseSkyTimeParam('?time=yesterday')).toBeNull();
  });
});
