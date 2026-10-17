import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initOfflineMonitor } from '@/pwa/monitor';
import * as toastModule from '@/ui/toast';

describe('G11-03 PWA Offline Monitor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('displays toast on offline event and triggers callback', () => {
    const showToastSpy = vi
      .spyOn(toastModule, 'showToast')
      .mockImplementation(() => document.createElement('div'));
    const onOffline = vi.fn();

    const cleanup = initOfflineMonitor({ onOffline, showToasts: true });

    window.dispatchEvent(new Event('offline'));

    expect(showToastSpy).toHaveBeenCalledWith(
      expect.stringContaining('offline'),
      'info',
      expect.any(Number),
    );
    expect(onOffline).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('displays toast on online event and triggers callback', () => {
    const showToastSpy = vi
      .spyOn(toastModule, 'showToast')
      .mockImplementation(() => document.createElement('div'));
    const onOnline = vi.fn();

    const cleanup = initOfflineMonitor({ onOnline, showToasts: true });

    window.dispatchEvent(new Event('online'));

    expect(showToastSpy).toHaveBeenCalledWith(
      expect.stringContaining('przywrócone'),
      'success',
      expect.any(Number),
    );
    expect(onOnline).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('cleanup unsubscribes from window events', () => {
    const showToastSpy = vi
      .spyOn(toastModule, 'showToast')
      .mockImplementation(() => document.createElement('div'));
    const onOffline = vi.fn();

    const cleanup = initOfflineMonitor({ onOffline });
    cleanup();

    window.dispatchEvent(new Event('offline'));
    expect(onOffline).not.toHaveBeenCalled();
    expect(showToastSpy).not.toHaveBeenCalled();
  });
});
