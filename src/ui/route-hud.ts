import { parseSvg } from './dom';
import type { Store, AppState, RoutePoint } from '@/state/types';
import { haversineDistanceKm, rhumbLine } from '@/geo/spherical';
import { t } from '@/i18n';

export interface RouteHudOptions {
  container: HTMLElement;
  store: Store<AppState>;
  onFlyTo?: (lat: number, lng: number, altitude?: number) => void;
}

export interface RoutePresetItem {
  id: string;
  name: string;
  from: RoutePoint;
  to: RoutePoint;
  camera: { lat: number; lng: number; altitude: number };
}

export const ROUTE_PRESETS: RoutePresetItem[] = [
  {
    id: 'warsaw-tokyo',
    name: 'Warszawa → Tokio',
    from: { lat: 52.23, lng: 21.01, label: 'Warszawa' },
    to: { lat: 35.68, lng: 139.76, label: 'Tokio' },
    camera: { lat: 58, lng: 80, altitude: 2.2 },
  },
  {
    id: 'london-sf',
    name: 'Londyn → San Francisco',
    from: { lat: 51.51, lng: -0.13, label: 'Londyn' },
    to: { lat: 37.77, lng: -122.42, label: 'San Francisco' },
    camera: { lat: 60, lng: -60, altitude: 2.2 },
  },
  {
    id: 'ny-singapore',
    name: 'Nowy Jork → Singapur',
    from: { lat: 40.71, lng: -74.01, label: 'Nowy Jork' },
    to: { lat: 1.35, lng: 103.82, label: 'Singapur' },
    camera: { lat: 70, lng: 20, altitude: 2.5 },
  },
];

/**
 * Floating HUD overlay for spherical route comparison (Orthodrome vs Loxodrome).
 */
export class RouteHud {
  private readonly container: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly onFlyTo?: (lat: number, lng: number, altitude?: number) => void;
  private readonly element: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private lastGlobeClick: { lat: number; lng: number } | null = null;
  private lastSelectionId: string | null = null;

  constructor(options: RouteHudOptions) {
    this.container = options.container;
    this.store = options.store;
    this.onFlyTo = options.onFlyTo;

    this.element = document.createElement('div');
    this.element.className = 'tl-route-hud hidden';
    this.container.appendChild(this.element);

    this.bindStore();
    this.render();
  }

