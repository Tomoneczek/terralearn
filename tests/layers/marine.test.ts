import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getLayer } from '@/layers/registry';
import {
  getPolygonAltitude,
  getPolygonCapColor,
  getPolygonSideColor,
  getPolygonStrokeColor,
} from '@/layers/styles';
import { PRESETS } from '@/ui/presets';
import { getLayerColor } from '@/ui/sidebar';
import type { GeoFeature } from '@/globe/data-loader';

describe('G09-02 Marine Layer (Seas, Gulfs, Bays, Straits)', () => {
  it('verifies that marine.json exists, satisfies schema, and contains 120 top features', () => {
    const dataPath = path.resolve(process.cwd(), 'public/data/marine.json');
    expect(fs.existsSync(dataPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    expect(content.type).toBe('FeatureCollection');
    expect(content.features).toHaveLength(120);

    const kinds = new Set(content.features.map((f: GeoFeature) => f.properties.kind));
    expect(kinds.size).toBe(1);
    expect(kinds.has('marine')).toBe(true);

    // Verify subkinds presence
    const subkinds = new Set(content.features.map((f: GeoFeature) => f.properties.marineType));
    expect(subkinds.has('sea')).toBe(true);
    expect(subkinds.has('gulf')).toBe(true);
    expect(subkinds.has('bay')).toBe(true);
    expect(subkinds.has('strait')).toBe(true);

    // Check rank order consistency (1..120)
    const first = content.features[0];
    expect(first.properties.rank?.order).toBe(1);
    expect(first.properties.rank?.area).toBeGreaterThan(3_000_000);

    // Verify Baltic Sea presence in Top 120
    const baltic = content.features.find((f: GeoFeature) => f.properties.name_en === 'Baltic Sea');
    expect(baltic).toBeDefined();
    expect(baltic.properties.rank?.order).toBeLessThanOrEqual(120);
  });

  it('registers the marine layer in LAYER_DEFINITIONS with proper settings', () => {
    const layer = getLayer('marine');
    expect(layer).toBeDefined();
    expect(layer?.group).toBe('physical');
    expect(layer?.kind).toBe('polygon');
    expect(layer?.source).toBe('/data/marine.json');
    expect(layer?.defaultEnabled).toBe(false);
    expect(layer?.topN).toBeDefined();
    expect(layer?.topN?.min).toBe(5);
    expect(layer?.topN?.max).toBe(100);
    expect(layer?.topN?.default).toBe(30);
    expect(layer?.topN?.rankBy).toBe('area');
  });

  it('ensures marine altitude is allocated below land and borders to prevent Z-fighting', () => {
    const def = getLayer('marine')!;

    const seaFeature: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'marine-sea-baltic',
        kind: 'marine',
        layerId: 'marine',
        name_pl: 'Baltic',
        name_en: 'Baltic Sea',
        marineType: 'sea',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    };

    const altBase = getPolygonAltitude(seaFeature, false, false, def);
    // 0.003 is below borders (0.004), deserts (0.005), landforms (0.006), lakes (0.007)
    expect(altBase).toBe(0.003);

    // Elevated upon hover / selection
    expect(getPolygonAltitude(seaFeature, true, false, def)).toBe(0.003 + 0.012);
    expect(getPolygonAltitude(seaFeature, false, true, def)).toBe(0.003 + 0.004);
  });

  it('applies distinct marine palettes with golden selection and cyan hover', () => {
    const def = getLayer('marine')!;

    const createFeature = (marineType: string): GeoFeature => ({
      type: 'Feature',
      properties: {
        id: `marine-${marineType}`,
        kind: 'marine',
        layerId: 'marine',
        name_pl: 'Name',
        name_en: 'Name',
        marineType,
      },
      geometry: { type: 'Polygon', coordinates: [] },
    });

    const sea = createFeature('sea');
    const bay = createFeature('bay');
    const strait = createFeature('strait');

    // Distinct hues
    expect(getPolygonCapColor(sea, false, false, def)).toContain('hsla(210,');
    expect(getPolygonCapColor(bay, false, false, def)).toContain('hsla(195,');
    expect(getPolygonCapColor(strait, false, false, def)).toContain('hsla(180,');

    // Distinct side extrusions
    expect(getPolygonSideColor(sea, false, false, def)).toContain('hsla(210,');

    // Border strokes
    expect(getPolygonStrokeColor(sea, false, false, def)).toContain('hsl(210,');
    expect(getPolygonStrokeColor(bay, false, false, def)).toContain('hsl(195,');
    expect(getPolygonStrokeColor(strait, false, false, def)).toContain('hsl(180,');

    // Selection highlight
    expect(getPolygonCapColor(sea, true, false, def)).toBe('hsla(180, 100%, 70%, 0.65)');
    expect(getPolygonStrokeColor(sea, true, false, def)).toBe('hsl(50, 100%, 65%)');

    // Hover highlight
    expect(getPolygonCapColor(sea, false, true, def)).toBe('hsla(180, 100%, 80%, 0.45)');
    expect(getPolygonStrokeColor(sea, false, true, def)).toBe('hsl(180, 100%, 80%)');
  });

  it('integrates marine in presets and UI sidebar', () => {
    const physicalPreset = PRESETS.find(p => p.id === 'physical')!;
    expect(physicalPreset.enabledLayers).toContain('marine');

    const politicalPreset = PRESETS.find(p => p.id === 'political')!;
    expect(politicalPreset.disabledLayers).toContain('marine');

    const allPreset = PRESETS.find(p => p.id === 'all')!;
    expect(allPreset.enabledLayers).toContain('marine');

    expect(getLayerColor('marine')).toBe('hsl(205, 90%, 60%)');
  });

  it('indexes marine features in search index and facts dictionary', () => {
    const searchPath = path.resolve(process.cwd(), 'public/data/search-index.json');
    const factsPath = path.resolve(process.cwd(), 'public/data/facts.json');

    const searchIndex = JSON.parse(fs.readFileSync(searchPath, 'utf-8'));
    const facts = JSON.parse(fs.readFileSync(factsPath, 'utf-8'));

    const marineSearches = searchIndex.filter((item: { kind: string }) => item.kind === 'marine');
    expect(marineSearches.length).toBe(120);

    const first = marineSearches[0];
    const fact = facts[first.id];
    expect(fact).toBeDefined();
    expect(fact.stats.length).toBeGreaterThan(0);
    expect(fact.comparison).toBeDefined();
  });
});
