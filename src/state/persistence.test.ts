import { describe, it, expect, beforeEach } from 'vitest';
import { savePersistedState, loadPersistedState, applyPersistedState } from './persistence';
import { createInitialState } from './store';

describe('State Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads valid state from localStorage', () => {
    const state = createInitialState();
    state.theme = 'classic';
    state.dayNight = false;
    state.layers.lakes.enabled = false;

    savePersistedState(state);
    const loaded = loadPersistedState();

    expect(loaded).not.toBeNull();
    expect(loaded?.theme).toBe('classic');
    expect(loaded?.dayNight).toBe(false);
    expect(loaded?.layers?.lakes?.enabled).toBe(false);
  });

  it('handles corrupted localStorage JSON gracefully', () => {
    localStorage.setItem('terralearn_state_v1', '{ invalid json ...');
    const loaded = loadPersistedState();
    expect(loaded).toBeNull();
  });

  it('rejects invalid schema types gracefully', () => {
    localStorage.setItem(
      'terralearn_state_v1',
      JSON.stringify({
        theme: 'unsupported_theme_value',
        dayNight: 'not_a_boolean',
      }),
    );
    const loaded = loadPersistedState();
    expect(loaded).toBeNull();
  });

  it('merges persisted state into base state correctly', () => {
    const base = createInitialState();
    const persisted = {
      theme: 'classic' as const,
      dayNight: false,
      layers: {
        lakes: { enabled: false, topN: 35 },
      },
    };

    const merged = applyPersistedState(base, persisted);
    expect(merged.theme).toBe('classic');
    expect(merged.dayNight).toBe(false);
    expect(merged.layers.lakes.enabled).toBe(false);
    expect(merged.layers.lakes.topN).toBe(35);
    // Other layers remain untouched
    expect(merged.layers.borders.enabled).toBe(base.layers.borders.enabled);
  });
});
