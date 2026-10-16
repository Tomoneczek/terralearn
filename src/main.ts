import './styles/index.css';
import { initLayout } from './ui/layout';
import { store } from './state';
import { createGlobe, type GlobeContext } from './globe';

import { SidebarController } from './ui/sidebar';
import { SearchOverlay } from './ui/search';
import { Toolbar } from './ui/toolbar';
import { LegendOverlay } from './ui/legend';
import { InfoCard } from './ui/info-card';
import { HoverTooltip } from './ui/hover-tooltip';

export let globeContext: GlobeContext | null = null;
export let sidebar: SidebarController | null = null;
export let searchOverlay: SearchOverlay | null = null;
export let toolbar: Toolbar | null = null;
export let legendOverlay: LegendOverlay | null = null;
export let infoCard: InfoCard | null = null;
export let hoverTooltip: HoverTooltip | null = null;

export function bootstrap(): void {
  const root = document.getElementById('app');
  if (root) {
    root.setAttribute('data-ready', 'true');
    const slots = initLayout(root);

    if (slots.sidebarContainer) {
      sidebar = new SidebarController({
        container: slots.sidebarContainer,
        store,
      });
    }

    if (slots.searchContainer) {
      searchOverlay = new SearchOverlay({
        container: slots.searchContainer,
        store,
        onSelect: item => {
          globeContext?.camera.flyTo(item.lat, item.lng, 1.0);
        },
      });
    }

    if (slots.toolbarContainer) {
      toolbar = new Toolbar({
        container: slots.toolbarContainer,
      });
    }

    if (slots.legendContainer) {
      legendOverlay = new LegendOverlay({
        container: slots.legendContainer,
        store,
      });
    }

    if (slots.cardContainer) {
      infoCard = new InfoCard({
        container: slots.cardContainer,
        store,
        onFlyTo: () => {
          const sel = store.get().selection;
          if (sel?.lat !== undefined && sel?.lng !== undefined) {
            globeContext?.camera.flyTo(sel.lat, sel.lng, 1.0);
          }
        },
      });
    }

    hoverTooltip = new HoverTooltip({
      container: root,
      store,
    });

    if (typeof window !== 'undefined' && slots.globeContainer) {
      try {
        globeContext = createGlobe(slots.globeContainer, store);
        if (toolbar && globeContext.camera) {
          toolbar.setCamera(globeContext.camera);
        }
      } catch (err) {
        console.warn('[TerraLearn] Globe initialization skipped (environment without WebGL):', err);
      }
    }
  }
}

if (typeof document !== 'undefined') {
  bootstrap();
}
