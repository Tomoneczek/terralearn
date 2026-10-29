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
    state.dayNight = false;

    const url = serializeStateToUrl(state);
    expect(url).toContain('layers=lakes%2Crivers');
    expect(url).toContain('top.lakes=10');
    expect(url).toContain('top.rivers=25');
    expect(url).toContain('dayNight=0');
  });

  it('writes nothing for the default view', () => {
    expect(serializeStateToUrl(createInitialState())).toBe('');
  });

  it('writes the full view once anything differs, so a link does not depend on saved preferences', () => {
    const state = createInitialState();
    state.clouds = false;

    const params = new URLSearchParams(serializeStateToUrl(state).slice(1));
    expect(params.get('clouds')).toBe('0');
    expect(params.get('theme')).toBe('dark');
    expect(params.get('dayNight')).toBe('1');
    expect(params.get('grid')).toBe('off');
    expect(params.get('hiddenLabels')).toBe('0');
    expect(params.get('layers')).not.toBeNull();
  });

  it('round-trips theme, clouds, graticule and labels', () => {
    const state = createInitialState();
    state.theme = 'classic';
    state.clouds = false;
    state.graticule = '15deg';
    state.hiddenLabels = true;
    state.layers.lakes.enabled = !state.layers.lakes.enabled;

    const parsed = parseStateFromUrl(serializeStateToUrl(state), createInitialState());
    expect(parsed.theme).toBe('classic');
    expect(parsed.clouds).toBe(false);
    expect(parsed.graticule).toBe('15deg');
    expect(parsed.hiddenLabels).toBe(true);
    expect(parsed.layers).toEqual(state.layers);
  });

  it('keeps params owned by other features and drops its own stale ones', () => {
    const state = createInitialState();
    state.theme = 'classic';

    const url = serializeStateToUrl(state, '?dev=true&time=2026-08-12T17%3A46%3A00Z&mode=quiz');
    const params = new URLSearchParams(url.slice(1));
    expect(params.get('dev')).toBe('true');
    expect(params.get('time')).toBe('2026-08-12T17:46:00Z');
    expect(params.get('theme')).toBe('classic');
    expect(params.has('mode')).toBe(false);

    // Back to the default view: only the foreign params remain
    expect(serializeStateToUrl(createInitialState(), url)).toBe(
      '?dev=true&time=2026-08-12T17%3A46%3A00Z',
    );
  });

  it('never writes preferences that belong to the recipient', () => {
    const state = createInitialState();
    state.locale = 'pl';
    state.quality = 'low';
    state.knowledgeMap = true;
    state.moonScale = 8;
    state.mode = 'quiz';
    state.theme = 'classic';

    const url = serializeStateToUrl(state);
    for (const key of ['locale', 'quality', 'knowledgeMap', 'moonScale', 'mode']) {
      expect(url).not.toContain(`${key}=`);
    }
  });

  it('parses valid query string into state correctly', () => {
    const base = createInitialState();
    const query = '?layers=lakes,rivers&top.lakes=12&dayNight=0&theme=classic&clouds=0&grid=major';

    const parsed = parseStateFromUrl(query, base);
    expect(parsed.layers.lakes.enabled).toBe(true);
    expect(parsed.layers.lakes.topN).toBe(12);
    expect(parsed.layers.rivers.enabled).toBe(true);
    expect(parsed.layers.borders.enabled).toBe(false); // not in list
    expect(parsed.dayNight).toBe(false);
    expect(parsed.theme).toBe('classic');
    expect(parsed.clouds).toBe(false);
    expect(parsed.graticule).toBe('major');
  });

  it('does not read the app mode from the URL', () => {
    const parsed = parseStateFromUrl('?mode=quiz', createInitialState());
    expect(parsed.mode).toBe('explore');
  });

  it('leaves fields untouched when params are missing', () => {
    const base = createInitialState();
    base.theme = 'classic';
    base.clouds = false;
    base.layers.lakes.enabled = !base.layers.lakes.enabled;

    const parsed = parseStateFromUrl('?dayNight=0', base);
    expect(parsed.theme).toBe('classic');
    expect(parsed.clouds).toBe(false);
    expect(parsed.layers).toEqual(base.layers);
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
    const query =
      '?layers=nonexistent,hacker_layer&theme=neon&clouds=maybe&grid=1deg&hiddenLabels=yes';
    const parsed = parseStateFromUrl(query, base);
    expect(parsed.layers.borders.enabled).toBe(false);
    expect(parsed.theme).toBe(base.theme);
    expect(parsed.clouds).toBe(base.clouds);
    expect(parsed.graticule).toBe(base.graticule);
    expect(parsed.hiddenLabels).toBe(base.hiddenLabels);
  });
});
