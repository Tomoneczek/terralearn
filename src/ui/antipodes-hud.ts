import { parseSvg } from './dom';
import type { Store, AppState } from '@/state/types';
import { antipode } from '@/geo/spherical';
import { detectLocationAtCoords, type OceanId } from '@/geo/antipodes-detector';
import { loadGeoData, type GeoFeatureCollection } from '@/globe/data-loader';
import { t, getLocale, localize, localizedName, type I18nKey, type LocalizedText } from '@/i18n';

export interface AntipodesHudOptions {
  container: HTMLElement;
  store: Store<AppState>;
  onFlyTo?: (lat: number, lng: number, altitude?: number) => void;
}

export interface AntipodePresetItem {
  id: string;
  nameKey: I18nKey;
  source: { lat: number; lng: number; label: LocalizedText };
  cameraA: { lat: number; lng: number; altitude: number };
  cameraB: { lat: number; lng: number; altitude: number };
}

export const ANTIPODE_PRESETS: AntipodePresetItem[] = [
  {
    id: 'warsaw-pacific',
    nameKey: 'antipodes.presetWarsawPacific',
    source: { lat: 52.23, lng: 21.01, label: { pl: 'Warszawa', en: 'Warsaw' } },
    cameraA: { lat: 52, lng: 21, altitude: 2.0 },
    cameraB: { lat: -52, lng: -159, altitude: 2.0 },
  },
  {
    id: 'madrid-nz',
    nameKey: 'antipodes.presetMadridNz',
    source: { lat: 40.41, lng: -3.7, label: { pl: 'Madryt', en: 'Madrid' } },
    cameraA: { lat: 40, lng: -4, altitude: 2.0 },
    cameraB: { lat: -40, lng: 176, altitude: 2.0 },
  },
  {
    id: 'beijing-argentina',
    nameKey: 'antipodes.presetBeijingArgentina',
    source: { lat: 39.9, lng: 116.4, label: { pl: 'Pekin', en: 'Beijing' } },
    cameraA: { lat: 40, lng: 116, altitude: 2.0 },
    cameraB: { lat: -40, lng: -64, altitude: 2.0 },
  },
  {
    id: 'bogota-indonesia',
    nameKey: 'antipodes.presetBogotaIndonesia',
    source: { lat: 4.71, lng: -74.07, label: { pl: 'Bogota', en: 'Bogotá' } },
    cameraA: { lat: 5, lng: -74, altitude: 2.0 },
    cameraB: { lat: -5, lng: 106, altitude: 2.0 },
  },
  {
    id: 'hawaii-botswana',
    nameKey: 'antipodes.presetHawaiiBotswana',
    source: { lat: 19.89, lng: -155.58, label: { pl: 'Hawaje', en: 'Hawaii' } },
    cameraA: { lat: 20, lng: -156, altitude: 2.0 },
    cameraB: { lat: -20, lng: 24, altitude: 2.0 },
  },
];

/**
 * Floating HUD overlay for the Antipodes Simulator.
 */
const OCEAN_KEY_MAP: Record<OceanId, I18nKey> = {
  arctic: 'antipodes.oceanArctic',
  southern: 'antipodes.oceanSouthern',
  atlantic: 'antipodes.oceanAtlantic',
  indian: 'antipodes.oceanIndian',
  pacific: 'antipodes.oceanPacific',
};

export class AntipodesHud {
  private readonly container: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly onFlyTo?: (lat: number, lng: number, altitude?: number) => void;
  private readonly element: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private lastGlobeClick: { lat: number; lng: number } | null = null;
  private lastSelectionId: string | null = null;
  private countriesData: GeoFeatureCollection | null = null;

  constructor(options: AntipodesHudOptions) {
    this.container = options.container;
    this.store = options.store;
    this.onFlyTo = options.onFlyTo;

    this.element = document.createElement('div');
    this.element.className = 'tl-antipodes-hud hidden';
    this.container.appendChild(this.element);

    void this.preloadCountries();
    this.bindStore();
    this.render();
  }

