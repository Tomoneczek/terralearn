import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerServiceWorker } from '@/pwa/register';

describe('G11-03 Service Worker Registration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null if serviceWorker is not supported in navigator', async () => {
    const originalSW = (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const reg = await registerServiceWorker();
    expect(reg).toBeNull();

    Object.defineProperty(navigator, 'serviceWorker', {
      value: originalSW,
      configurable: true,
      writable: true,
    });
  });

  it('registers service worker when supported on localhost/https', async () => {
    const mockRegistration = {
      addEventListener: vi.fn(),
      installing: null,
    } as unknown as ServiceWorkerRegistration;

    const registerMock = vi.fn().mockResolvedValue(mockRegistration);

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: {
        register: registerMock,
        controller: null,
      },
      configurable: true,
      writable: true,
    });

    const reg = await registerServiceWorker({ swPath: 'sw.js' });
    expect(reg).toBe(mockRegistration);
    expect(registerMock).toHaveBeenCalled();
  });

  it('handles registration failure gracefully', async () => {
    const consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockRejectedValue(new Error('Registration failed')),
        controller: null,
      },
      configurable: true,
      writable: true,
    });

    const reg = await registerServiceWorker({ swPath: 'sw.js' });
    expect(reg).toBeNull();
    expect(consoleWarnMock).toHaveBeenCalled();

    consoleWarnMock.mockRestore();
  });

  it('triggers onUpdate callback when new worker installs and controller exists', async () => {
    let stateChangeHandler: (() => void) | null = null;
    let updateFoundHandler: (() => void) | null = null;

    const mockInstalling = {
      state: 'installed',
      addEventListener: vi.fn((event, handler) => {
        if (event === 'statechange') stateChangeHandler = handler;
      }),
    };

    const mockRegistration = {
      installing: mockInstalling,
      addEventListener: vi.fn((event, handler) => {
        if (event === 'updatefound') updateFoundHandler = handler;
      }),
    } as unknown as ServiceWorkerRegistration;

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
        controller: {}, // Existing controller active
      },
      configurable: true,
      writable: true,
    });

    const onUpdate = vi.fn();
    const onSuccess = vi.fn();

    await registerServiceWorker({ onUpdate, onSuccess });

    // Simulate updatefound and statechange
    if (updateFoundHandler) (updateFoundHandler as () => void)();
    if (stateChangeHandler) (stateChangeHandler as () => void)();

    expect(onUpdate).toHaveBeenCalledWith(mockRegistration);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('triggers onSuccess callback when worker installs without prior controller', async () => {
    let stateChangeHandler: (() => void) | null = null;
    let updateFoundHandler: (() => void) | null = null;

    const mockInstalling = {
      state: 'installed',
      addEventListener: vi.fn((event, handler) => {
        if (event === 'statechange') stateChangeHandler = handler;
      }),
    };

    const mockRegistration = {
      installing: mockInstalling,
      addEventListener: vi.fn((event, handler) => {
        if (event === 'updatefound') updateFoundHandler = handler;
      }),
    } as unknown as ServiceWorkerRegistration;

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
        controller: null, // First install
      },
      configurable: true,
      writable: true,
    });

    const onUpdate = vi.fn();
    const onSuccess = vi.fn();

    await registerServiceWorker({ onUpdate, onSuccess });

    if (updateFoundHandler) (updateFoundHandler as () => void)();
    if (stateChangeHandler) (stateChangeHandler as () => void)();

    expect(onSuccess).toHaveBeenCalledWith(mockRegistration);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
