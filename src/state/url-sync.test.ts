import { describe, it, expect } from 'vitest';
import { serializeStateToUrl, parseStateFromUrl } from './url-sync';
import { createInitialState } from './store';

describe('URL Sync', () => {
  it('serializes active layers and topN to query string', () => {
    const state = createInitialState();
    state.layers.lakes.enabled = true;
    state.layers.lakes.topN = 10;
    state.layers.rivers.enabled = true;
    state.layers.rivers.topN = 25;
    state.layers.borders.enabled = false;
    state.layers.countriesTopN.enabled = false;
    state.layers.capitals.enabled = false;
    state.layers.mountains.enabled = false;
    state.mode = 'learn';
    state.dayNight = false;

    const url = serializeStateToUrl(state);
    expect(url).toContain('layers=lakes%2Crivers');
    expect(url).toContain('top.lakes=10');
    expect(url).toContain('top.rivers=25');
    expect(url).toContain('mode=learn');
    expect(url).toContain('dayNight=0');
  });

  it('parses valid query string into state correctly', () => {
    const base = createInitialState();
    const query = '?layers=lakes,rivers&top.lakes=12&mode=quiz&dayNight=0';

    const parsed = parseStateFromUrl(query, base);
    expect(parsed.layers.lakes.enabled).toBe(true);
    expect(parsed.layers.lakes.topN).toBe(12);
    expect(parsed.layers.rivers.enabled).toBe(true);
    expect(parsed.layers.borders.enabled).toBe(false); // not in list
    expect(parsed.mode).toBe('quiz');
    expect(parsed.dayNight).toBe(false);
  });

  it('clamps topN values to layer boundaries', () => {
    const base = createInitialState();
    // lakes max is 50
    const query = '?layers=lakes&top.lakes=999';
    const parsed = parseStateFromUrl(query, base);
    expect(parsed.layers.lakes.topN).toBe(50);
  });

  it('ignores unknown layers and invalid parameters gracefully', () => {
    const base = createInitialState();
    const query = '?layers=nonexistent,hacker_layer&mode=invalid_mode';
    const parsed = parseStateFromUrl(query, base);
    expect(parsed.mode).toBe('explore');
    expect(parsed.layers.borders.enabled).toBe(false);
  });
});