  private async preloadCountries(): Promise<void> {
    try {
      this.countriesData = await loadGeoData('/data/countries.json');
    } catch (err) {
      console.warn('[AntipodesHud] Could not load countries.json:', err);
    }
  }

  public async setPoint(lat: number, lng: number, label?: LocalizedText): Promise<void> {
    if (!this.countriesData) {
      await this.preloadCountries();
    }

    const anti = antipode({ lat, lng });
    const loc = detectLocationAtCoords(anti.lat, anti.lng, this.countriesData ?? undefined);
    let locationName: string;
    if (loc.isLand) {
      const isEn = getLocale() === 'en';
      locationName = (isEn ? loc.countryName_en : loc.countryName_pl) ?? t('antipodes.land');
    } else if (loc.oceanId) {
      const key = OCEAN_KEY_MAP[loc.oceanId];
      locationName = key ? t(key) : t('antipodes.ocean');
    } else {
      locationName = t('antipodes.ocean');
    }

    this.store.set({
      antipodes: {
        active: true,
        source: { lat, lng, label },
        antipode: {
          lat: anti.lat,
          lng: anti.lng,
          locationName,
          isLand: loc.isLand,
        },
      },
    });
  }

  private render(): void {
    const state = this.store.get();
    const antipodes = state.antipodes;

    if (!antipodes || !antipodes.active) {
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
    header.className = 'tl-antipodes-header';

    const titleBox = document.createElement('div');
    titleBox.className = 'tl-antipodes-title-box';

    const icon = document.createElement('span');
    icon.className = 'tl-antipodes-icon';
    icon.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="3"/></svg>',
      ),
    );

    const title = document.createElement('h3');
    title.className = 'tl-antipodes-title';
    title.textContent = t('antipodes.title');

    titleBox.appendChild(icon);
    titleBox.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tl-antipodes-close-btn';
    closeBtn.title = t('antipodes.close');
    closeBtn.appendChild(
      parseSvg(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      ),
    );
    closeBtn.addEventListener('click', () => {
      this.store.set({ antipodes: null });
    });

    header.appendChild(titleBox);
    header.appendChild(closeBtn);
    this.element.appendChild(header);

    // Presets bar
    const presetsBar = document.createElement('div');
    presetsBar.className = 'tl-antipodes-presets';

    const presetsLabel = document.createElement('span');
    presetsLabel.className = 'tl-antipodes-presets-label';
    presetsLabel.textContent = t('antipodes.presets');
    presetsBar.appendChild(presetsLabel);

    for (const preset of ANTIPODE_PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'tl-antipodes-preset-btn';
      btn.textContent = t(preset.nameKey);
      btn.addEventListener('click', () => {
        void this.setPoint(preset.source.lat, preset.source.lng, preset.source.label);
        this.onFlyTo?.(preset.cameraA.lat, preset.cameraA.lng, preset.cameraA.altitude);
      });
      presetsBar.appendChild(btn);
    }
    this.element.appendChild(presetsBar);

    // Body
    const body = document.createElement('div');
    body.className = 'tl-antipodes-body';

    const { source, antipode: anti } = antipodes;

