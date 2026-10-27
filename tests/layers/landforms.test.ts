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

describe('G09-01 Landforms Layer and Physical Geography', () => {
  it('verifies that landforms.json exists and strictly satisfies schema and counts', () => {
    const dataPath = path.resolve(process.cwd(), 'public/data/landforms.json');
    expect(fs.existsSync(dataPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    expect(content.type).toBe('FeatureCollection');
    expect(content.features).toHaveLength(197);

    const kinds = new Set(content.features.map((f: GeoFeature) => f.properties.kind));
    expect(kinds.size).toBe(1);
    expect(kinds.has('landform')).toBe(true);

    // Verify subkinds presence
    const subkinds = new Set(content.features.map((f: GeoFeature) => f.properties.landformType));
    expect(subkinds.has('plateau')).toBe(true);
    expect(subkinds.has('plain')).toBe(true);
    expect(subkinds.has('basin')).toBe(true);
    expect(subkinds.has('delta')).toBe(true);
    expect(subkinds.has('peninsula')).toBe(true);

    // Check rank order consistency (1..197)
    const first = content.features[0];
    expect(first.properties.rank?.order).toBe(1);
    expect(first.properties.rank?.area).toBeGreaterThan(1_000_000);
  });

  it('registers the landforms layer in LAYER_DEFINITIONS with proper TopN', () => {
    const layer = getLayer('landforms');
    expect(layer).toBeDefined();
    expect(layer?.group).toBe('physical');
    expect(layer?.kind).toBe('polygon');
    expect(layer?.source).toBe('/data/landforms.json');
    expect(layer?.defaultEnabled).toBe(false);
    expect(layer?.topN).toBeDefined();
    expect(layer?.topN?.min).toBe(5);
    expect(layer?.topN?.max).toBe(100);
    expect(layer?.topN?.default).toBe(30);
    expect(layer?.topN?.rankBy).toBe('area');
  });

  it('differentiates physical 3D altitude by landform type', () => {
    const def = getLayer('landforms')!;

    const plateau: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'lf-plat',
        kind: 'landform',
        layerId: 'landforms',
        name_pl: 'Plat',
        name_en: 'Plat',
        landformType: 'plateau',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    };

    const basin: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'lf-basin',
        kind: 'landform',
        layerId: 'landforms',
        name_pl: 'Basin',
        name_en: 'Basin',
        landformType: 'basin',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    };

    const plain: GeoFeature = {
      type: 'Feature',
      properties: {
        id: 'lf-plain',
        kind: 'landform',
        layerId: 'landforms',
        name_pl: 'Plain',
        name_en: 'Plain',
        landformType: 'plain',
      },
      geometry: { type: 'Polygon', coordinates: [] },
    };

    const altPlateau = getPolygonAltitude(plateau, false, false, def);
    const altBasin = getPolygonAltitude(basin, false, false, def);
    const altPlain = getPolygonAltitude(plain, false, false, def);

    // Plateaus are physically elevated above plains, basins are below
    expect(altPlateau).toBe(0.009);
    expect(altPlain).toBe(0.006);
    expect(altBasin).toBe(0.0045);

    // Selection elevates without Z-fighting
    expect(getPolygonAltitude(plateau, true, false, def)).toBe(0.009 + 0.012);
    expect(getPolygonAltitude(plateau, false, true, def)).toBe(0.009 + 0.004);
  });

  it('styles distinct colors per landform subtype and provides selection highlights', () => {
    const def = getLayer('landforms')!;

    const createFeature = (subkind: string): GeoFeature => ({
      type: 'Feature',
      properties: {
        id: `lf-${subkind}`,
        kind: 'landform',
        layerId: 'landforms',
        name_pl: 'Name',
        name_en: 'Name',
        landformType: subkind,
      },
      geometry: { type: 'Polygon', coordinates: [] },
    });

    const plateau = createFeature('plateau');
    const plain = createFeature('plain');
    const delta = createFeature('delta');
    const basin = createFeature('basin');
    const peninsula = createFeature('peninsula');

    // Distinct hues
    expect(getPolygonCapColor(plateau, false, false, def)).toContain('hsla(32,');
    expect(getPolygonCapColor(plain, false, false, def)).toContain('hsla(120,');
    expect(getPolygonCapColor(delta, false, false, def)).toContain('hsla(165,');
    expect(getPolygonCapColor(basin, false, false, def)).toContain('hsla(65,');
    expect(getPolygonCapColor(peninsula, false, false, def)).toContain('hsla(150,');

    // Distinct side extrusions
    expect(getPolygonSideColor(plateau, false, false, def)).toContain('hsla(32,');
    expect(getPolygonSideColor(plain, false, false, def)).toContain('hsla(120,');

    // Distinct border strokes
    expect(getPolygonStrokeColor(plateau, false, false, def)).toContain('hsl(32,');
    expect(getPolygonStrokeColor(delta, false, false, def)).toContain('hsl(165,');

    // Selection highlight overrides subtype colors
    expect(getPolygonCapColor(plateau, true, false, def)).toBe('hsla(180, 100%, 70%, 0.65)');
    expect(getPolygonStrokeColor(plateau, true, false, def)).toBe('hsl(50, 100%, 65%)');

    // Hover highlight
    expect(getPolygonCapColor(plain, false, true, def)).toBe('hsla(180, 100%, 80%, 0.45)');
    expect(getPolygonStrokeColor(plain, false, true, def)).toBe('hsl(180, 100%, 80%)');
  });

  it('integrates landforms in sidebar presets and color map', () => {
    const physicalPreset = PRESETS.find(p => p.id === 'physical')!;
    expect(physicalPreset.enabledLayers).toContain('landforms');

    const politicalPreset = PRESETS.find(p => p.id === 'political')!;
    expect(politicalPreset.disabledLayers).toContain('landforms');

    const allPreset = PRESETS.find(p => p.id === 'all')!;
    expect(allPreset.enabledLayers).toContain('landforms');

    const color = getLayerColor('landforms');
    expect(color).toBe('hsl(140, 65%, 55%)');
  });

  it('verifies search index and facts include landforms', () => {
    const searchPath = path.resolve(process.cwd(), 'public/data/search-index.json');
    const factsPath = path.resolve(process.cwd(), 'public/data/facts.json');

    const searchIndex = JSON.parse(fs.readFileSync(searchPath, 'utf-8'));
    const facts = JSON.parse(fs.readFileSync(factsPath, 'utf-8'));

    const landformSearches = searchIndex.filter(
      (item: { kind: string }) => item.kind === 'landform',
    );
    expect(landformSearches.length).toBe(197);

    // Verify first landform has facts and stats
    const sampleId = landformSearches[0].id;
    const sampleFact = facts[sampleId];
    expect(sampleFact).toBeDefined();
    expect(sampleFact.stats.length).toBeGreaterThan(0);
    expect(sampleFact.comparison).toBeDefined();
  });
});
