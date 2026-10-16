import { describe, it, expect } from 'vitest';
import { LAYER_DEFINITIONS, getLayer, getLayersByGroup, defaultLayersState } from './registry';
import { pl } from '@/i18n';

describe('Layer Registry', () => {
  it('ensures each layer definition has a unique id', () => {
    const ids = LAYER_DEFINITIONS.map(l => l.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('verifies that each layer labelKey exists in the Polish dictionary', () => {
    for (const layer of LAYER_DEFINITIONS) {
      const parts = layer.labelKey.split('.');
      let current: unknown = pl;
      for (const part of parts) {
        expect(current).toBeDefined();
        current = (current as Record<string, unknown>)[part];
      }
      expect(typeof current).toBe('string');
      expect((current as string).length).toBeGreaterThan(0);
    }
  });

  it('validates topN configuration boundaries', () => {
    for (const layer of LAYER_DEFINITIONS) {
      if (layer.topN) {
        expect(layer.topN.min).toBeLessThanOrEqual(layer.topN.default);
        expect(layer.topN.default).toBeLessThanOrEqual(layer.topN.max);
        if (layer.topN.presets) {
          for (const preset of layer.topN.presets) {
            expect(preset).toBeGreaterThanOrEqual(layer.topN.min);
            expect(preset).toBeLessThanOrEqual(layer.topN.max);
          }
        }
      }
    }
  });

  it('looks up layer by id correctly', () => {
    const lakes = getLayer('lakes');
    expect(lakes).toBeDefined();
    expect(lakes?.group).toBe('physical');
    expect(lakes?.kind).toBe('polygon');
  });

  it('filters layers by group', () => {
    const physical = getLayersByGroup('physical');
    expect(physical.length).toBeGreaterThan(0);
    expect(physical.every(l => l.group === 'physical')).toBe(true);

    const political = getLayersByGroup('political');
    expect(political.length).toBeGreaterThan(0);
    expect(political.every(l => l.group === 'political')).toBe(true);
  });

  it('generates the default layer states correctly', () => {
    const state = defaultLayersState();
    expect(state.borders.enabled).toBe(true);
    expect(state.lakes.enabled).toBe(true);
    expect(state.lakes.topN).toBe(20);
    expect(state.rivers.enabled).toBe(false);
  });
});