    if (source && anti) {
      // Comparison cards
      const row = document.createElement('div');
      row.className = 'tl-antipodes-row';

      // Card A (Source)
      const cardA = document.createElement('div');
      cardA.className = 'tl-antipodes-card source-card';

      const labelA = document.createElement('span');
      labelA.className = 'tl-card-badge badge-a';
      labelA.textContent = 'A';

      const nameA = document.createElement('div');
      nameA.className = 'tl-card-name';
      nameA.textContent =
        localize(source.label) ?? `${source.lat.toFixed(1)}°, ${source.lng.toFixed(1)}°`;

      const coordsA = document.createElement('div');
      coordsA.className = 'tl-card-coords';
      coordsA.textContent = `${source.lat.toFixed(2)}° N, ${source.lng.toFixed(2)}° E`;

      cardA.appendChild(labelA);
      cardA.appendChild(nameA);
      cardA.appendChild(coordsA);
      row.appendChild(cardA);

      // Shaft tunnel arrow
      const shaft = document.createElement('div');
      shaft.className = 'tl-antipodes-shaft';
      shaft.textContent = '⮂';
      row.appendChild(shaft);

      // Card B (Antipode)
      const cardB = document.createElement('div');
      cardB.className = 'tl-antipodes-card antipode-card';

      const labelB = document.createElement('span');
      labelB.className = 'tl-card-badge badge-b';
      labelB.textContent = 'B';

      const nameB = document.createElement('div');
      nameB.className = 'tl-card-name';
      nameB.textContent = anti.locationName ?? `${anti.lat.toFixed(1)}°, ${anti.lng.toFixed(1)}°`;

      const coordsB = document.createElement('div');
      coordsB.className = 'tl-card-coords';
      coordsB.textContent = `${anti.lat.toFixed(2)}° N, ${anti.lng.toFixed(2)}° E`;

      const landBadge = document.createElement('span');
      landBadge.className = `tl-nature-badge ${anti.isLand ? 'is-land' : 'is-ocean'}`;
      landBadge.textContent = anti.isLand ? t('antipodes.land') : t('antipodes.ocean');

      cardB.appendChild(labelB);
      cardB.appendChild(nameB);
      cardB.appendChild(coordsB);
      cardB.appendChild(landBadge);
      row.appendChild(cardB);

      body.appendChild(row);

      // Camera navigation buttons
      const navBar = document.createElement('div');
      navBar.className = 'tl-antipodes-nav';

      const btnFlyB = document.createElement('button');
      btnFlyB.className = 'tl-nav-btn fly-to-b';
      btnFlyB.textContent = t('antipodes.flyToAntipode');
      btnFlyB.addEventListener('click', () => {
        this.onFlyTo?.(anti.lat, anti.lng, 1.8);
      });

      const btnFlyA = document.createElement('button');
      btnFlyA.className = 'tl-nav-btn fly-to-a';
      btnFlyA.textContent = t('antipodes.flyToSource');
      btnFlyA.addEventListener('click', () => {
        this.onFlyTo?.(source.lat, source.lng, 1.8);
      });

      navBar.appendChild(btnFlyB);
      navBar.appendChild(btnFlyA);
      body.appendChild(navBar);
    }

    // Explanation note
    const explanation = document.createElement('div');
    explanation.className = 'tl-antipodes-explanation';
    explanation.textContent = t('antipodes.explanation');
    body.appendChild(explanation);

    // Pick hint
    const hint = document.createElement('div');
    hint.className = 'tl-antipodes-hint';
    hint.appendChild(
      parseSvg(
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>',
      ),
    );
    const hintText = document.createElement('span');
    hintText.textContent = t('antipodes.pickHint');
    hint.appendChild(hintText);
    body.appendChild(hint);

    this.element.appendChild(body);
  }

  private handlePointSelected(lat: number, lng: number, label?: LocalizedText): void {
    const current = this.store.get().antipodes;
    if (!current || !current.active) return;
    void this.setPoint(lat, lng, label);
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => ({
        antipodes: s.antipodes,
        globeClick: s.globeClick,
        selection: s.selection,
      }),
      ({ antipodes, globeClick, selection }) => {
        // 1. Globe click updates Point A
        if (antipodes?.active && globeClick && globeClick !== this.lastGlobeClick) {
          this.lastGlobeClick = globeClick;
          this.handlePointSelected(globeClick.lat, globeClick.lng);
        }

        // 2. Feature selection updates Point A
        if (antipodes?.active && selection && selection.id !== this.lastSelectionId) {
          this.lastSelectionId = selection.id;
          if (selection.lat !== undefined && selection.lng !== undefined) {
            this.handlePointSelected(
              selection.lat,
              selection.lng,
              localizedName(selection.name_pl || selection.name, selection.name_en),
            );
          }
        }

        this.render();
      },
    );
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.element.remove();
  }
}
