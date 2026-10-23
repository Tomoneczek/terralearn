import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DevPanel, type DevStats } from '@/dev/dev-panel';
import { clearDevParams, registerDevParam, getDevParam } from '@/dev/dev-params';

const STATS: DevStats = { fps: 58, tier: 'high', drawCalls: 120, altitude: 1.5 };

describe('DevPanel', () => {
  let container: HTMLElement;
  let value: number;

  beforeEach(() => {
    vi.useFakeTimers();
    clearDevParams();
    container = document.createElement('div');
    document.body.appendChild(container);
    value = 0.5;
    registerDevParam({
      id: 'x.y',
      label: 'Radius',
      group: 'Group A',
      min: 0,
      max: 1,
      step: 0.01,
      get: () => value,
      set: v => {
        value = v;
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    container.remove();
  });

  it('renders a slider per registered param and applies changes live', () => {
    const panel = new DevPanel({ container, stats: () => STATS });
    const input = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(input.getAttribute('aria-label')).toBe('Radius');
    expect(container.querySelector('h3')?.textContent).toBe('Group A');

    input.value = '0.8';
    input.dispatchEvent(new Event('input'));
    expect(value).toBe(0.8);
    expect(container.querySelector('output')?.textContent).toBe('0.80');
    panel.destroy();
  });

  it('shows live stats and refreshes them on an interval', () => {
    let fps = 58;
    const panel = new DevPanel({ container, stats: () => ({ ...STATS, fps }), refreshMs: 100 });
    const statsEl = container.querySelector('.tl-dev-stats')!;
    expect(statsEl.textContent).toContain('FPS 58');
    expect(statsEl.textContent).toContain('tier high');
    expect(statsEl.textContent).toContain('draw calls 120');

    fps = 30;
    vi.advanceTimersByTime(100);
    expect(statsEl.textContent).toContain('FPS 30');
    panel.destroy();
  });

  it('shows the rolling frame-time summary when provided', () => {
    const panel = new DevPanel({
      container,
      stats: () => ({ ...STATS, frame: { avgMs: 16.7, p95Ms: 21.3, maxMs: 80, frames: 300 } }),
    });
    const text = container.querySelector('.tl-dev-stats')?.textContent ?? '';
    expect(text).toContain('frame avg 16.7 / p95 21.3 / max 80.0 ms');
    panel.destroy();
  });

  it('omits the frame summary when not sampled', () => {
    const panel = new DevPanel({ container, stats: () => STATS });
    expect(container.querySelector('.tl-dev-stats')?.textContent).not.toContain('frame avg');
    panel.destroy();
  });

  it('shows n/a when a stat is unavailable', () => {
    const panel = new DevPanel({
      container,
      stats: () => ({ ...STATS, drawCalls: null, altitude: null }),
    });
    expect(container.querySelector('.tl-dev-stats')?.textContent).toContain('draw calls n/a');
    panel.destroy();
  });

  it('Reset restores defaults and updates the slider', () => {
    const panel = new DevPanel({ container, stats: () => STATS });
    const input = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    input.value = '0.9';
    input.dispatchEvent(new Event('input'));
    expect(getDevParam('x.y')).toBe(0.9);

    const reset = [...container.querySelectorAll('button')].find(b => b.textContent === 'Reset')!;
    reset.click();
    expect(value).toBe(0.5);
    expect(input.value).toBe('0.5');
    panel.destroy();
  });

  it('Copy JSON writes current values to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const panel = new DevPanel({ container, stats: () => STATS });
    const copy = [...container.querySelectorAll('button')].find(
      b => b.textContent === 'Copy JSON',
    )!;
    copy.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ 'x.y': 0.5 }, null, 2));
    vi.unstubAllGlobals();
    panel.destroy();
  });

  it('destroy removes the element, stops the timer and runs hooks', () => {
    const stats = vi.fn(() => STATS);
    const hook = vi.fn();
    const panel = new DevPanel({ container, stats, refreshMs: 100 });
    panel.onDestroy(hook);
    const calls = stats.mock.calls.length;

    panel.destroy();
    vi.advanceTimersByTime(1000);
    expect(container.querySelector('.tl-dev-panel')).toBeNull();
    expect(stats.mock.calls.length).toBe(calls);
    expect(hook).toHaveBeenCalledTimes(1);
  });
});
