/**
 * Application entry point for TerraLearn.
 */

export function bootstrap(): void {
  const root = document.getElementById('app');
  if (root) {
    // Initial placeholder container until UI layout mounts
    root.setAttribute('data-ready', 'true');
  }
}

if (typeof document !== 'undefined') {
  bootstrap();
}
