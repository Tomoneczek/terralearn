import { describe, it, expect, vi } from 'vitest';
import { createStore } from './store';

describe('createStore', () => {
  interface TestState {
    count: number;
    name: string;
    nested: { flag: boolean };
  }

  const initial: TestState = {
    count: 0,
    name: 'initial',
    nested: { flag: false },
  };

  it('initializes with given state and returns it via get()', () => {
    const store = createStore(initial);
    expect(store.get()).toEqual(initial);
  });

  it('updates state via object partial', () => {
    const store = createStore(initial);
    store.set({ count: 1 });
    expect(store.get().count).toBe(1);
    expect(store.get().name).toBe('initial');
  });

  it('updates state via updater function', () => {
    const store = createStore(initial);
    store.set(prev => ({ count: prev.count + 5 }));
    expect(store.get().count).toBe(5);
  });

  it('notifies subscribers only when selected slice changes', () => {
    const store = createStore(initial);
    const countListener = vi.fn();
    const nameListener = vi.fn();

    store.subscribe(s => s.count, countListener);
    store.subscribe(s => s.name, nameListener);

    store.set({ count: 42 });

    expect(countListener).toHaveBeenCalledTimes(1);
    expect(countListener).toHaveBeenCalledWith(42, 0);
    expect(nameListener).not.toHaveBeenCalled();
  });

  it('unsubscribes listener when calling returned cleanup function', () => {
    const store = createStore(initial);
    const listener = vi.fn();

    const unsubscribe = store.subscribe(s => s.count, listener);
    store.set({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.set({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports custom equality functions', () => {
    const store = createStore({ items: ['a', 'b'] });
    const listener = vi.fn();

    // Equality by length
    store.subscribe(
      s => s.items,
      listener,
      (a, b) => a.length === b.length,
    );

    store.set({ items: ['c', 'd'] }); // length still 2
    expect(listener).not.toHaveBeenCalled();

    store.set({ items: ['c', 'd', 'e'] }); // length 3
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('exports store singleton and helper methods from index', async () => {
    const stateModule = await import('./index');
    expect(stateModule.store).toBeDefined();
    expect(stateModule.createStore).toBeDefined();
    expect(stateModule.createInitialState).toBeDefined();
    expect(stateModule.serializeStateToUrl).toBeDefined();
    expect(stateModule.parseStateFromUrl).toBeDefined();
  });
});
