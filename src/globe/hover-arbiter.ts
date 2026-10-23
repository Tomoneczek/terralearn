import type { Store, AppState, FeatureRef } from '@/state/types';

/**
 * Decides the single `hovered` feature when two independent pickers compete: globe.gl (polygons,
 * paths, points) and the capitals layer (own shader points, own hit-test). A hovered capital wins
 * over whatever globe.gl reports underneath, and the globe.gl hover is restored as soon as the
 * pointer leaves the capital.
 */
export class HoverArbiter {
  private globeHover: FeatureRef | null = null;
  private capitalHover: FeatureRef | null = null;

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

  /** True while the pointer is over a capital: globe.gl clicks/hovers must not override it. */
  public isCapitalClaimed(): boolean {
    return this.capitalHover !== null;
  }

  private apply(): void {
    const winner = this.capitalHover ?? this.globeHover;
    if (this.container) {
      this.container.style.cursor = winner ? 'pointer' : 'default';
    }
    if (this.store.get().hovered?.id !== winner?.id) {
      this.store.set({ hovered: winner });
    }
  }
}
