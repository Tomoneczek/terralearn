import { parseSvg } from './dom';

export type ToastType = 'success' | 'error' | 'info';

let toastContainer: HTMLElement | null = null;

function getOrCreateToastContainer(): HTMLElement {
  if (toastContainer && document.body.contains(toastContainer)) {
    return toastContainer;
  }

  const container = document.createElement('div');
  container.className = 'tl-toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'true');
  document.body.appendChild(container);
  toastContainer = container;
  return container;
}

function createIcon(type: ToastType): SVGElement {
  switch (type) {
    case 'success':
      return parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      );
    case 'error':
      return parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      );
    case 'info':
    default:
      return parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      );
  }
}

/**
 * Displays a toast notification in the corner of the screen.
 */
export function showToast(
  message: string,
  type: ToastType = 'success',
  durationMs: number = 3500,
): HTMLElement {
  const container = getOrCreateToastContainer();

  const toast = document.createElement('div');
  toast.className = `tl-toast tl-toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const iconWrapper = document.createElement('span');
  iconWrapper.className = 'tl-toast-icon';
  iconWrapper.appendChild(createIcon(type));

  const textSpan = document.createElement('span');
  textSpan.className = 'tl-toast-message';
  textSpan.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'tl-toast-close';
  closeBtn.setAttribute('aria-label', 'Zamknij powiadomienie');
  closeBtn.appendChild(
    parseSvg(
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    ),
  );

  let timer: ReturnType<typeof setTimeout> | null = null;

  const dismiss = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    toast.classList.add('tl-toast-hiding');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 250);
  };

  closeBtn.addEventListener('click', dismiss);

  toast.appendChild(iconWrapper);
  toast.appendChild(textSpan);
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  if (durationMs > 0) {
    timer = setTimeout(dismiss, durationMs);
  }

  return toast;
}
