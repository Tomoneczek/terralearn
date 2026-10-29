import { createRail, updateRailLabels, type RailItem, type RailLabels } from './rail';
import { BottomSheetController } from './bottom-sheet';
import { parseSvg } from './dom';
import { t } from '@/i18n';

export interface LayoutSlots {
  globeContainer: HTMLElement;
  sidebarContainer: HTMLElement;
  searchContainer: HTMLElement;
  toolbarContainer: HTMLElement;
  legendContainer: HTMLElement;
  cardContainer: HTMLElement;
  togglePanel: () => void;
  bottomSheet: BottomSheetController;
  /** Re-applies translated rail labels (call after a language change). */
  refreshRail: () => void;
}

/** localStorage key of the desktop "panel hidden" state. */
export const PANEL_COLLAPSED_KEY = 'terralearn_panel_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(PANEL_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(PANEL_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // Storage unavailable: the state is kept for the session only.
  }
}

const PANEL_HIDE_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>';
const PANEL_TOGGLE_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>';

const RANKINGS_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>';

function railLabels(): RailLabels {
  return {
    navAria: t('rail.navAria'),
    home: t('rail.home'),
    items: {
      explore: t('rail.explore'),
      layers: t('rail.layers'),
      quiz: t('rail.quiz'),
      settings: t('rail.settings'),
      rankings: t('rail.rankings'),
    },
  };
}

