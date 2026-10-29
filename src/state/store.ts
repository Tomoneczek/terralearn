import type { AppState, Store, Selector, Listener, EqualityFn } from './types';
import { defaultLayersState } from '@/layers';

export function createInitialState(): AppState {
  return {
    layers: defaultLayersState(),
    mode: 'explore',
    preset: 'custom',
    theme: 'dark',
    dayNight: true,
    clouds: true,
    quality: 'auto',
    graticule: 'off',
    locale: 'en',
    hiddenLabels: false,
    hideSelectionLabel: false,
    knowledgeMap: false,
    selection: null,
    hovered: null,
    globeClick: null,
    routeComparison: null,
    sizeComparison: null,
    antipodes: null,
    moonScale: 1,
    moonPanelOpen: false,
  };
}

interface Subscription<T, V> {
  selector: Selector<T, V>;
  listener: Listener<V>;
  equalityFn: EqualityFn<V>;
  lastValue: V;
}

/**
 * Field-by-field `Object.is` comparison of two plain objects. Pass it as `equalityFn` when a
 * selector builds a new object (`s => ({ a: s.a, b: s.b })`): with the default `Object.is` such
 * a selector differs on every update, so the listener would run on every `store.set`.
 */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  const keysA = Object.keys(a) as (keyof T)[];
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every(
    key => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]),
  );
}

export function createStore<T extends object>(initialState: T): Store<T> {
  let state = { ...initialState };
  // Using any in subscription set to allow heterogeneous selector types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptions = new Set<Subscription<T, any>>();

  return {
    get(): T {
      return state;
    },

    set(updater): void {
      const prevState = state;
      const nextPartial = typeof updater === 'function' ? updater(prevState) : updater;
      const nextState = { ...prevState, ...nextPartial };

      state = nextState;

      for (const sub of subscriptions) {
        try {
          const nextVal = sub.selector(nextState);
          const prevVal = sub.lastValue;

          if (!sub.equalityFn(prevVal, nextVal)) {
            sub.lastValue = nextVal;
            sub.listener(nextVal, prevVal);
          }
        } catch (err) {
          console.error('Error in store subscription listener:', err);
        }
      }
    },

    subscribe<V = T>(
      selector: Selector<T, V>,
      listener: Listener<V>,
      equalityFn: EqualityFn<V> = Object.is,
    ): () => void {
      const initialVal = selector(state);
      const sub: Subscription<T, V> = {
        selector,
        listener,
        equalityFn,
        lastValue: initialVal,
      };

      subscriptions.add(sub);

      return () => {
        subscriptions.delete(sub);
      };
    },
  };
}

export const store = createStore<AppState>(createInitialState());
