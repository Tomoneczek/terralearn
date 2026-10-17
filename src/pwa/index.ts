import { registerServiceWorker, type ServiceWorkerOptions } from './register';
import { initOfflineMonitor, type OfflineMonitorOptions } from './monitor';

export { registerServiceWorker, initOfflineMonitor };
export type { ServiceWorkerOptions, OfflineMonitorOptions };

/**
 * Initializes full PWA functionality: registers service worker and monitors network state.
 */
export function initPwa(
  options: {
    sw?: ServiceWorkerOptions;
    monitor?: OfflineMonitorOptions;
  } = {},
): () => void {
  void registerServiceWorker(options.sw);
  return initOfflineMonitor(options.monitor);
}
