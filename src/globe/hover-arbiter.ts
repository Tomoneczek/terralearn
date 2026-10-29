import type { Store, AppState, FeatureRef } from '@/state/types';

/**
 * Decides the single `hovered` feature when two independent pickers compete: globe.gl (polygons,
 * paths, points) and the capitals layer (own shader points, own hit-test). A hovered capital wins
 * over whatever globe.gl reports underneath, and the globe.gl hover is restored as soon as the
 * pointer leaves the capital. The population grid has the lowest priority: it only shows when
 * nothing else is under the pointer, and it is informational (no pointer cursor, not clickable).
 * The Moon (own screen-space hit test) beats everything: it is in front of whatever lies behind it.
 */
export class HoverArbiter {
  private globeHover: FeatureRef | null = null;
  private capitalHover: FeatureRef | null = null;
  private populationHover: FeatureRef | null = null;
  private moonHover = false;
  /** False while the pointer is outside the globe (e.g. over the sidebar). */
  private pointerInside = true;

  constructor(
    private readonly store: Store<AppState>,
    private readonly container: HTMLElement | null = null,
  ) {}

  public setGlobeHover(ref: FeatureRef | null): void {
    this.globeHover = ref;
    this.apply();
  }

  public setCapitalHover(ref: FeatureRef | null): void {
    this.capitalHover = ref;
    this.apply();
  }

  public setPopulationHover(ref: FeatureRef | null): void {
    if (ref?.id === this.populationHover?.id) return;
    this.populationHover = ref;
    this.apply();
  }

  public setMoonHover(hovered: boolean): void {
    if (hovered === this.moonHover) return;
    this.moonHover = hovered;
    this.apply();
  }

  /**
   * globe.gl keeps its last hovered object when the pointer leaves the canvas, so the tooltip
   * stayed on top of the sidebar. Hovers are suppressed while outside but remembered: globe.gl
   * will not report the same object again when the pointer comes back over it.
   */
  public setPointerInside(inside: boolean): void {
    if (inside === this.pointerInside) return;
    this.pointerInside = inside;
    this.apply();
  }

  /** True while the pointer is over a capital: globe.gl clicks/hovers must not override it. */
  public isCapitalClaimed(): boolean {
    return this.capitalHover !== null;
  }

  /** True while the pointer is over the Moon: nothing behind it may be clicked. */
  public isMoonClaimed(): boolean {
    return this.moonHover && this.pointerInside;
  }

  /** True while a capital or the Moon owns the pointer: globe.gl clicks must be ignored. */
  public isClaimed(): boolean {
    return this.isCapitalClaimed() || this.isMoonClaimed();
  }

  private apply(): void {
    const moon = this.isMoonClaimed();
    const feature = this.pointerInside && !moon ? (this.capitalHover ?? this.globeHover) : null;
    const winner = feature ?? (this.pointerInside && !moon ? this.populationHover : null);
    if (this.container) {
      this.container.style.cursor = feature || moon ? 'pointer' : 'default';
    }
    if (this.store.get().hovered?.id !== winner?.id) {
      this.store.set({ hovered: winner });
    }
  }
}
