import { showToast } from '@/ui/toast';
import { t } from '@/i18n';

export interface OfflineMonitorOptions {
  onOffline?: () => void;
  onOnline?: () => void;
  showToasts?: boolean;
}

/**
 * Initializes listeners for online and offline status changes.
 * Returns an unsubscribe cleanup callback.
 */
export function initOfflineMonitor(options: OfflineMonitorOptions = {}): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const { onOffline, onOnline, showToasts = true } = options;

  const handleOffline = (): void => {
    if (showToasts) {
      showToast(t('pwa.offlineMessage'), 'info', 4500);
    }
    onOffline?.();
  };

  const handleOnline = (): void => {
    if (showToasts) {
      showToast(t('pwa.onlineMessage'), 'success', 3000);
    }
    onOnline?.();
  };

  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);

  return () => {
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('online', handleOnline);
  };
}
