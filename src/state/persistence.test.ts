import { describe, it, expect, beforeEach } from 'vitest';
import {
  savePersistedState,
  loadPersistedState,
  applyPersistedState,
  clearPersistedState,
} from './persistence';
import { createInitialState } from './store';

describe('State Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads valid state from localStorage', () => {
    const state = createInitialState();
    state.theme = 'classic';
    state.dayNight = false;
    state.quality = 'low';
    state.graticule = '15deg';
    state.knowledgeMap = true;
    state.layers.lakes.enabled = false;

    savePersistedState(state);
    const loaded = loadPersistedState();

    expect(loaded).not.toBeNull();
    expect(loaded?.theme).toBe('classic');
    expect(loaded?.dayNight).toBe(false);
    expect(loaded?.quality).toBe('low');
    expect(loaded?.graticule).toBe('15deg');
    expect(loaded?.knowledgeMap).toBe(true);
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
      quality: 'medium' as const,
      graticule: 'major' as const,
      knowledgeMap: true,
      layers: {
        lakes: { enabled: false, topN: 35 },
      },
    };

    const merged = applyPersistedState(base, persisted);
    expect(merged.theme).toBe('classic');
    expect(merged.dayNight).toBe(false);
    expect(merged.quality).toBe('medium');
    expect(merged.graticule).toBe('major');
    expect(merged.knowledgeMap).toBe(true);
    expect(merged.layers.lakes.enabled).toBe(false);
    expect(merged.layers.lakes.topN).toBe(35);
    // Other layers remain untouched
    expect(merged.layers.borders.enabled).toBe(base.layers.borders.enabled);
  });

  it('clears persisted state correctly', () => {
    const state = createInitialState();
    savePersistedState(state);
    expect(loadPersistedState()).not.toBeNull();

    clearPersistedState();
    expect(loadPersistedState()).toBeNull();
  });

  it('lets a saved layer choice override the (now off) Top-N defaults', () => {
    const base = createInitialState();
    expect(base.layers.lakes.enabled).toBe(false);

    const merged = applyPersistedState(base, {
      layers: { lakes: { enabled: true, topN: 35 }, borders: { enabled: false } },
    });

    expect(merged.layers.lakes).toEqual({ enabled: true, topN: 35 });
    expect(merged.layers.borders.enabled).toBe(false);
    // Layers the user never touched keep their defaults
    expect(merged.layers.mountains.enabled).toBe(false);
    expect(merged.layers.capitals.enabled).toBe(true);
  });

  it('persists the Moon size and falls back to real scale for out-of-range values', () => {
    const state = createInitialState();
    expect(state.moonScale).toBe(1);
    state.moonScale = 8;
    state.dayNight = false;
    savePersistedState(state);
    expect(applyPersistedState(createInitialState(), loadPersistedState()).moonScale).toBe(8);

    // A bad Moon size must not discard the rest of the saved settings
    localStorage.setItem(
      'terralearn_state_v1',
      JSON.stringify({ dayNight: false, moonScale: 500 }),
    );
    const loaded = loadPersistedState();
    expect(loaded?.dayNight).toBe(false);
    expect(applyPersistedState(createInitialState(), loaded).moonScale).toBe(1);
  });

  it('never persists whether the Moon panel is open', () => {
    const state = createInitialState();
    state.moonPanelOpen = true;
    savePersistedState(state);
    expect(localStorage.getItem('terralearn_state_v1')).not.toContain('moonPanelOpen');
  });

  it('persists the rankings category, ignores an unknown one and never stores the panel state', () => {
    const state = createInitialState();
    expect(state.rankingsCategory).toBe('lakes');
    state.rankingsCategory = 'rivers';
    state.rankingsPanelOpen = true;
    savePersistedState(state);
    expect(localStorage.getItem('terralearn_state_v1')).not.toContain('rankingsPanelOpen');
    expect(applyPersistedState(createInitialState(), loadPersistedState()).rankingsCategory).toBe(
      'rivers',
    );

    localStorage.setItem(
      'terralearn_state_v1',
      JSON.stringify({ dayNight: false, rankingsCategory: 'volcanoes' }),
    );
    const loaded = loadPersistedState();
    expect(loaded?.dayNight).toBe(false);
    expect(applyPersistedState(createInitialState(), loaded).rankingsCategory).toBe('lakes');
  });
});
