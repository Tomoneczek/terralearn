import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState, FeatureRef, Store } from '@/state/types';
import { HoverArbiter } from '@/globe/hover-arbiter';

const ref = (id: string, kind = 'country'): FeatureRef => ({
  id,
  layerId: 'countriesTopN',
  kind,
});

describe('HoverArbiter', () => {
  let store: Store<AppState>;
  let container: HTMLElement;
  let arbiter: HoverArbiter;

  beforeEach(() => {
    store = createStore<AppState>(createInitialState());
    container = document.createElement('div');
    arbiter = new HoverArbiter(store, container);
  });

  it('passes globe.gl hover through when no capital is hovered', () => {
    arbiter.setGlobeHover(ref('PL'));
    expect(store.get().hovered?.id).toBe('PL');
    expect(container.style.cursor).toBe('pointer');

    arbiter.setGlobeHover(null);
    expect(store.get().hovered).toBeNull();
    expect(container.style.cursor).toBe('default');
  });

  it('lets a hovered capital win over the country underneath', () => {
    arbiter.setGlobeHover(ref('PL'));
    arbiter.setCapitalHover(ref('capital-warsaw', 'capital'));

    expect(store.get().hovered?.id).toBe('capital-warsaw');
    expect(arbiter.isCapitalClaimed()).toBe(true);

    // globe.gl keeps reporting the country while the pointer is over the capital
    arbiter.setGlobeHover(ref('PL'));
    expect(store.get().hovered?.id).toBe('capital-warsaw');
  });

  // Regression guard for the hand-over: leaving the capital must restore what globe.gl reported
  // meanwhile, otherwise the country stays un-highlighted until the pointer changes object.
  it('restores the globe.gl hover when the pointer leaves the capital', () => {
    arbiter.setGlobeHover(ref('PL'));
    arbiter.setCapitalHover(ref('capital-warsaw', 'capital'));
    arbiter.setGlobeHover(ref('DE'));
    arbiter.setCapitalHover(null);

    expect(arbiter.isCapitalClaimed()).toBe(false);
    expect(store.get().hovered?.id).toBe('DE');
  });

  it('clears the hover and resets the cursor when nothing is underneath', () => {
    arbiter.setCapitalHover(ref('capital-warsaw', 'capital'));
    arbiter.setCapitalHover(null);
    expect(store.get().hovered).toBeNull();
    expect(container.style.cursor).toBe('default');
  });

  it('does not write to the store when the winner did not change', () => {
    let updates = 0;
    store.subscribe(
      s => s.hovered?.id,
      () => {
        updates++;
      },
    );
    arbiter.setGlobeHover(ref('PL'));
    arbiter.setGlobeHover(ref('PL'));
    expect(updates).toBe(1);
  });

  it('works without a container', () => {
    const bare = new HoverArbiter(store);
    bare.setGlobeHover(ref('PL'));
    expect(store.get().hovered?.id).toBe('PL');
  });

  describe('population grid (lowest priority)', () => {
    const cell = (h3: string): FeatureRef => ({
      id: `population-${h3}`,
      layerId: 'populationDensity',
      kind: 'populationDensity',
      value: 120,
    });

    it('shows the density only when nothing else is under the pointer, without a pointer cursor', () => {
      arbiter.setPopulationHover(cell('831f53fffffffff'));
      expect(store.get().hovered?.id).toBe('population-831f53fffffffff');
      expect(container.style.cursor).toBe('default');

      arbiter.setGlobeHover(ref('PL'));
      expect(store.get().hovered?.id).toBe('PL');
      expect(container.style.cursor).toBe('pointer');

      arbiter.setGlobeHover(null);
      expect(store.get().hovered?.id).toBe('population-831f53fffffffff');
    });

    it('loses to a hovered capital and clears when the layer reports nothing', () => {
      arbiter.setPopulationHover(cell('831f53fffffffff'));
      arbiter.setCapitalHover(ref('capital-warsaw', 'capital'));
      expect(store.get().hovered?.id).toBe('capital-warsaw');

      arbiter.setCapitalHover(null);
      arbiter.setPopulationHover(null);
      expect(store.get().hovered).toBeNull();
    });
  });
});
