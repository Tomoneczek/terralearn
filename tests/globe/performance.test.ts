import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import {
  FPSMonitor,
  QualityController,
  QUALITY_PROFILES,
  type QualityTargets,
} from '@/globe/performance';

describe('performance module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('FPSMonitor', () => {
    it('initializes and triggers degrade callback after consecutive drops', () => {
      const onDegrade = vi.fn();
      const monitor = new FPSMonitor({
        minFps: 40,
        sampleIntervalMs: 500,
        consecutiveDropsThreshold: 3,
        onDegrade,
      });

      // Sample 1: 20 fps (< 40)
      monitor.simulateFrameSample(20);
      expect(monitor.getFps()).toBe(20);
      expect(onDegrade).not.toHaveBeenCalled();

      // Sample 2: 25 fps (< 40)
      monitor.simulateFrameSample(25);
      expect(onDegrade).not.toHaveBeenCalled();

      // Sample 3: 15 fps (< 40) -> 3rd consecutive drop triggers degrade
      monitor.simulateFrameSample(15);
      expect(onDegrade).toHaveBeenCalledTimes(1);
    });

    it('resets drop count if FPS recovers', () => {
      const onDegrade = vi.fn();
      const monitor = new FPSMonitor({
        minFps: 40,
        sampleIntervalMs: 500,
        consecutiveDropsThreshold: 2,
        onDegrade,
      });

      // Sample 1: Drop (20 fps)
      monitor.simulateFrameSample(20);
      expect(onDegrade).not.toHaveBeenCalled();

      // Sample 2: Recovery (60 fps)
      monitor.simulateFrameSample(60);
      expect(onDegrade).not.toHaveBeenCalled();

      // Sample 3: Drop (20 fps) -> counter was reset, so 1st drop
      monitor.simulateFrameSample(20);
      expect(onDegrade).not.toHaveBeenCalled();

      // Sample 4: Drop (20 fps) -> 2nd consecutive drop -> triggers
      monitor.simulateFrameSample(20);
      expect(onDegrade).toHaveBeenCalledTimes(1);
    });

    it('supports start and stop lifecycle', () => {
      const monitor = new FPSMonitor();
      monitor.start();
      // starting again is a no-op
      monitor.start();
      monitor.stop();
    });
  });

  describe('QualityController', () => {
    let mockTargets: {
      bloom: { setEnabled: ReturnType<typeof vi.fn>; isEnabled: ReturnType<typeof vi.fn> };
      clouds: { setVisible: ReturnType<typeof vi.fn>; isVisible: ReturnType<typeof vi.fn> };
      atmosphere: { setVisible: ReturnType<typeof vi.fn>; isVisible: ReturnType<typeof vi.fn> };
      setPixelRatio: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockTargets = {
        bloom: { setEnabled: vi.fn(), isEnabled: vi.fn().mockReturnValue(true) },
        clouds: { setVisible: vi.fn(), isVisible: vi.fn().mockReturnValue(true) },
        atmosphere: { setVisible: vi.fn(), isVisible: vi.fn().mockReturnValue(true) },
        setPixelRatio: vi.fn(),
      };
    });

    it('applies profiles according to quality presets', () => {
      const store = createStore<AppState>(createInitialState());
      const fpsMonitor = new FPSMonitor();
      const controller = new QualityController(
        store,
        mockTargets as unknown as QualityTargets,
        fpsMonitor,
      );

      // 1. High preset
      store.set({ ...store.get(), quality: 'high', clouds: true });
      expect(controller.getActiveTier()).toBe('high');
      expect(mockTargets.bloom.setEnabled).toHaveBeenCalledWith(true);
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(true);
      expect(mockTargets.atmosphere.setVisible).toHaveBeenCalledWith(true);

      // 2. Medium preset
      store.set({ ...store.get(), quality: 'medium', clouds: true });
      expect(controller.getActiveTier()).toBe('medium');
      expect(mockTargets.bloom.setEnabled).toHaveBeenCalledWith(false);
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(true);

      // 3. Low preset
      store.set({ ...store.get(), quality: 'low', clouds: true });
      expect(controller.getActiveTier()).toBe('low');
      expect(mockTargets.bloom.setEnabled).toHaveBeenCalledWith(false);
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(false);

      controller.destroy();
    });

    it('respects user clouds toggle when quality tier allows clouds', () => {
      const store = createStore<AppState>(createInitialState());
      const fpsMonitor = new FPSMonitor();
      const controller = new QualityController(
        store,
        mockTargets as unknown as QualityTargets,
        fpsMonitor,
      );

      // Even on 'high', if user turns off clouds, clouds should be hidden
      store.set({ ...store.get(), quality: 'high', clouds: false });
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(false);

      // Turn clouds back on
      store.set({ ...store.get(), clouds: true });
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(true);

      controller.destroy();
    });

    it('adaptively degrades from high -> medium -> low in auto mode', () => {
      const store = createStore<AppState>({ ...createInitialState(), quality: 'auto' });
      const fpsMonitor = new FPSMonitor();
      const controller = new QualityController(
        store,
        mockTargets as unknown as QualityTargets,
        fpsMonitor,
      );

      expect(controller.getActiveTier()).toBe('high');

      // Trigger 1st FPS degradation -> medium
      controller.handleFpsDegrade();
      expect(controller.getActiveTier()).toBe('medium');
      expect(mockTargets.bloom.setEnabled).toHaveBeenCalledWith(false);

      // Trigger 2nd FPS degradation -> low
      controller.handleFpsDegrade();
      expect(controller.getActiveTier()).toBe('low');
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(false);

      // 3rd trigger stays at low (floor)
      controller.handleFpsDegrade();
      expect(controller.getActiveTier()).toBe('low');

      controller.destroy();
    });

    it('does not degrade if preset is explicitly configured by user', () => {
      const store = createStore<AppState>({ ...createInitialState(), quality: 'high' });
      const fpsMonitor = new FPSMonitor();
      const controller = new QualityController(
        store,
        mockTargets as unknown as QualityTargets,
        fpsMonitor,
      );

      expect(controller.getActiveTier()).toBe('high');

      // FPS drop should be ignored because quality is explicitly 'high'
      controller.handleFpsDegrade();
      expect(controller.getActiveTier()).toBe('high');
      expect(mockTargets.bloom.setEnabled).toHaveBeenLastCalledWith(true);

      controller.destroy();
    });

    it('correctly clamps pixel ratio to profile dprMax', () => {
      const store = createStore<AppState>(createInitialState());
      const fpsMonitor = new FPSMonitor();
      const controller = new QualityController(
        store,
        mockTargets as unknown as QualityTargets,
        fpsMonitor,
      );

      store.set({ ...store.get(), quality: 'low' });
      expect(mockTargets.setPixelRatio).toHaveBeenCalledWith(QUALITY_PROFILES.low.dprMax);

      controller.destroy();
    });
  });
});