export function initLayout(root: HTMLElement): LayoutSlots {
  root.innerHTML = '';
  root.className = 'app-root';

  // Navigation rail icons (Globe, Layers, Quiz, Compass)
  const railItems: RailItem[] = [
    {
      id: 'explore',
      label: t('rail.explore'),
      active: true,
      iconSvg:
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
    },
    {
      id: 'layers',
      label: t('rail.layers'),
      iconSvg:
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    },
    {
      id: 'quiz',
      label: t('rail.quiz'),
      iconSvg:
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>',
    },
    {
      id: 'settings',
      label: t('rail.settings'),
      iconSvg:
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    },
  ];

  // The sidebar listens for rail selections (it is created after the layout)
  const rail = createRail(
    railItems,
    id => window.dispatchEvent(new CustomEvent('tl-rail-select', { detail: { id } })),
    railLabels(),
  );
  // Keep the active rail button in sync when the view is switched from the sidebar tabs
  window.addEventListener('tl-view-changed', (event: Event) => {
    const view = (event as CustomEvent<{ view: string }>).detail?.view;
    const activeId = view === 'settings' ? 'settings' : 'explore';
    rail.querySelectorAll<HTMLButtonElement>('.rail-btn[data-rail-id]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.railId === activeId);
    });
  });
  // Rail toggle at the bottom: the way back when the panel is hidden
  const railToggleGroup = document.createElement('div');
  railToggleGroup.className = 'rail-group';
  const railToggleBtn = document.createElement('button');
  railToggleBtn.type = 'button';
  railToggleBtn.id = 'btn-rail-panel-toggle';
  railToggleBtn.className = 'rail-btn';
  railToggleBtn.appendChild(parseSvg(PANEL_TOGGLE_ICON));
  const rankingsBtn = document.createElement('button');
  rankingsBtn.type = 'button';
  rankingsBtn.id = 'btn-rail-rankings';
  rankingsBtn.className = 'rail-btn';
  rankingsBtn.dataset.railId = 'rankings';
  rankingsBtn.setAttribute('aria-label', t('rail.rankings'));
  rankingsBtn.title = t('rail.rankings');
  rankingsBtn.appendChild(parseSvg(RANKINGS_ICON));
  // Opening the table is handled in main.ts (it owns the store)
  rankingsBtn.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('tl-rankings-toggle')),
  );
  railToggleGroup.append(rankingsBtn, railToggleBtn);
  rail.appendChild(railToggleGroup);
  root.appendChild(rail);

  // Sidebar Panel (Desktop sidebar + Mobile Bottom Sheet)
  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.setAttribute('aria-label', 'Control Panel');

  // Drag handle for mobile bottom sheet
  const dragHandle = document.createElement('div');
  dragHandle.className = 'panel-drag-handle';
  dragHandle.setAttribute('role', 'button');
  dragHandle.setAttribute('tabindex', '0');
  dragHandle.setAttribute('aria-label', t('layout.dragHandleAria'));

  const dragPill = document.createElement('div');
  dragPill.className = 'panel-drag-pill';
  dragHandle.appendChild(dragPill);
  panel.appendChild(dragHandle);

  const panelHeader = document.createElement('header');
  panelHeader.className = 'panel-header';

  const title = document.createElement('h1');
  title.className = 'panel-title';
  title.textContent = t('app.title');
  panelHeader.appendChild(title);

  const headerActions = document.createElement('div');
  headerActions.className = 'panel-header-actions';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.type = 'button';
  minimizeBtn.id = 'btn-panel-minimize';
  minimizeBtn.className = 'panel-header-btn';
  minimizeBtn.setAttribute('aria-label', t('layout.minimizePanel'));
  minimizeBtn.appendChild(
    parseSvg(
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    ),
  );
  headerActions.appendChild(minimizeBtn);

  // Desktop: hide the whole panel so the globe gets the full width (mobile uses the sheet)
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.id = 'btn-panel-collapse';
  collapseBtn.className = 'panel-header-btn panel-collapse-btn';
  collapseBtn.appendChild(parseSvg(PANEL_HIDE_ICON));
  headerActions.appendChild(collapseBtn);
  panelHeader.appendChild(headerActions);
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

  // Mobile Floating Action Button (FAB) for quick bottom sheet toggle
  const mobileToggleBtn = document.createElement('button');
  mobileToggleBtn.type = 'button';
  mobileToggleBtn.id = 'btn-mobile-panel-toggle';
  mobileToggleBtn.className = 'mobile-panel-fab';
  mobileToggleBtn.setAttribute('aria-label', t('layout.mobileNavToggle'));
  mobileToggleBtn.appendChild(
    parseSvg(
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    ),
  );
  stage.appendChild(mobileToggleBtn);

  // Overlays
  const searchContainer = document.createElement('div');
  searchContainer.className = 'overlay overlay-top-left';
  searchContainer.id = 'search-container';
  stage.appendChild(searchContainer);

  const toolbarContainer = document.createElement('div');
  toolbarContainer.className = 'overlay overlay-top-right';
  toolbarContainer.id = 'toolbar-container';
  stage.appendChild(toolbarContainer);

  // The legend lives bottom-left so it never stacks with the (tall) info card and collides
  // with the toolbar at the top-right.
  const legendOverlay = document.createElement('div');
  legendOverlay.className = 'overlay overlay-bottom-left';

  const legendContainer = document.createElement('div');
  legendContainer.id = 'legend-container';
  legendOverlay.appendChild(legendContainer);
  stage.appendChild(legendOverlay);

  const bottomContainer = document.createElement('div');
  bottomContainer.className = 'overlay overlay-bottom-right';

  const cardContainer = document.createElement('div');
  cardContainer.id = 'card-container';
  bottomContainer.appendChild(cardContainer);

  stage.appendChild(bottomContainer);
  root.appendChild(stage);

  // Initialize BottomSheetController
  const bottomSheet = new BottomSheetController({
    panel,
    handle: dragHandle,
    minimizeBtn,
    fabBtn: mobileToggleBtn,
    initialSnap: 'half',
  });

  // Collapse / expand panel handler (desktop), remembered between visits
  const updatePanelToggles = (): void => {
    const collapsed = root.classList.contains('panel-collapsed');
    const label = t(collapsed ? 'layout.showPanel' : 'layout.hidePanel');
    for (const btn of [collapseBtn, railToggleBtn]) {
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
    railToggleBtn.classList.toggle('active', !collapsed);
  };
  const setPanelCollapsed = (collapsed: boolean): void => {
    root.classList.toggle('panel-collapsed', collapsed);
    writeCollapsed(collapsed);
    updatePanelToggles();
  };
  const togglePanel = (): void => {
    setPanelCollapsed(!root.classList.contains('panel-collapsed'));
  };
  root.classList.toggle('panel-collapsed', readCollapsed());
  updatePanelToggles();
  collapseBtn.addEventListener('click', togglePanel);
  railToggleBtn.addEventListener('click', togglePanel);
  // Picking a section in the rail (map, layers, settings, quiz) brings the panel back
  window.addEventListener('tl-rail-select', () => {
    if (root.classList.contains('panel-collapsed')) setPanelCollapsed(false);
  });

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
    bottomSheet,
    refreshRail: () => {
      updateRailLabels(rail, railLabels());
      updatePanelToggles();
    },
  };
}
