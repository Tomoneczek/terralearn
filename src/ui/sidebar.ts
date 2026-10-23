import type { Store, AppState, QualityPreset, GraticuleMode, AppTheme } from '@/state/types';
import type { LayerDef, LayerId } from '@/layers/types';
import { LAYER_DEFINITIONS } from '@/layers/registry';
import { t } from '@/i18n';
import { parseSvg } from './dom';
import { ToggleSwitch } from './components/toggle';
import { TopNSlider } from './components/slider';
import { PRESETS, applyPreset, detectActivePreset, type PresetId } from './presets';
import { loadGeoData } from '@/globe/data-loader';
import { antipode } from '@/geo/spherical';

import type { QuizMode, QuizConfig } from '@/quiz/types';
import {
  downloadExportFile,
  parseAndValidateImport,
  applyImportedData,
  type ProgressExportPayload,
} from '@/quiz/srs/transfer';
import { showToast } from './toast';
import { ImportConfirmModal } from './import-confirm-modal';

export interface SidebarOptions {
  container: HTMLElement;
  store: Store<AppState>;
  modalContainer?: HTMLElement;
  onStartQuiz?: (mode?: QuizMode, configOverride?: Partial<QuizConfig>) => void;
}

export function getLayerColor(id: LayerId): string {
  switch (id) {
    case 'lakes':
      return 'hsl(190, 100%, 60%)';
    case 'rivers':
      return 'hsl(190, 100%, 65%)';
    case 'mountains':
      return 'hsl(28, 100%, 58%)';
    case 'deserts':
      return 'hsl(38, 80%, 65%)';
    case 'peaks':
      return 'hsl(0, 100%, 67%)';
    case 'borders':
      return 'hsl(215, 35%, 65%)';
    case 'countriesTopN':
      return 'hsl(212, 95%, 58%)';
    case 'capitals':
      return 'hsl(350, 85%, 62%)';
    case 'megacities':
      return 'hsl(45, 100%, 62%)';
    case 'landforms':
      return 'hsl(140, 65%, 55%)';
    case 'marine':
      return 'hsl(205, 90%, 60%)';
  }
}

export type SidebarView = 'map' | 'settings';

export class SidebarController {
  private readonly container: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly onStartQuiz?: (mode?: QuizMode, configOverride?: Partial<QuizConfig>) => void;

  private readonly presetButtons = new Map<PresetId, HTMLButtonElement>();
  private readonly layerToggles = new Map<LayerId, ToggleSwitch>();
  private readonly layerSliders = new Map<LayerId, TopNSlider>();
  private readonly layerWrappers = new Map<LayerId, HTMLElement>();
  private readonly layerCards = new Map<LayerId, HTMLElement>();

  private dayNightToggle!: ToggleSwitch;
  private cloudsToggle!: ToggleSwitch;
  private qualitySelect!: HTMLSelectElement;
  private graticuleSelect!: HTMLSelectElement;
  private themeSelect!: HTMLSelectElement;
  private languageSelect!: HTMLSelectElement;
  private learnToggle!: ToggleSwitch;
  private knowledgeMapToggle!: ToggleSwitch;
  private unsubscribe: (() => void) | null = null;

  private view: SidebarView = 'map';
  private rootEl: HTMLElement | null = null;
  private readonly tabButtons = new Map<SidebarView, HTMLButtonElement>();
  private readonly onRailSelect = (event: Event): void => {
    const id = (event as CustomEvent<{ id: string }>).detail?.id;
    this.setView(id === 'settings' ? 'settings' : 'map');
  };

  private confirmModal!: ImportConfirmModal;
  private pendingImportPayload: ProgressExportPayload | null = null;
  private readonly modalContainer: HTMLElement;

