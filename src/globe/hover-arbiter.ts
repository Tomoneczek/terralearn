import type { Store, AppState, FeatureRef } from '@/state/types';

/**
 * Decides the single `hovered` feature when two independent pickers compete: globe.gl (polygons,
 * paths, points) and the capitals layer (own shader points, own hit-test). A hovered capital wins
 * over whatever globe.gl reports underneath, and the globe.gl hover is restored as soon as the
 * pointer leaves the capital. The population grid has the lowest priority: it only shows when
 * nothing else is under the pointer, and it is informational (no pointer cursor, not clickable).
 */
export class HoverArbiter {
  private globeHover: FeatureRef | null = null;
  private capitalHover: FeatureRef | null = null;
  private populationHover: FeatureRef | null = null;

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

  /** True while the pointer is over a capital: globe.gl clicks/hovers must not override it. */
  public isCapitalClaimed(): boolean {
    return this.capitalHover !== null;
  }

  private apply(): void {
    const feature = this.capitalHover ?? this.globeHover;
    const winner = feature ?? this.populationHover;
    if (this.container) {
      this.container.style.cursor = feature ? 'pointer' : 'default';
    }
    if (this.store.get().hovered?.id !== winner?.id) {
      this.store.set({ hovered: winner });
    }
  }
}
