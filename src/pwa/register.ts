import { resolveAssetUrl } from '@/utils/assets';

export interface ServiceWorkerOptions {
  swPath?: string;
  scope?: string;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
}

/**
 * Registers the TerraLearn service worker in supported browser environments.
 */
export async function registerServiceWorker(
  options: ServiceWorkerOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !navigator.serviceWorker
  ) {
    return null;
  }

  // Only register over HTTPS or on localhost/127.0.0.1
  const isLocalhost = Boolean(
    window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/),
  );

  if (window.location.protocol !== 'https:' && !isLocalhost) {
    return null;
  }

  const swUrl = resolveAssetUrl(options.swPath ?? 'sw.js');
  const scope = resolveAssetUrl(options.scope ?? './');

  try {
    const registration = await navigator.serviceWorker.register(swUrl, { scope });

    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New content available, please refresh
            options.onUpdate?.(registration);
          } else {
            // Content cached for offline use
            options.onSuccess?.(registration);
          }
        }
      });
    });

    return registration;
  } catch (error) {
    console.warn('[PWA] Service worker registration failed:', error);
    return null;
  }
}
