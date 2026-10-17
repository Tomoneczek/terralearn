import type { Store, AppState, QualityPreset } from '@/state/types';
import type { LayerDef, LayerId } from '@/layers/types';
import { LAYER_DEFINITIONS } from '@/layers/registry';
import { t } from '@/i18n';
import { parseSvg } from './dom';
import { ToggleSwitch } from './components/toggle';
import { TopNSlider } from './components/slider';
import { PRESETS, applyPreset, detectActivePreset, type PresetId } from './presets';

export interface SidebarOptions {
  container: HTMLElement;
  store: Store<AppState>;
  onStartQuiz?: () => void;
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
  }
}

export class SidebarController {
  private readonly container: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly onStartQuiz?: () => void;

  private readonly presetButtons = new Map<PresetId, HTMLButtonElement>();
  private readonly layerToggles = new Map<LayerId, ToggleSwitch>();
  private readonly layerSliders = new Map<LayerId, TopNSlider>();
  private readonly layerWrappers = new Map<LayerId, HTMLElement>();
  private readonly layerCards = new Map<LayerId, HTMLElement>();

  private dayNightToggle!: ToggleSwitch;
  private cloudsToggle!: ToggleSwitch;
  private qualitySelect!: HTMLSelectElement;
  private learnToggle!: ToggleSwitch;
  private unsubscribe: (() => void) | null = null;

  constructor(options: SidebarOptions) {
    this.container = options.container;
    this.store = options.store;
    this.onStartQuiz = options.onStartQuiz;

    this.render();
    this.bindStore();
  }

  private render(): void {
    this.container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'tl-sidebar';

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
    root.appendChild(presetsBar);

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

    // Quality selector
    modesSection.appendChild(this.createQualityRow());

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

    root.appendChild(modesSection);

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
    root.appendChild(physicalSection);

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
    root.appendChild(politicalSection);

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
        this.onStartQuiz();
      } else {
        window.dispatchEvent(new CustomEvent('tl-start-quiz'));
      }
    });

    toolsSection.appendChild(quizBtn);
    root.appendChild(toolsSection);

    this.container.appendChild(root);
    this.syncActivePreset();
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

    const dot = document.createElement('span');
    dot.className = 'tl-layer-dot';
    dot.style.backgroundColor = 'hsl(280, 80%, 65%)';
    dot.style.color = 'hsl(280, 80%, 65%)';

    const label = document.createElement('label');
    label.className = 'tl-layer-name';
    label.htmlFor = 'select-quality';
    label.textContent = t('modes.quality');

    info.appendChild(dot);
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
        hiddenLabels: s.hiddenLabels,
      }),
      state => {
        // Sync dayNight
        this.dayNightToggle.setChecked(state.dayNight, false);

        // Sync clouds
        this.cloudsToggle.setChecked(state.clouds ?? true, false);

        // Sync quality
        if (this.qualitySelect) {
          this.qualitySelect.value = state.quality ?? 'auto';
        }

        // Sync hiddenLabels
        this.learnToggle.setChecked(state.hiddenLabels, false);

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

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    for (const slider of this.layerSliders.values()) {
      slider.destroy();
    }
    this.container.innerHTML = '';
  }
}
