import './styles/index.css';
import { initLayout } from './ui/layout';
import { store } from './state';
import { createGlobe, type GlobeContext } from './globe';

export let globeContext: GlobeContext | null = null;

export function bootstrap(): void {
  const root = document.getElementById('app');
  if (root) {
    root.setAttribute('data-ready', 'true');
    const slots = initLayout(root);
    if (typeof window !== 'undefined' && slots.globeContainer) {
      try {
        globeContext = createGlobe(slots.globeContainer, store);
      } catch (err) {
        console.warn('[TerraLearn] Globe initialization skipped (environment without WebGL):', err);
      }
    }
  }
}

if (typeof document !== 'undefined') {
  bootstrap();
}
