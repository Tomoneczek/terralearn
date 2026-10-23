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

    it('ignores drops during warmup period to prevent startup stutter degradation', () => {
      const onDegrade = vi.fn();
      const monitor = new FPSMonitor({
        minFps: 40,
        consecutiveDropsThreshold: 2,
        warmupPeriodMs: 5000,
        onDegrade,
      });

      // Drops with isWarmup=true must be ignored
      monitor.simulateFrameSample(15, { isWarmup: true });
      monitor.simulateFrameSample(18, { isWarmup: true });
      monitor.simulateFrameSample(12, { isWarmup: true });
      expect(onDegrade).not.toHaveBeenCalled();

      // Once warmup finishes, consecutive drops trigger degrade
      monitor.simulateFrameSample(15, { isWarmup: false });
      expect(onDegrade).not.toHaveBeenCalled();
      monitor.simulateFrameSample(15, { isWarmup: false });
      expect(onDegrade).toHaveBeenCalledTimes(1);
    });

    it('triggers upgrade callback when FPS is consistently high', () => {
      const onUpgrade = vi.fn();
      const monitor = new FPSMonitor({
        highFpsThreshold: 50,
        consecutiveHighThreshold: 3,
        onUpgrade,
      });

      monitor.simulateFrameSample(55);
      monitor.simulateFrameSample(58);
      expect(onUpgrade).not.toHaveBeenCalled();

      monitor.simulateFrameSample(60);
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it('defaults to conservative minFps 22 and does not degrade at standard 28-30 FPS', () => {
      const onDegrade = vi.fn();
      const monitor = new FPSMonitor({ onDegrade });

      expect(monitor.minFps).toBe(22);

      // Simulate 10 samples of 28 FPS (smooth interactive WebGL frame rate)
      for (let i = 0; i < 10; i++) {
        monitor.simulateFrameSample(28);
      }

      // Must never trigger degradation on 28 FPS
      expect(onDegrade).not.toHaveBeenCalled();
    });

    it('triggers degrade on sustained severe drop (< 22 FPS for 6 samples)', () => {
      const onDegrade = vi.fn();
      const monitor = new FPSMonitor({ onDegrade });

      // 5 drops (< 6 threshold)
      for (let i = 0; i < 5; i++) {
        monitor.simulateFrameSample(18);
      }
      expect(onDegrade).not.toHaveBeenCalled();

      // 6th drop triggers
      monitor.simulateFrameSample(18);
      expect(onDegrade).toHaveBeenCalledTimes(1);
    });
  });

  describe('quality profiles', () => {
    // Regression guard for the bloom removal: no profile may carry a bloom switch any more.
    it('has no bloom switch in any tier', () => {
      for (const profile of Object.values(QUALITY_PROFILES)) {
        expect('enableBloom' in profile).toBe(false);
      }
    });
  });

  describe('QualityController', () => {
    let mockTargets: {
      clouds: { setVisible: ReturnType<typeof vi.fn>; isVisible: ReturnType<typeof vi.fn> };
      atmosphere: { setVisible: ReturnType<typeof vi.fn>; isVisible: ReturnType<typeof vi.fn> };
      setPixelRatio: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockTargets = {
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
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(true);
      expect(mockTargets.atmosphere.setVisible).toHaveBeenCalledWith(true);

      // 2. Medium preset
      store.set({ ...store.get(), quality: 'medium', clouds: true });
      expect(controller.getActiveTier()).toBe('medium');
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(true);

      // 3. Low preset
      store.set({ ...store.get(), quality: 'low', clouds: true });
      expect(controller.getActiveTier()).toBe('low');
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

      // Trigger 2nd FPS degradation -> low
      controller.handleFpsDegrade();
      expect(controller.getActiveTier()).toBe('low');
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(false);

      // 3rd trigger stays at low (floor)
      controller.handleFpsDegrade();
      expect(controller.getActiveTier()).toBe('low');

      controller.destroy();
    });

    it('adaptively recovers quality tier when performance improves', () => {
      const store = createStore<AppState>({ ...createInitialState(), quality: 'auto' });
      const fpsMonitor = new FPSMonitor();
      const controller = new QualityController(
        store,
        mockTargets as unknown as QualityTargets,
        fpsMonitor,
      );

      // Force to low
      controller.handleFpsDegrade();
      controller.handleFpsDegrade();
      expect(controller.getActiveTier()).toBe('low');
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(false);

      // Upgrade 1: low -> medium (clouds restored!)
      controller.handleFpsUpgrade();
      expect(controller.getActiveTier()).toBe('medium');
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(true);

      // Upgrade 2: medium -> high
      controller.handleFpsUpgrade();
      expect(controller.getActiveTier()).toBe('high');

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
      expect(mockTargets.clouds.setVisible).toHaveBeenLastCalledWith(true);

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

    it('maintains high quality tier with clouds active at 28-30 FPS', () => {
      const store = createStore<AppState>({ ...createInitialState(), quality: 'auto' });
      const fpsMonitor = new FPSMonitor();
      const controller = new QualityController(
        store,
        mockTargets as unknown as QualityTargets,
        fpsMonitor,
      );

      expect(controller.getActiveTier()).toBe('high');
      expect(mockTargets.clouds.setVisible).toHaveBeenCalledWith(true);

      // Simulate 10 samples of standard 28 FPS WebGL rendering
      for (let i = 0; i < 10; i++) {
        fpsMonitor.simulateFrameSample(28);
      }

      // Remains high, clouds remain untouched
      expect(controller.getActiveTier()).toBe('high');

      controller.destroy();
    });
  });
});
