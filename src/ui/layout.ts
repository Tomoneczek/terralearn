import { createRail, type RailItem } from './rail';
import { t } from '@/i18n';

export interface LayoutSlots {
  globeContainer: HTMLElement;
  sidebarContainer: HTMLElement;
  searchContainer: HTMLElement;
  toolbarContainer: HTMLElement;
  legendContainer: HTMLElement;
  cardContainer: HTMLElement;
  togglePanel: () => void;
}

export function initLayout(root: HTMLElement): LayoutSlots {
  root.innerHTML = '';
  root.className = 'app-root';

  // Navigation rail icons (Globe, Layers, Quiz, Compass)
  const railItems: RailItem[] = [
    {
      id: 'explore',
      label: 'Eksploracja',
      active: true,
      iconSvg:
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
    },
    {
      id: 'layers',
      label: 'Warstwy',
      iconSvg:
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    },
    {
      id: 'quiz',
      label: 'Quiz',
      iconSvg:
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>',
    },
  ];

  const rail = createRail(railItems);
  root.appendChild(rail);

  // Sidebar Panel
  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.setAttribute('aria-label', 'Control Panel');

  const panelHeader = document.createElement('header');
  panelHeader.className = 'panel-header';

  const title = document.createElement('h1');
  title.className = 'panel-title';
  title.textContent = t('app.title');
  panelHeader.appendChild(title);
  panel.appendChild(panelHeader);

  const sidebarContent = document.createElement('div');
  sidebarContent.className = 'panel-content';
  sidebarContent.id = 'sidebar-container';
  panel.appendChild(sidebarContent);

  root.appendChild(panel);

  // Stage & Globe Canvas
  const stage = document.createElement('main');
  stage.className = 'stage';
  stage.setAttribute('aria-label', '3D Earth Globe');

  const globeContainer = document.createElement('div');
  globeContainer.id = 'globe-container';
  stage.appendChild(globeContainer);

  // Overlays
  const searchContainer = document.createElement('div');
  searchContainer.className = 'overlay overlay-top-left';
  searchContainer.id = 'search-container';
  stage.appendChild(searchContainer);

  const toolbarContainer = document.createElement('div');
  toolbarContainer.className = 'overlay overlay-top-right';
  toolbarContainer.id = 'toolbar-container';
  stage.appendChild(toolbarContainer);

  const bottomContainer = document.createElement('div');
  bottomContainer.className = 'overlay overlay-bottom-right';

  const legendContainer = document.createElement('div');
  legendContainer.id = 'legend-container';
  bottomContainer.appendChild(legendContainer);

  const cardContainer = document.createElement('div');
  cardContainer.id = 'card-container';
  bottomContainer.appendChild(cardContainer);

  stage.appendChild(bottomContainer);
  root.appendChild(stage);

  // Collapse / expand panel handler
  const togglePanel = (): void => {
    root.classList.toggle('panel-collapsed');
  };

  // Keyboard shortcut "["
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (
      e.key === '[' &&
      !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
    ) {
      togglePanel();
    }
  });

  return {
    globeContainer,
    sidebarContainer: sidebarContent,
    searchContainer,
    toolbarContainer,
    legendContainer,
    cardContainer,
    togglePanel,
  };
}
