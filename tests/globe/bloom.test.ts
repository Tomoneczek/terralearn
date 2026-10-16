import { describe, it, expect, vi } from 'vitest';
import { BloomController } from '@/globe/bloom';
import { FPSMonitor } from '@/globe/performance';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';

describe('Bloom Post-Processing and Performance Adaptation', () => {
  it('initializes BloomController and attaches UnrealBloomPass to composer when available', () => {
    const mockPasses: unknown[] = [];
    const mockComposer = {
      addPass: vi.fn((pass: unknown) => {
        mockPasses.push(pass);
      }),
    } as unknown as EffectComposer;

    const mockTarget = {
      postProcessingComposer: () => mockComposer,
    };

    const controller = new BloomController(mockTarget, {
      strength: 0.8,
      radius: 0.4,
      threshold: 0.65,
      enabled: true,
    });

    expect(mockComposer.addPass).toHaveBeenCalled();
    expect(controller.isEnabled()).toBe(true);
    expect(controller.getPass()).toBeDefined();

    controller.setEnabled(false);
    expect(controller.isEnabled()).toBe(false);
    expect(controller.getPass()?.enabled).toBe(false);
  });

  it('handles non-WebGL targets gracefully without throwing', () => {
    const emptyTarget = {
      postProcessingComposer: () => null,
    };

    const controller = new BloomController(emptyTarget);
    expect(controller.isEnabled()).toBe(true);
    expect(controller.getPass()).toBeNull();

    // Safe toggle without error
    controller.setEnabled(false);
    expect(controller.isEnabled()).toBe(false);
  });

  it('monitors frame performance and triggers onDegrade on sustained FPS drop', () => {
    const onDegrade = vi.fn();
    const monitor = new FPSMonitor({
      minFps: 35,
      consecutiveDropsThreshold: 3,
      onDegrade,
    });

    // 1st drop
    monitor.simulateFrameSample(30);
    expect(onDegrade).not.toHaveBeenCalled();

    // 2nd drop
    monitor.simulateFrameSample(28);
    expect(onDegrade).not.toHaveBeenCalled();

    // FPS recovers -> resets consecutive drop counter
    monitor.simulateFrameSample(60);
    expect(onDegrade).not.toHaveBeenCalled();

    // Now 3 consecutive drops
    monitor.simulateFrameSample(25);
    monitor.simulateFrameSample(22);
    monitor.simulateFrameSample(20);

    expect(onDegrade).toHaveBeenCalledTimes(1);
    expect(monitor.getFps()).toBe(20);
  });

  it('automatically degrades and disables bloom when FPS drops below threshold', () => {
    const mockComposer = {
      addPass: vi.fn(),
    } as unknown as EffectComposer;
    const mockTarget = {
      postProcessingComposer: () => mockComposer,
    };

    const monitor = new FPSMonitor({ minFps: 35 });
    const controller = new BloomController(mockTarget, { enabled: true }, monitor);

    expect(controller.isEnabled()).toBe(true);

    // Simulate sustained FPS drop
    monitor.simulateFrameSample(25);
    expect(controller.isEnabled()).toBe(false);
  });
});
