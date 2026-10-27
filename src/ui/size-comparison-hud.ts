import { parseSvg } from './dom';
import { makeDraggable, type DraggableController } from './draggable';
import type { Store, AppState } from '@/state/types';
import { loadGeoData, type GeoFeature } from '@/globe/data-loader';
import { t, getLocale, localize, localizedName, type I18nKey } from '@/i18n';

export const AFRICA_AREA_KM2 = 30_370_000;
export const POLAND_AREA_KM2 = 312_696;

export interface SizeComparisonHudOptions {
  container: HTMLElement;
  store: Store<AppState>;
  onFlyTo?: (lat: number, lng: number, altitude?: number) => void;
}

export interface SizePresetItem {
  id: string;
  nameKey: I18nKey;
  countryCode: string;
  targetLat: number;
  targetLng: number;
  camera: { lat: number; lng: number; altitude: number };
}

export const SIZE_PRESETS: SizePresetItem[] = [
  {
    id: 'greenland-africa',
    nameKey: 'sizeCompare.presetGreenlandAfrica',
    countryCode: 'GL',
    targetLat: 0,
    targetLng: 20,
    camera: { lat: 5, lng: 20, altitude: 2.2 },
  },
  {
    id: 'greenland-europe',
    nameKey: 'sizeCompare.presetGreenlandEurope',
    countryCode: 'GL',
    targetLat: 52,
    targetLng: 19,
    camera: { lat: 55, lng: 19, altitude: 2.0 },
  },
  {
    id: 'brazil-europe',
    nameKey: 'sizeCompare.presetBrazilEurope',
    countryCode: 'BR',
    targetLat: 50,
    targetLng: 15,
    camera: { lat: 50, lng: 15, altitude: 2.3 },
  },
  {
    id: 'poland-med',
    nameKey: 'sizeCompare.presetPolandMed',
    countryCode: 'PL',
    targetLat: 35,
    targetLng: 18,
    camera: { lat: 38, lng: 18, altitude: 1.8 },
  },
  {
    id: 'australia-europe',
    nameKey: 'sizeCompare.presetAustraliaEurope',
    countryCode: 'AU',
    targetLat: 50,
    targetLng: 15,
    camera: { lat: 50, lng: 15, altitude: 2.2 },
  },
];

const NUMBER_LOCALES = { pl: 'pl-PL', en: 'en-US' } as const;

/** "2.19 M km² (2,189,751 km²)" / "2,19 mln km² (2 189 751 km²)" in the current locale. */
export function formatArea(km2: number): string {
  const locale = NUMBER_LOCALES[getLocale()];
  // Polish groups digits with a non-breaking space; a plain space wraps more predictably here.
  const format = (value: number, digits = 0) =>
    value
      .toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
      .replace(/\u00a0/g, ' ');
  const full = t('sizeCompare.areaKm2', { value: format(km2) });
  if (km2 >= 1_000_000) {
    return `${t('sizeCompare.areaMillionKm2', { value: format(km2 / 1_000_000, 2) })} (${full})`;
  }
  return full;
}

/**
 * Floating HUD overlay for True Size polygon comparison.
 */
export class SizeComparisonHud {
  private readonly draggable: DraggableController;
  private readonly container: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly onFlyTo?: (lat: number, lng: number, altitude?: number) => void;
  private readonly element: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private lastGlobeClick: { lat: number; lng: number } | null = null;
  private lastSelectionId: string | null = null;
  private countriesMap: Map<string, GeoFeature> = new Map();

  constructor(options: SizeComparisonHudOptions) {
    this.container = options.container;
    this.store = options.store;
    this.onFlyTo = options.onFlyTo;

    this.element = document.createElement('div');
    this.element.className = 'tl-size-hud hidden';
    this.draggable = makeDraggable(this.element, {
      handle: '.tl-size-header',
      storageKey: 'terralearn_panel_pos_size',
    });
    this.container.appendChild(this.element);

    void this.preloadCountries();
    this.bindStore();
    this.render();
  }