  constructor(options: SidebarOptions) {
    this.container = options.container;
    this.store = options.store;
    this.onStartQuiz = options.onStartQuiz;
    this.modalContainer = options.modalContainer ?? document.body;

    this.initConfirmModal();
    this.render();
    this.bindStore();
    if (typeof window !== 'undefined') {
      window.addEventListener('tl-rail-select', this.onRailSelect);
    }
  }

  public getView(): SidebarView {
    return this.view;
  }

  /** Switches between the map controls and the app settings (theme, quality, grid, language). */
  public setView(view: SidebarView): void {
    this.view = view;
    this.applyView();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tl-view-changed', { detail: { view } }));
    }
  }

  private applyView(): void {
    this.rootEl?.setAttribute('data-view', this.view);
    for (const [view, btn] of this.tabButtons) {
      const active = view === this.view;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
    }
  }

  private createTabs(): HTMLElement {
    const tabs = document.createElement('div');
    tabs.className = 'tl-sidebar-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', t('sidebarTabs.aria'));

    const items: Array<{ view: SidebarView; label: string }> = [
      { view: 'map', label: t('sidebarTabs.map') },
      { view: 'settings', label: t('sidebarTabs.settings') },
    ];
    this.tabButtons.clear();
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tl-sidebar-tab';
      btn.setAttribute('role', 'tab');
      btn.id = `tl-tab-${item.view}`;
      btn.textContent = item.label;
      btn.addEventListener('click', () => this.setView(item.view));
      this.tabButtons.set(item.view, btn);
      tabs.appendChild(btn);
    }
    return tabs;
  }

  private render(): void {
    if (this.layerSliders.size > 0) {
      for (const slider of this.layerSliders.values()) {
        slider.destroy();
      }
      this.presetButtons.clear();
      this.layerToggles.clear();
      this.layerSliders.clear();
      this.layerWrappers.clear();
      this.layerCards.clear();
    }

    this.container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'tl-sidebar';
    this.rootEl = root;
    root.appendChild(this.createTabs());

    // Map view: presets, map modes, layers and tools. Settings view: app preferences.
    const mapView = document.createElement('div');
    mapView.className = 'tl-map-view';
    mapView.setAttribute('role', 'tabpanel');
    mapView.setAttribute('aria-labelledby', 'tl-tab-map');
    const settingsView = document.createElement('div');
    settingsView.className = 'tl-settings-view';
    settingsView.setAttribute('role', 'tabpanel');
    settingsView.setAttribute('aria-labelledby', 'tl-tab-settings');

    // 1. Presets bar
    const presetsBar = document.createElement('div');
    presetsBar.className = 'tl-presets-bar';

    for (const preset of PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tl-preset-btn';
      btn.textContent = t(preset.nameKey);
      btn.addEventListener('click', () => {
        applyPreset(preset.id, this.store);
      });
      this.presetButtons.set(preset.id, btn);
      presetsBar.appendChild(btn);
    }
    mapView.appendChild(presetsBar);

    // 2. Map Modes section
    const modesSection = document.createElement('div');
    modesSection.className = 'tl-section';

    const modesTitle = document.createElement('h2');
    modesTitle.className = 'tl-section-title';
    modesTitle.textContent = t('sections.modes');
    modesSection.appendChild(modesTitle);

    // Day/Night toggle
    const dayNightCard = this.createModeRow(
      t('modes.dayNight'),
      'hsl(45, 100%, 62%)',
      this.store.get().dayNight,
      checked => {
        this.store.set({ ...this.store.get(), dayNight: checked });
      },
    );
    this.dayNightToggle = dayNightCard.toggle;
    modesSection.appendChild(dayNightCard.card);

    // 3D Clouds toggle
    const cloudsCard = this.createModeRow(
      t('modes.clouds'),
      'hsl(200, 90%, 70%)',
      this.store.get().clouds ?? true,
      checked => {
        this.store.set({ ...this.store.get(), clouds: checked });
      },
    );
    this.cloudsToggle = cloudsCard.toggle;
    modesSection.appendChild(cloudsCard.card);

    // Learn / Blind map toggle
    const learnCard = this.createModeRow(
      t('modes.learn'),
      'hsl(160, 80%, 45%)',
      this.store.get().hiddenLabels,
      checked => {
        this.store.set({ ...this.store.get(), hiddenLabels: checked });
      },
    );
    this.learnToggle = learnCard.toggle;
    modesSection.appendChild(learnCard.card);

    // Knowledge Mastery Map toggle
    const knowledgeMapCard = this.createModeRow(
      t('modes.knowledgeMap'),
      'hsl(142, 71%, 45%)',
      this.store.get().knowledgeMap ?? false,
      checked => {
        this.store.set({ ...this.store.get(), knowledgeMap: checked });
      },
    );
    this.knowledgeMapToggle = knowledgeMapCard.toggle;
    modesSection.appendChild(knowledgeMapCard.card);

    mapView.appendChild(modesSection);

    // 3. Physical Geography section
    const physicalSection = document.createElement('div');
    physicalSection.className = 'tl-section';

    const physicalTitle = document.createElement('h2');
    physicalTitle.className = 'tl-section-title';
    physicalTitle.textContent = t('sections.physical');
    physicalSection.appendChild(physicalTitle);

    const physicalLayers = LAYER_DEFINITIONS.filter(l => l.group === 'physical');
    for (const layer of physicalLayers) {
      physicalSection.appendChild(this.createLayerItem(layer));
    }
    mapView.appendChild(physicalSection);

    // 4. Political Geography section
    const politicalSection = document.createElement('div');
    politicalSection.className = 'tl-section';

    const politicalTitle = document.createElement('h2');
    politicalTitle.className = 'tl-section-title';
    politicalTitle.textContent = t('sections.political');
    politicalSection.appendChild(politicalTitle);

    const politicalLayers = LAYER_DEFINITIONS.filter(l => l.group === 'political');
    for (const layer of politicalLayers) {
      politicalSection.appendChild(this.createLayerItem(layer));
    }
    mapView.appendChild(politicalSection);

    // 5. Tools & Quiz section
    const toolsSection = document.createElement('div');
    toolsSection.className = 'tl-section';

    const toolsTitle = document.createElement('h2');
    toolsTitle.className = 'tl-section-title';
    toolsTitle.textContent = t('sections.tools');
    toolsSection.appendChild(toolsTitle);

    // Route Comparison button (Orthodrome vs Loxodrome)
    const routeBtn = document.createElement('button');
    routeBtn.type = 'button';
    routeBtn.className = 'tl-tool-btn';
    routeBtn.id = 'btn-route-compare';

    const routeIconSpan = document.createElement('span');
    routeIconSpan.className = 'tl-tool-icon';
    routeIconSpan.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
      ),
    );

    const routeLabelSpan = document.createElement('span');
    routeLabelSpan.textContent = t('tools.greatCircle');

    routeBtn.appendChild(routeIconSpan);
    routeBtn.appendChild(routeLabelSpan);
    routeBtn.addEventListener('click', () => {
      const current = this.store.get().routeComparison;
      if (current?.active) {
        this.store.set({ routeComparison: null });
      } else {
        this.store.set({
          routeComparison: {
            active: true,
            from: null,
            to: null,
          },
        });
      }
    });
    toolsSection.appendChild(routeBtn);

    // Size Comparison button (True Size)
    const sizeBtn = document.createElement('button');
    sizeBtn.type = 'button';
    sizeBtn.className = 'tl-tool-btn';
    sizeBtn.id = 'btn-size-compare';

    const sizeIconSpan = document.createElement('span');
    sizeIconSpan.className = 'tl-tool-icon';
    sizeIconSpan.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 3H3v18h18V3z"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
      ),
    );

    const sizeLabelSpan = document.createElement('span');
    sizeLabelSpan.textContent = t('tools.sizeComparison');

    sizeBtn.appendChild(sizeIconSpan);
    sizeBtn.appendChild(sizeLabelSpan);
    sizeBtn.addEventListener('click', () => {
      const current = this.store.get().sizeComparison;
      if (current?.active) {
        this.store.set({ sizeComparison: null });
      } else {
        const sel = this.store.get().selection;
        const isCountry = sel && sel.kind === 'country';
        const targetId = isCountry ? sel.id : 'GL';
        void loadGeoData('/data/countries.json').then(data => {
          const feat = data.features.find(f => f.properties.id === targetId);
          if (feat) {
            this.store.set({
              sizeComparison: {
                active: true,
                countryId: feat.properties.id,
                countryName: feat.properties.name_pl || feat.properties.name_en || targetId,
                countryAreaKm2: feat.properties.rank?.area ?? 0,
                targetLat: feat.properties.labelLat ?? 0,
                targetLng: feat.properties.labelLng ?? 0,
                geometry: feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
              },
            });
          }
        });
      }
    });
    toolsSection.appendChild(sizeBtn);

    // Antipodes Simulator button
    const antipodesBtn = document.createElement('button');
    antipodesBtn.type = 'button';
    antipodesBtn.className = 'tl-tool-btn';
    antipodesBtn.id = 'btn-antipodes';

    const antipodesIconSpan = document.createElement('span');
    antipodesIconSpan.className = 'tl-tool-icon';
    antipodesIconSpan.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="3"/></svg>',
      ),
    );

    const antipodesLabelSpan = document.createElement('span');
    antipodesLabelSpan.textContent = t('tools.antipodes');

    antipodesBtn.appendChild(antipodesIconSpan);
    antipodesBtn.appendChild(antipodesLabelSpan);
    antipodesBtn.addEventListener('click', () => {
      const current = this.store.get().antipodes;
      if (current?.active) {
        this.store.set({ antipodes: null });
      } else {
        const sel = this.store.get().selection;
        const lat = sel?.lat ?? 52.23;
        const lng = sel?.lng ?? 21.01;
        const label = sel?.name_pl || sel?.name || 'Warszawa';
        const anti = antipode({ lat, lng });
        this.store.set({
          antipodes: {
            active: true,
            source: { lat, lng, label },
            antipode: {
              lat: anti.lat,
              lng: anti.lng,
            },
          },
        });
      }
    });
    toolsSection.appendChild(antipodesBtn);

    const quizBtn = document.createElement('button');
    quizBtn.type = 'button';
    quizBtn.className = 'tl-tool-btn';
    quizBtn.id = 'btn-start-quiz';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'tl-tool-icon';
    iconSpan.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>',
      ),
    );

    const labelSpan = document.createElement('span');
    labelSpan.textContent = t('tools.quizMode');

    quizBtn.appendChild(iconSpan);
    quizBtn.appendChild(labelSpan);
    quizBtn.addEventListener('click', () => {
      if (this.onStartQuiz) {
        this.onStartQuiz('classic');
      } else {
        window.dispatchEvent(new CustomEvent('tl-start-quiz', { detail: { mode: 'classic' } }));
      }
    });

    const quizReverseBtn = document.createElement('button');
    quizReverseBtn.type = 'button';
    quizReverseBtn.className = 'tl-tool-btn';
    quizReverseBtn.id = 'btn-start-quiz-reverse';

    const iconReverseSpan = document.createElement('span');
    iconReverseSpan.className = 'tl-tool-icon';
    iconReverseSpan.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
      ),
    );

    const labelReverseSpan = document.createElement('span');
    labelReverseSpan.textContent = t('tools.quizReverse');

    quizReverseBtn.appendChild(iconReverseSpan);
    quizReverseBtn.appendChild(labelReverseSpan);
    quizReverseBtn.addEventListener('click', () => {
      if (this.onStartQuiz) {
        this.onStartQuiz('reverse');
      } else {
        window.dispatchEvent(new CustomEvent('tl-start-quiz', { detail: { mode: 'reverse' } }));
      }
    });

    const srsBtn = document.createElement('button');
    srsBtn.type = 'button';
    srsBtn.className = 'tl-tool-btn';
    srsBtn.id = 'btn-start-quiz-srs';

    const srsIconSpan = document.createElement('span');
    srsIconSpan.className = 'tl-tool-icon';
    srsIconSpan.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>',
      ),
    );

    const srsLabelSpan = document.createElement('span');
    srsLabelSpan.textContent = t('quiz.srsTraining');

    srsBtn.appendChild(srsIconSpan);
    srsBtn.appendChild(srsLabelSpan);
    srsBtn.addEventListener('click', () => {
      if (this.onStartQuiz) {
        this.onStartQuiz('classic', { srsFilter: 'due' });
      } else {
        window.dispatchEvent(
          new CustomEvent('tl-start-quiz', { detail: { mode: 'classic', srsFilter: 'due' } }),
        );
      }
    });

    toolsSection.appendChild(quizBtn);
    toolsSection.appendChild(quizReverseBtn);
    toolsSection.appendChild(srsBtn);

    // Progress Export & Import buttons
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'tl-tool-btn';
    exportBtn.id = 'btn-export-progress';

    const exportIconSpan = document.createElement('span');
    exportIconSpan.className = 'tl-tool-icon';
    exportIconSpan.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      ),
    );

    const exportLabelSpan = document.createElement('span');
    exportLabelSpan.textContent = t('transfer.exportBtn');

    exportBtn.appendChild(exportIconSpan);
    exportBtn.appendChild(exportLabelSpan);
    exportBtn.addEventListener('click', () => {
      downloadExportFile();
      showToast(t('transfer.exportSuccess'), 'success');
    });

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'tl-tool-btn';
    importBtn.id = 'btn-import-progress';

    const importIconSpan = document.createElement('span');
    importIconSpan.className = 'tl-tool-icon';
    importIconSpan.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
      ),
    );

    const importLabelSpan = document.createElement('span');
    importLabelSpan.textContent = t('transfer.importBtn');

    importBtn.appendChild(importIconSpan);
    importBtn.appendChild(importLabelSpan);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    fileInput.id = 'input-import-progress';

    importBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const validation = parseAndValidateImport(text);
        if (!validation.success || !validation.data) {
          let errorMsg = t('transfer.errorSchemaViolation');
          if (validation.error === 'invalid_json') {
            errorMsg = t('transfer.errorInvalidJson');
          } else if (validation.error === 'invalid_version') {
            errorMsg = t('transfer.errorInvalidVersion');
          }
          showToast(errorMsg, 'error', 4500);
          fileInput.value = '';
          return;
        }

        this.pendingImportPayload = validation.data;
        this.confirmModal.show({
          itemCount: validation.itemCount ?? 0,
          exportedAt: validation.data.exportedAt,
        });
        fileInput.value = '';
      };
      reader.onerror = () => {
        showToast(t('transfer.errorReadFailed'), 'error', 4000);
        fileInput.value = '';
      };
      reader.readAsText(file);
    });

    toolsSection.appendChild(exportBtn);
    toolsSection.appendChild(importBtn);
    toolsSection.appendChild(fileInput);

    mapView.appendChild(toolsSection);

    // Settings view
    const settingsSection = document.createElement('div');
    settingsSection.className = 'tl-section';
    const settingsTitle = document.createElement('h2');
    settingsTitle.className = 'tl-section-title';
    settingsTitle.textContent = t('sections.settings');
    settingsSection.appendChild(settingsTitle);
    settingsSection.appendChild(this.createThemeRow());
    settingsSection.appendChild(this.createQualityRow());
    settingsSection.appendChild(this.createGraticuleRow());
    settingsSection.appendChild(this.createLanguageRow());
    settingsView.appendChild(settingsSection);

    root.appendChild(mapView);
    root.appendChild(settingsView);

    this.container.appendChild(root);
    this.applyView();
    this.syncActivePreset();
  }

  private initConfirmModal(): void {
    this.confirmModal = new ImportConfirmModal({
      container: this.modalContainer,
      onConfirm: () => {
        if (this.pendingImportPayload) {
          const count = Object.keys(this.pendingImportPayload.srs).length;
          applyImportedData(this.pendingImportPayload);
          this.pendingImportPayload = null;
          showToast(t('transfer.importSuccess', { count }), 'success');
        }
      },
      onCancel: () => {
        this.pendingImportPayload = null;
      },
    });
  }

  private createModeRow(
    title: string,
    color: string,
    initialChecked: boolean,
    onToggle: (checked: boolean) => void,
  ): { card: HTMLElement; toggle: ToggleSwitch } {
    const card = document.createElement('div');
    card.className = `tl-layer-card${initialChecked ? ' active' : ''}`;

    const row = document.createElement('div');
    row.className = 'tl-layer-row';

    const info = document.createElement('div');
    info.className = 'tl-layer-info';

    const dot = document.createElement('span');
    dot.className = 'tl-layer-dot';
    dot.style.backgroundColor = color;
    dot.style.color = color;

    const label = document.createElement('span');
    label.className = 'tl-layer-name';
    label.textContent = title;

    info.appendChild(dot);
    info.appendChild(label);

    const toggle = new ToggleSwitch({
      checked: initialChecked,
      ariaLabel: title,
      onChange: checked => {
        card.classList.toggle('active', checked);
        onToggle(checked);
      },
    });

    row.appendChild(info);
    row.appendChild(toggle.element);
    card.appendChild(row);

    return { card, toggle };
  }

  private createQualityRow(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'tl-layer-card';

    const row = document.createElement('div');
    row.className = 'tl-layer-row';

    const info = document.createElement('div');
    info.className = 'tl-layer-info';

    const label = document.createElement('label');
    label.className = 'tl-layer-name';
    label.htmlFor = 'select-quality';
    label.textContent = t('modes.quality');

    info.appendChild(label);

    const select = document.createElement('select');
    select.className = 'tl-quality-select';
    select.id = 'select-quality';
    select.setAttribute('aria-label', t('modes.quality'));

    const options: { value: QualityPreset; label: string }[] = [
      { value: 'auto', label: t('modes.qualityAuto') },
      { value: 'high', label: t('modes.qualityHigh') },
      { value: 'medium', label: t('modes.qualityMedium') },
      { value: 'low', label: t('modes.qualityLow') },
    ];
    for (const opt of options) {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (this.store.get().quality === opt.value) {
        optEl.selected = true;
      }
      select.appendChild(optEl);
    }

    select.addEventListener('change', () => {
      this.store.set({
        ...this.store.get(),
        quality: select.value as QualityPreset,
      });
    });

    this.qualitySelect = select;

    row.appendChild(info);
    row.appendChild(select);
    card.appendChild(row);

    return card;
  }

  private createLanguageRow(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'tl-layer-card';

    const row = document.createElement('div');
    row.className = 'tl-layer-row';

    const info = document.createElement('div');
    info.className = 'tl-layer-info';

    const label = document.createElement('label');
    label.className = 'tl-layer-name';
    label.htmlFor = 'select-language';
    label.textContent = t('modes.language');

    info.appendChild(label);

    const select = document.createElement('select');
    select.className = 'tl-quality-select';
    select.id = 'select-language';
    select.setAttribute('aria-label', t('modes.language'));

    const options: { value: 'pl' | 'en'; label: string }[] = [
      { value: 'pl', label: t('modes.langPl') },
      { value: 'en', label: t('modes.langEn') },
    ];
    for (const opt of options) {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (this.store.get().locale === opt.value) {
        optEl.selected = true;
      }
      select.appendChild(optEl);
    }

    select.addEventListener('change', () => {
      this.store.set({
        ...this.store.get(),
        locale: select.value as 'pl' | 'en',
      });
    });

    this.languageSelect = select;

    row.appendChild(info);
    row.appendChild(select);
    card.appendChild(row);

    return card;
  }

  private createGraticuleRow(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'tl-layer-card';

    const row = document.createElement('div');
    row.className = 'tl-layer-row';

    const info = document.createElement('div');
    info.className = 'tl-layer-info';

    const label = document.createElement('label');
    label.className = 'tl-layer-name';
    label.htmlFor = 'select-graticule';
    label.textContent = t('modes.graticule');

    info.appendChild(label);

    const select = document.createElement('select');
    select.className = 'tl-quality-select';
    select.id = 'select-graticule';
    select.setAttribute('aria-label', t('modes.graticule'));

    const options: { value: GraticuleMode; label: string }[] = [
      { value: 'off', label: t('modes.graticuleOff') },
      { value: 'major', label: t('modes.graticuleMajor') },
      { value: '15deg', label: t('modes.graticule15deg') },
    ];
    for (const opt of options) {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (this.store.get().graticule === opt.value) {
        optEl.selected = true;
      }
      select.appendChild(optEl);
    }

    select.addEventListener('change', () => {
      this.store.set({
        ...this.store.get(),
        graticule: select.value as GraticuleMode,
      });
    });

    this.graticuleSelect = select;

    row.appendChild(info);
    row.appendChild(select);
    card.appendChild(row);

    return card;
  }

  private createThemeRow(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'tl-layer-card';

    const row = document.createElement('div');
    row.className = 'tl-layer-row';

    const info = document.createElement('div');
    info.className = 'tl-layer-info';

    const label = document.createElement('label');
    label.className = 'tl-layer-name';
    label.htmlFor = 'select-theme';
    label.textContent = t('modes.theme');

    info.appendChild(label);

    const select = document.createElement('select');
    select.className = 'tl-quality-select';
    select.id = 'select-theme';
    select.setAttribute('aria-label', t('modes.theme'));

    const options: { value: AppTheme; label: string }[] = [
      { value: 'dark', label: t('modes.themeDark') },
      { value: 'classic', label: t('modes.themeClassic') },
    ];
    for (const opt of options) {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (this.store.get().theme === opt.value) {
        optEl.selected = true;
      }
      select.appendChild(optEl);
    }

    select.addEventListener('change', () => {
      this.store.set({
        ...this.store.get(),
        theme: select.value as AppTheme,
      });
    });

    this.themeSelect = select;

    row.appendChild(info);
    row.appendChild(select);
    card.appendChild(row);

    return card;
  }

  private createLayerItem(layer: LayerDef): HTMLElement {
    const state = this.store.get();
    const layerState = state.layers[layer.id];
    const isEnabled = layerState?.enabled ?? layer.defaultEnabled;

    const card = document.createElement('div');
    card.className = `tl-layer-card${isEnabled ? ' active' : ''}`;
    card.setAttribute('data-layer-id', layer.id);
    this.layerCards.set(layer.id, card);

    const row = document.createElement('div');
    row.className = 'tl-layer-row';

    const info = document.createElement('div');
    info.className = 'tl-layer-info';

    const dot = document.createElement('span');
    dot.className = 'tl-layer-dot';
    const color = getLayerColor(layer.id);
    dot.style.backgroundColor = color;
    dot.style.color = color;

    const label = document.createElement('span');
    label.className = 'tl-layer-name';
    label.textContent = t(layer.labelKey);

    info.appendChild(dot);
    info.appendChild(label);

    const toggle = new ToggleSwitch({
      checked: isEnabled,
      ariaLabel: t(layer.labelKey),
      onChange: checked => {
        card.classList.toggle('active', checked);
        const wrapper = this.layerWrappers.get(layer.id);
        if (wrapper) {
          wrapper.classList.toggle('expanded', checked);
        }

        const current = this.store.get();
        this.store.set({
          ...current,
          layers: {
            ...current.layers,
            [layer.id]: {
              ...current.layers[layer.id],
              enabled: checked,
            },
          },
        });
      },
    });
    this.layerToggles.set(layer.id, toggle);

    row.appendChild(info);
    row.appendChild(toggle.element);
    card.appendChild(row);

    // If Top N slider is supported for this layer
    if (layer.topN) {
      const wrapper = document.createElement('div');
      wrapper.className = `tl-collapsible-wrapper${isEnabled ? ' expanded' : ''}`;
      this.layerWrappers.set(layer.id, wrapper);

      const inner = document.createElement('div');
      inner.className = 'tl-collapsible-inner';

      const slider = new TopNSlider({
        min: layer.topN.min,
        max: layer.topN.max,
        value: layerState?.topN ?? layer.topN.default,
        presets: layer.topN.presets,
        unitLabel: t('sliders.topPrefix'),
        onChange: val => {
          const current = this.store.get();
          this.store.set({
            ...current,
            layers: {
              ...current.layers,
              [layer.id]: {
                ...current.layers[layer.id],
                topN: val,
              },
            },
          });
        },
      });
      this.layerSliders.set(layer.id, slider);

      inner.appendChild(slider.element);
      wrapper.appendChild(inner);
      card.appendChild(wrapper);
    }

    return card;
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => ({
        layers: s.layers,
        dayNight: s.dayNight,
        clouds: s.clouds,
        quality: s.quality,
        graticule: s.graticule,
        theme: s.theme,
        locale: s.locale,
        hiddenLabels: s.hiddenLabels,
        knowledgeMap: s.knowledgeMap,
      }),
      state => {
        // Sync dayNight
        this.dayNightToggle.setChecked(state.dayNight, false);

        // Sync clouds
        this.cloudsToggle.setChecked(state.clouds ?? true, false);

        // Sync theme
        if (this.themeSelect) {
          this.themeSelect.value = state.theme ?? 'dark';
        }

        // Sync quality
        if (this.qualitySelect) {
          this.qualitySelect.value = state.quality ?? 'auto';
        }

        // Sync graticule
        if (this.graticuleSelect) {
          this.graticuleSelect.value = state.graticule ?? 'off';
        }

        // Sync language
        if (this.languageSelect) {
          this.languageSelect.value = state.locale ?? 'en';
        }

        // Sync hiddenLabels
        this.learnToggle.setChecked(state.hiddenLabels, false);

        // Sync knowledgeMap
        this.knowledgeMapToggle.setChecked(state.knowledgeMap ?? false, false);

        // Sync layers
        for (const [id, toggle] of this.layerToggles.entries()) {
          const layerState = state.layers[id];
          const isEnabled = layerState?.enabled ?? false;
          toggle.setChecked(isEnabled, false);

          const card = this.layerCards.get(id);
          card?.classList.toggle('active', isEnabled);

          const wrapper = this.layerWrappers.get(id);
          wrapper?.classList.toggle('expanded', isEnabled);

          const slider = this.layerSliders.get(id);
          if (slider && layerState?.topN !== undefined) {
            slider.setValue(layerState.topN, false, false);
          }
        }

        this.syncActivePreset();
      },
    );
  }

  private syncActivePreset(): void {
    const activePreset = detectActivePreset(this.store.get().layers);
    for (const [id, btn] of this.presetButtons.entries()) {
      btn.classList.toggle('active', id === activePreset);
    }
  }

  public refresh(): void {
    this.render();
  }

  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('tl-rail-select', this.onRailSelect);
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    for (const slider of this.layerSliders.values()) {
      slider.destroy();
    }
    if (this.confirmModal) {
      this.confirmModal.hide();
      if (this.confirmModal.element.parentElement) {
        this.confirmModal.element.parentElement.removeChild(this.confirmModal.element);
      }
    }
    this.container.innerHTML = '';
  }
}
