import type { Store, AppState } from '@/state/types';
import { shallowEqual } from '@/state/store';
import { t, setLocale, getLocale } from '@/i18n';
import { EARTH_RADIUS_KM } from '@/geo/spherical';
import { RAD2DEG } from '@/geo/astro';
import {
  MOON_RADIUS_KM,
  SPEED_OF_LIGHT_KM_S,
  calculateMoonPhase,
  calculateMoonPosition,
  type MoonPhase,
} from '@/geo/lunar';
import { calculateSunAngularDiameterDeg } from '@/geo/solar';
import { MOON_SCALE_MAX, MOON_SCALE_MIN } from '@/state/persistence';
import { makeDraggable, type DraggableController } from './draggable';
import { TopNSlider } from './components/slider';
import { formatNumber } from './facts-format';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface MoonFacts {
  diameterKm: number;
  /** Moon diameter as a share of Earth's, percent. */
  diameterPctOfEarth: number;
  distanceKm: number;
  distanceInEarthDiameters: number;
  lightTimeSeconds: number;
  apparentSizeArcmin: number;
  sunApparentSizeArcmin: number;
  phase: MoonPhase;
}

/** Everything the Moon panel shows for an instant. */
export function calculateMoonFacts(date: Date): MoonFacts {
  const { distanceKm } = calculateMoonPosition(date);
  return {
    diameterKm: 2 * MOON_RADIUS_KM,
    diameterPctOfEarth: (MOON_RADIUS_KM / EARTH_RADIUS_KM) * 100,
    distanceKm,
    distanceInEarthDiameters: distanceKm / (2 * EARTH_RADIUS_KM),
    lightTimeSeconds: distanceKm / SPEED_OF_LIGHT_KM_S,
    apparentSizeArcmin: 2 * Math.asin(MOON_RADIUS_KM / distanceKm) * RAD2DEG * 60,
    sunApparentSizeArcmin: calculateSunAngularDiameterDeg(date) * 60,
    phase: calculateMoonPhase(date),
  };
}

/**
 * SVG path of the lit part of a disc of radius `r` centred at the origin, as seen from the
 * northern hemisphere (waxing = lit on the right). Outer limb + elliptical terminator.
 */
export function moonPhasePath(illuminatedFraction: number, waxing: boolean, r: number): string {
  const k = Math.max(0, Math.min(1, illuminatedFraction));
  const rx = r * Math.abs(1 - 2 * k);
  const limbSweep = waxing ? 1 : 0;
  const gibbous = k > 0.5;
  const terminatorSweep = waxing === gibbous ? 1 : 0;
  return `M 0 ${-r} A ${r} ${r} 0 0 ${limbSweep} 0 ${r} A ${rx.toFixed(3)} ${r} 0 0 ${terminatorSweep} 0 ${-r} Z`;
}

export interface MoonCardOptions {
  container: HTMLElement;
  store: Store<AppState>;
  /** Current sky time (the sky clock); defaults to real time. */
  getDate?: () => Date;
  /** Subscribes to sky time changes; returns an unsubscribe function. */
  onTick?: (listener: (date: Date) => void) => () => void;
}

/**
 * Floating panel about the Moon: size, current distance, apparent size next to the Sun's,
 * phase, and the "size on globe" slider (1× = real scale). Opened by clicking the Moon or its
 * label; shares the card slot with the object card (opening one closes the other).
 */
export class MoonCard {
  public readonly element: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly getDate: () => Date;
  private readonly draggable: DraggableController;
  private readonly unsubs: (() => void)[] = [];
  private slider: TopNSlider | null = null;
  private values: Partial<
    Record<'diameter' | 'distance' | 'light' | 'apparent' | 'phase', HTMLElement>
  > = {};
  private phasePath: SVGPathElement | null = null;
  private scaleCaption: HTMLElement | null = null;

  constructor(options: MoonCardOptions) {
    this.store = options.store;
    this.getDate = options.getDate ?? (() => new Date());

    this.element = document.createElement('article');
    this.element.className = 'tl-info-card tl-moon-card hidden';
    this.draggable = makeDraggable(this.element, {
      handle: '.tl-card-header',
      storageKey: 'terralearn_panel_pos_moon',
    });
    options.container.appendChild(this.element);

    this.unsubs.push(
      this.store.subscribe(
        s => ({ open: s.moonPanelOpen, mode: s.mode, locale: s.locale }),
        () => this.sync(),
        // Re-render only when one of these changes, not on every store update (hover etc.)
        shallowEqual,
      ),
      // Selecting an object opens the object card in the same slot
      this.store.subscribe(
        s => s.selection,
        selection => {
          if (selection && this.store.get().moonPanelOpen) this.close();
        },
      ),
      this.store.subscribe(
        s => s.moonScale,
        scale => this.syncScale(scale),
      ),
    );
    if (options.onTick) this.unsubs.push(options.onTick(date => this.updateValues(date)));
    window.addEventListener('keydown', this.onKeyDown);
    this.sync();
  }

  public isOpen(): boolean {
    return !this.element.classList.contains('hidden');
  }

  public close(): void {
    this.store.set({ moonPanelOpen: false });
  }

  private sync(): void {
    const { moonPanelOpen, mode, locale } = this.store.get();
    if (!moonPanelOpen || mode === 'quiz') {
      this.element.classList.add('hidden');
      return;
    }
    if (getLocale() !== locale) setLocale(locale);
    this.render();
    this.element.classList.remove('hidden');
  }