  private async preloadCountries(): Promise<void> {
    try {
      const data = await loadGeoData('/data/countries.json');
      for (const feat of data.features) {
        if (feat.properties.id) {
          this.countriesMap.set(feat.properties.id, feat);
        }
      }
    } catch (err) {
      console.warn('[SizeComparisonHud] Failed to load countries.json:', err);
    }
  }

  public async setCountry(
    countryCode: string,
    targetLat?: number,
    targetLng?: number,
  ): Promise<void> {
    if (this.countriesMap.size === 0) {
      await this.preloadCountries();
    }

    const feat = this.countriesMap.get(countryCode);
    if (!feat) return;

    const lat = targetLat ?? feat.properties.labelLat ?? 0;
    const lng = targetLng ?? feat.properties.labelLng ?? 0;
    const area = feat.properties.rank?.area ?? 0;
    const name = localizedName(feat.properties.name_pl, feat.properties.name_en) ?? {
      pl: countryCode,
      en: countryCode,
    };

    this.store.set({
      sizeComparison: {
        active: true,
        countryId: countryCode,
        countryName: name,
        countryAreaKm2: area,
        targetLat: lat,
        targetLng: lng,
        geometry: feat.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      },
    });
  }

  private render(): void {
    const state = this.store.get();
    const comparison = state.sizeComparison;

    if (!comparison || !comparison.active) {
      this.element.classList.add('hidden');
      while (this.element.firstChild) {
        this.element.removeChild(this.element.firstChild);
      }
      return;
    }

    this.element.classList.remove('hidden');
    while (this.element.firstChild) {
      this.element.removeChild(this.element.firstChild);
    }

    // Header
    const header = document.createElement('div');
    header.className = 'tl-size-header';

    const titleBox = document.createElement('div');
    titleBox.className = 'tl-size-title-box';

    const icon = document.createElement('span');
    icon.className = 'tl-size-icon';
    icon.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 3H3v18h18V3z"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
      ),
    );

    const title = document.createElement('h3');
    title.className = 'tl-size-title';
    title.textContent = t('sizeCompare.title');

    titleBox.appendChild(icon);
    titleBox.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tl-size-close-btn';
    closeBtn.title = t('sizeCompare.close');
    closeBtn.appendChild(
      parseSvg(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      ),
    );
    closeBtn.addEventListener('click', () => {
      this.store.set({ sizeComparison: null });
    });

    header.appendChild(titleBox);
    header.appendChild(closeBtn);
    this.element.appendChild(header);

    // Presets bar
    const presetsBar = document.createElement('div');
    presetsBar.className = 'tl-size-presets';

    const presetsLabel = document.createElement('span');
    presetsLabel.className = 'tl-size-presets-label';
    presetsLabel.textContent = t('sizeCompare.presets');
    presetsBar.appendChild(presetsLabel);

    for (const preset of SIZE_PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'tl-size-preset-btn';
      btn.textContent = t(preset.nameKey);
      btn.addEventListener('click', () => {
        void this.setCountry(preset.countryCode, preset.targetLat, preset.targetLng);
        this.onFlyTo?.(preset.camera.lat, preset.camera.lng, preset.camera.altitude);
      });
      presetsBar.appendChild(btn);
    }
    this.element.appendChild(presetsBar);

    // Body
    const body = document.createElement('div');
    body.className = 'tl-size-body';

    // Active country card
    const card = document.createElement('div');
    card.className = 'tl-size-card';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'tl-size-card-header';

    const countryName = document.createElement('span');
    countryName.className = 'tl-size-country-name';
    countryName.textContent =
      localize(comparison.countryName ?? undefined) ?? comparison.countryId ?? '—';

    const badge = document.createElement('span');
    badge.className = 'tl-size-badge';
    badge.textContent = comparison.countryId ?? '';

    cardHeader.appendChild(countryName);
    if (comparison.countryId) {
      cardHeader.appendChild(badge);
    }
    card.appendChild(cardHeader);

    // Area row
    if (comparison.countryAreaKm2) {
      const areaRow = document.createElement('div');
      areaRow.className = 'tl-size-stat-row';

      const areaLabel = document.createElement('span');
      areaLabel.className = 'tl-size-stat-label';
      areaLabel.textContent = t('sizeCompare.area');

      const areaVal = document.createElement('span');
      areaVal.className = 'tl-size-stat-val';
      areaVal.textContent = formatArea(comparison.countryAreaKm2);

      areaRow.appendChild(areaLabel);
      areaRow.appendChild(areaVal);
      card.appendChild(areaRow);

      // Area Comparison Ratio
      const ratioBox = document.createElement('div');
      ratioBox.className = 'tl-size-ratio-box';

      const africaRatio = (AFRICA_AREA_KM2 / comparison.countryAreaKm2).toFixed(1);
      const ratioAfricaText = document.createElement('div');
      ratioAfricaText.className = 'tl-size-ratio-item';
      ratioAfricaText.textContent = t('sizeCompare.ratioVsAfrica', { ratio: africaRatio });
      ratioBox.appendChild(ratioAfricaText);

      if (comparison.countryId !== 'PL') {
        const polandRatio = (comparison.countryAreaKm2 / POLAND_AREA_KM2).toFixed(1);
        const ratioPolandText = document.createElement('div');
        ratioPolandText.className = 'tl-size-ratio-item';
        ratioPolandText.textContent = t('sizeCompare.ratioVsPoland', { ratio: polandRatio });
        ratioBox.appendChild(ratioPolandText);
      }

      card.appendChild(ratioBox);
    }

    body.appendChild(card);

    // Explanation note
    const explanation = document.createElement('div');
    explanation.className = 'tl-size-explanation';
    explanation.textContent = t('sizeCompare.explanation');
    body.appendChild(explanation);

    // Moving hint
    const hint = document.createElement('div');
    hint.className = 'tl-size-hint';
    hint.appendChild(
      parseSvg(
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>',
      ),
    );
    const hintText = document.createElement('span');
    hintText.textContent = t('sizeCompare.dragHint');
    hint.appendChild(hintText);
    body.appendChild(hint);

    // Footer actions
    const footer = document.createElement('div');
    footer.className = 'tl-size-footer';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'tl-size-reset-btn';
    resetBtn.textContent = t('sizeCompare.resetPosition');
    resetBtn.addEventListener('click', () => {
      if (comparison.countryId) {
        const feat = this.countriesMap.get(comparison.countryId);
        if (feat) {
          const lat = feat.properties.labelLat ?? 0;
          const lng = feat.properties.labelLng ?? 0;
          this.store.set({
            sizeComparison: {
              ...comparison,
              targetLat: lat,
              targetLng: lng,
            },
          });
          this.onFlyTo?.(lat, lng, 1.8);
        }
      }
    });
    footer.appendChild(resetBtn);

    body.appendChild(footer);
    this.element.appendChild(body);
  }

  private handleGlobeClick(lat: number, lng: number): void {
    const current = this.store.get().sizeComparison;
    if (!current || !current.active) return;

    this.store.set({
      sizeComparison: {
        ...current,
        targetLat: lat,
        targetLng: lng,
      },
    });
  }

  private handleFeatureSelection(feat: GeoFeature): void {
    const current = this.store.get().sizeComparison;
    if (!current || !current.active) return;

    if (feat.properties.id && feat.properties.kind === 'country') {
      void this.setCountry(feat.properties.id, current.targetLat, current.targetLng);
    }
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => ({
        comparison: s.sizeComparison,
        globeClick: s.globeClick,
        selection: s.selection,
      }),
      ({ comparison, globeClick, selection }) => {
        // 1. Move ghost on raw globe click
        if (comparison?.active && globeClick && globeClick !== this.lastGlobeClick) {
          this.lastGlobeClick = globeClick;
          this.handleGlobeClick(globeClick.lat, globeClick.lng);
        }

        // 2. Switch compared country if user clicks another country
        if (comparison?.active && selection && selection.id !== this.lastSelectionId) {
          this.lastSelectionId = selection.id;
          const feat = this.countriesMap.get(selection.id);
          if (feat) {
            this.handleFeatureSelection(feat);
          }
        }

        this.render();
      },
    );
  }

  public destroy(): void {
    this.draggable.destroy();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.element.remove();
  }
}
