import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProgressiveTextureLoader } from '@/globe/texture-loader';
import type { Texture, TextureLoader } from 'three';

describe('ProgressiveTextureLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads low-res texture synchronously and returns it', () => {
    const mockLowTexture = { id: 'low-res', dispose: vi.fn() } as unknown as Texture;
    const mockLoader = {
      load: vi.fn(() => mockLowTexture),
    } as unknown as TextureLoader;

    const loader = new ProgressiveTextureLoader(mockLoader);
    const result = loader.load({ lowResUrl: '/textures/earth-day.jpg' });

    expect(result).toBe(mockLowTexture);
    expect(loader.getCurrentTexture()).toBe(mockLowTexture);
    expect(mockLoader.load).toHaveBeenCalledWith(
      expect.stringContaining('/textures/earth-day.jpg'),
    );

    loader.dispose();
    expect(mockLowTexture.dispose).toHaveBeenCalled();
  });

  it('asynchronously upgrades to high-res texture and calls onUpdate callback', () => {
    const mockLowTexture = { id: 'low-res', dispose: vi.fn() } as unknown as Texture;
    const mockHighTexture = { id: 'high-res', dispose: vi.fn() } as unknown as Texture;

    let onLoadHighCallback: ((t: Texture) => void) | undefined;

    const mockLoader = {
      load: vi.fn((url: string, onLoad?: (t: Texture) => void) => {
        if (url.includes('4k')) {
          onLoadHighCallback = onLoad;
          return mockHighTexture;
        }
        return mockLowTexture;
      }),
    } as unknown as TextureLoader;

    const onUpdate = vi.fn();
    const loader = new ProgressiveTextureLoader(mockLoader);

    loader.load({
      lowResUrl: '/textures/earth-day.jpg',
      highResUrl: '/textures/earth-day-4k.jpg',
      onUpdate,
    });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(loader.getCurrentTexture()).toBe(mockLowTexture);

    // Simulate async high-res load completion
    expect(onLoadHighCallback).toBeDefined();
    onLoadHighCallback!(mockHighTexture);

    expect(onUpdate).toHaveBeenCalledWith(mockHighTexture);
    expect(loader.getCurrentTexture()).toBe(mockHighTexture);

    loader.dispose();
    expect(mockLowTexture.dispose).toHaveBeenCalled();
    expect(mockHighTexture.dispose).toHaveBeenCalled();
  });

  it('gracefully handles high-res load failure and retains low-res texture', () => {
    const mockLowTexture = { id: 'low-res', dispose: vi.fn() } as unknown as Texture;
    let onErrorCallback: ((err: unknown) => void) | undefined;

    const mockLoader = {
      load: vi.fn(
        (
          url: string,
          _onLoad?: unknown,
          _onProgress?: unknown,
          onError?: (err: unknown) => void,
        ) => {
          if (url.includes('4k')) {
            onErrorCallback = onError;
          }
          return mockLowTexture;
        },
      ),
    } as unknown as TextureLoader;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onUpdate = vi.fn();

    const loader = new ProgressiveTextureLoader(mockLoader);
    loader.load({
      lowResUrl: '/textures/earth-day.jpg',
      highResUrl: '/textures/earth-day-4k.jpg',
      onUpdate,
    });

    // Simulate network error on high-res asset
    onErrorCallback!(new Error('Network 404'));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(loader.getCurrentTexture()).toBe(mockLowTexture);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ProgressiveTextureLoader]'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
    loader.dispose();
  });
});
