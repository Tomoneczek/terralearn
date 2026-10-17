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
    hiddenLabels: false,
    selection: null,
    hovered: null,
    globeClick: null,
    routeComparison: null,
    sizeComparison: null,
    antipodes: null,
  };
}

interface Subscription<T, V> {
  selector: Selector<T, V>;
  listener: Listener<V>;
  equalityFn: EqualityFn<V>;
  lastValue: V;
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