  private render(): void {
    const state = this.store.get();
    const comparison = state.routeComparison;

    if (!comparison || !comparison.active) {
      this.element.classList.add('hidden');
      this.element.innerHTML = '';
      return;
    }

    this.element.classList.remove('hidden');
    this.element.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'tl-route-header';

    const titleBox = document.createElement('div');
    titleBox.className = 'tl-route-title-box';

    const icon = document.createElement('span');
    icon.className = 'tl-route-icon';
    icon.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
      ),
    );

    const title = document.createElement('h3');
    title.className = 'tl-route-title';
    title.textContent = t('route.title');

    titleBox.appendChild(icon);
    titleBox.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tl-route-close-btn';
    closeBtn.title = t('route.close');
    closeBtn.appendChild(
      parseSvg(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      ),
    );
    closeBtn.addEventListener('click', () => {
      this.store.set({ routeComparison: null });
    });

    header.appendChild(titleBox);
    header.appendChild(closeBtn);
    this.element.appendChild(header);

    // Presets bar
    const presetsBar = document.createElement('div');
    presetsBar.className = 'tl-route-presets';

    const presetsLabel = document.createElement('span');
    presetsLabel.className = 'tl-route-presets-label';
    presetsLabel.textContent = t('route.presets');
    presetsBar.appendChild(presetsLabel);

    for (const preset of ROUTE_PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'tl-route-preset-btn';
      btn.textContent = preset.name;
      btn.addEventListener('click', () => {
        this.store.set({
          routeComparison: {
            active: true,
            from: preset.from,
            to: preset.to,
          },
        });
        this.onFlyTo?.(preset.camera.lat, preset.camera.lng, preset.camera.altitude);
      });
      presetsBar.appendChild(btn);
    }
    this.element.appendChild(presetsBar);

    // Body content based on selection stage
    const body = document.createElement('div');
    body.className = 'tl-route-body';

    const { from, to } = comparison;

    if (!from) {
      const prompt = document.createElement('div');
      prompt.className = 'tl-route-prompt';
      prompt.textContent = t('route.pickStart');
      body.appendChild(prompt);
    } else if (from && !to) {
      const startCard = document.createElement('div');
      startCard.className = 'tl-route-point-row';

      const badgeA = document.createElement('span');
      badgeA.className = 'tl-point-badge point-a';
      badgeA.textContent = 'A';

      const labelA = document.createElement('span');
      labelA.className = 'tl-point-label';
      labelA.textContent = from.label ?? `${from.lat.toFixed(1)}°, ${from.lng.toFixed(1)}°`;

      startCard.appendChild(badgeA);
      startCard.appendChild(labelA);
      body.appendChild(startCard);

      const prompt = document.createElement('div');
      prompt.className = 'tl-route-prompt';
      prompt.textContent = t('route.pickEnd');
      body.appendChild(prompt);
    } else if (from && to) {
      // Points overview
      const pointsRow = document.createElement('div');
      pointsRow.className = 'tl-route-endpoints';

      const endA = document.createElement('div');
      endA.className = 'tl-route-endpoint';
      const badgeA = document.createElement('span');
      badgeA.className = 'tl-point-badge point-a';
      badgeA.textContent = 'A';
      const nameA = document.createElement('span');
      nameA.className = 'tl-point-name';
      nameA.textContent = from.label ?? `${from.lat.toFixed(1)}°, ${from.lng.toFixed(1)}°`;
      endA.appendChild(badgeA);
      endA.appendChild(nameA);

      const arrow = document.createElement('span');
      arrow.className = 'tl-route-arrow';
      arrow.textContent = '➔';

      const endB = document.createElement('div');
      endB.className = 'tl-route-endpoint';
      const badgeB = document.createElement('span');
      badgeB.className = 'tl-point-badge point-b';
      badgeB.textContent = 'B';
      const nameB = document.createElement('span');
      nameB.className = 'tl-point-name';
      nameB.textContent = to.label ?? `${to.lat.toFixed(1)}°, ${to.lng.toFixed(1)}°`;
      endB.appendChild(badgeB);
      endB.appendChild(nameB);

      pointsRow.appendChild(endA);
      pointsRow.appendChild(arrow);
      pointsRow.appendChild(endB);
      body.appendChild(pointsRow);

      // Distances calculation
      const orthoDist = haversineDistanceKm(from.lat, from.lng, to.lat, to.lng);
      const rhumbPts = rhumbLine(from, to, 100);
      let rhumbDist = 0;
      for (let i = 0; i < rhumbPts.length - 1; i++) {
        const p1 = rhumbPts[i];
        const p2 = rhumbPts[i + 1];
        if (p1 && p2) {
          rhumbDist += haversineDistanceKm(p1.lat, p1.lng, p2.lat, p2.lng);
        }
      }
      rhumbDist = Math.round(rhumbDist);

      const diffKm = rhumbDist - orthoDist;
      const diffPercent = orthoDist > 0 ? (diffKm / orthoDist) * 100 : 0;

      // Comparative Cards
      const metricsGrid = document.createElement('div');
      metricsGrid.className = 'tl-route-metrics-grid';

      const createMetricCard = (
        cls: string,
        dotCls: string | null,
        cardTitle: string,
        value: string,
        subValue?: string,
      ) => {
        const card = document.createElement('div');
        card.className = `tl-metric-card ${cls}`;

        const headerEl = document.createElement('div');
        headerEl.className = 'tl-metric-header';

        if (dotCls) {
          const dot = document.createElement('span');
          dot.className = `tl-metric-dot ${dotCls}`;
          headerEl.appendChild(dot);
        }

        const titleEl = document.createElement('span');
        titleEl.className = 'tl-metric-title';
        titleEl.textContent = cardTitle;
        headerEl.appendChild(titleEl);

        const valEl = document.createElement('div');
        valEl.className = cls === 'diff' ? 'tl-metric-diff-value' : 'tl-metric-value';
        valEl.textContent = value;

        if (subValue) {
          const subEl = document.createElement('span');
          subEl.className = 'tl-diff-pct';
          subEl.textContent = ` ${subValue}`;
          valEl.appendChild(subEl);
        }

        card.appendChild(headerEl);
        card.appendChild(valEl);
        return card;
      };

      metricsGrid.appendChild(
        createMetricCard(
          'ortho',
          'ortho',
          t('route.orthodrome'),
          `${orthoDist.toLocaleString()} km`,
        ),
      );
      metricsGrid.appendChild(
        createMetricCard(
          'rhumb',
          'rhumb',
          t('route.rhumbLine'),
          `${rhumbDist.toLocaleString()} km`,
        ),
      );
      metricsGrid.appendChild(
        createMetricCard(
          'diff',
          null,
          t('route.difference'),
          `+${diffKm.toLocaleString()} km`,
          `(+${diffPercent.toFixed(1)}%)`,
        ),
      );

      body.appendChild(metricsGrid);

      // Educational insight
      const note = document.createElement('div');
      note.className = 'tl-route-explanation';
      note.textContent = t('route.explanation');
      body.appendChild(note);
    }

    this.element.appendChild(body);

    // Footer actions
    const footer = document.createElement('div');
    footer.className = 'tl-route-footer';

    if (from || to) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'tl-btn tl-btn-subtle';
      clearBtn.textContent = t('route.clear');
      clearBtn.addEventListener('click', () => {
        this.store.set({
          routeComparison: {
            active: true,
            from: null,
            to: null,
          },
        });
      });
      footer.appendChild(clearBtn);
    }

    this.element.appendChild(footer);
  }

  private handleMapClick(lat: number, lng: number, label?: string): void {
    const state = this.store.get();
    const comparison = state.routeComparison;
    if (!comparison || !comparison.active) return;

    if (!comparison.from) {
      this.store.set({
        routeComparison: {
          active: true,
          from: { lat, lng, label },
          to: null,
        },
      });
    } else if (comparison.from && !comparison.to) {
      this.store.set({
        routeComparison: {
          active: true,
          from: comparison.from,
          to: { lat, lng, label },
        },
      });
    }
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => ({
        comparison: s.routeComparison,
        globeClick: s.globeClick,
        selection: s.selection,
      }),
      ({ comparison, globeClick, selection }) => {
        // 1. Handle feature selection click
        if (comparison?.active && selection && selection.id !== this.lastSelectionId) {
          this.lastSelectionId = selection.id;
          if (selection.lat !== undefined && selection.lng !== undefined) {
            this.handleMapClick(selection.lat, selection.lng, selection.name_pl || selection.name);
          }
        }

        // 2. Handle raw globe click
        if (comparison?.active && globeClick && globeClick !== this.lastGlobeClick) {
          this.lastGlobeClick = globeClick;
          this.handleMapClick(globeClick.lat, globeClick.lng);
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