  private render(): void {
    this.slider?.destroy();
    this.element.replaceChildren();
    this.element.setAttribute('aria-label', t('moon.name'));

    const header = document.createElement('header');
    header.className = 'tl-card-header';
    const titleGroup = document.createElement('div');
    titleGroup.className = 'tl-card-title-group';
    const kind = document.createElement('span');
    kind.className = 'tl-card-kind';
    kind.textContent = t('moon.kind');
    const title = document.createElement('h2');
    title.className = 'tl-card-title';
    title.textContent = t('moon.name');
    titleGroup.append(kind, title);

    const icon = this.createPhaseIcon();
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tl-card-close';
    closeBtn.setAttribute('aria-label', t('card.close'));
    closeBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    closeBtn.addEventListener('click', () => this.close());
    header.append(titleGroup, icon, closeBtn);

    const stats = document.createElement('dl');
    stats.className = 'tl-card-stats';
    const row = (label: string): HTMLElement => {
      const item = document.createElement('div');
      item.className = 'tl-card-stat-row';
      const dt = document.createElement('dt');
      dt.className = 'tl-card-stat-label';
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.className = 'tl-card-stat-value';
      item.append(dt, dd);
      stats.appendChild(item);
      return dd;
    };
    this.values = {
      diameter: row(t('moon.diameter')),
      distance: row(t('moon.distance')),
      light: row(t('moon.lightTime')),
      apparent: row(t('moon.apparentSize')),
      phase: row(t('moon.phase')),
    };

    const note = document.createElement('div');
    note.className = 'tl-card-comparison';
    const noteText = document.createElement('span');
    noteText.className = 'tl-card-comp-text';
    noteText.textContent = t('moon.eclipseNote');
    note.appendChild(noteText);

    const scaleBox = document.createElement('div');
    scaleBox.className = 'tl-moon-scale';
    this.slider = new TopNSlider({
      id: 'tl-moon-scale',
      value: this.store.get().moonScale,
      min: MOON_SCALE_MIN,
      max: MOON_SCALE_MAX,
      step: 1,
      presets: [1, 5, 10, 20],
      unitLabel: t('moon.sizeOnGlobe'),
      onChange: value => this.store.set({ moonScale: value }),
    });
    this.scaleCaption = document.createElement('p');
    this.scaleCaption.className = 'tl-moon-scale-caption';
    scaleBox.append(this.slider.element, this.scaleCaption);

    this.element.append(header, stats, note, scaleBox);
    this.syncScale(this.store.get().moonScale);
    this.updateValues(this.getDate());
  }

  private createPhaseIcon(): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'tl-moon-phase-icon');
    svg.setAttribute('viewBox', '-12 -12 24 24');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '28');
    svg.setAttribute('aria-hidden', 'true');
    const disc = document.createElementNS(SVG_NS, 'circle');
    disc.setAttribute('r', '10');
    disc.setAttribute('class', 'tl-moon-phase-dark');
    this.phasePath = document.createElementNS(SVG_NS, 'path');
    this.phasePath.setAttribute('class', 'tl-moon-phase-lit');
    svg.append(disc, this.phasePath);
    return svg;
  }

  /** Refreshes the time-dependent values (distance, apparent size, phase). */
  public updateValues(date: Date): void {
    if (!this.isOpen() && !this.store.get().moonPanelOpen) return;
    const f = calculateMoonFacts(date);
    const v = this.values;
    if (v.diameter) {
      v.diameter.textContent = t('moon.diameterValue', {
        km: formatNumber(f.diameterKm, 1),
        pct: formatNumber(f.diameterPctOfEarth),
      });
    }
    if (v.distance) {
      v.distance.textContent = t('moon.distanceValue', {
        km: formatNumber(Math.round(f.distanceKm)),
        n: formatNumber(f.distanceInEarthDiameters, 1),
      });
    }
    if (v.light) {
      v.light.textContent = t('moon.lightTimeValue', { s: formatNumber(f.lightTimeSeconds, 2) });
    }
    if (v.apparent) {
      v.apparent.textContent = t('moon.apparentSizeValue', {
        moon: formatNumber(f.apparentSizeArcmin, 1),
        sun: formatNumber(f.sunApparentSizeArcmin, 1),
      });
    }
    if (v.phase) {
      v.phase.textContent = t('moon.phaseValue', {
        name: t(`moon.phases.${f.phase.phase}`),
        pct: formatNumber(Math.round(f.phase.illuminatedFraction * 100)),
      });
    }
    this.phasePath?.setAttribute(
      'd',
      moonPhasePath(f.phase.illuminatedFraction, f.phase.waxing, 10),
    );
  }

  private syncScale(scale: number): void {
    if (this.slider && this.slider.getValue() !== scale) this.slider.setValue(scale);
    if (this.scaleCaption) {
      this.scaleCaption.textContent =
        scale === 1 ? t('moon.realScale') : t('moon.enlarged', { n: formatNumber(scale) });
      this.scaleCaption.classList.toggle('is-real', scale === 1);
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.store.get().moonPanelOpen) this.close();
  };

  public destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.unsubs.forEach(unsub => unsub());
    this.unsubs.length = 0;
    this.slider?.destroy();
    this.draggable.destroy();
    this.element.remove();
  }
}
