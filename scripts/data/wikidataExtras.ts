import fs from 'node:fs';
import path from 'node:path';
import { loadWikidata, nameKey, type WikidataEntity } from './wikidata.js';

const DATA_DIR = path.resolve(process.cwd(), 'public/data');

export type ExtraKind = 'river';

/** A river from Wikidata that has no geometry on the globe, only a table row and a card. */
export interface ExtraObject {
  id: string;
  kind: ExtraKind;
  name_pl: string;
  name_en: string;
  /** Length in km. */
  value: number;
  lat: number;
  lng: number;
  countries: string[];
}

/**
 * Wikidata entries to leave out: wrong values and myths found in the G19 spike, and rivers the
 * layer already has under another name (the main stem of a system, or a spelling that differs
 * from the Natural Earth one), which would otherwise show up twice in the table.
 */
export const EXCLUDED_NAMES: ReadonlySet<string> = new Set(
  [
    'Eridanos',
    'Bian River',
    // Already in the rivers layer under another name
    'Yenisei', // Yenisey
    'Yarlung Tsangpo River', // Brahmaputra
    'Pearl River', // Xi
    'Irrawaddy River', // Ayeyarwady
    'Solimões', // the Amazon upstream of Manaus
    'Olenyok', // Olenëk
  ].map(nameKey),
);

/** Shorter rivers from Wikidata are mostly local streams; the table stays to the notable ones. */
export const MIN_EXTRA_RIVER_KM = 800;

interface LayerFeature {
  properties: {
    id: string;
    name_pl: string;
    name_en: string;
    aliases?: string[];
    rank: { length?: number; area?: number; order?: number };
  };
}

function readLayer(file: string, dir: string): LayerFeature[] {
  const full = path.join(dir, file);
  return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, 'utf-8')).features : [];
}

export interface ExtrasResult {
  extras: ExtraObject[];
  /** World rank (by length) of every river of the layer and every extra, 1 = longest. */
  orderById: Map<string, number>;
}

export function mergeRivers(
  layer: LayerFeature[],
  entities: readonly WikidataEntity[],
): ExtrasResult {
  const known = new Set<string>();
  for (const f of layer) {
    for (const name of [
      f.properties.name_en,
      f.properties.name_pl,
      ...(f.properties.aliases ?? []),
    ]) {
      if (name) known.add(nameKey(name));
    }
  }

  const extras: ExtraObject[] = [];
  const usedKeys = new Set<string>();
  for (const e of entities) {
    const key = nameKey(e.name_en);
    if (!key || known.has(key) || usedKeys.has(key) || EXCLUDED_NAMES.has(key)) continue;
    if (e.value < MIN_EXTRA_RIVER_KM) continue;
    usedKeys.add(key);
    extras.push({
      id: `river-wd-${e.qid.toLowerCase()}`,
      kind: 'river',
      name_pl: e.name_pl ?? e.name_en,
      name_en: e.name_en,
      value: Math.round(e.value),
      lat: Math.round(e.lat * 100) / 100,
      lng: Math.round(e.lng * 100) / 100,
      countries: e.countries,
    });
  }

  const ranked = [
    ...layer.map(f => ({
      id: f.properties.id,
      value: f.properties.rank.length ?? -1,
      layerOrder: f.properties.rank.order ?? Infinity,
    })),
    ...extras.map(x => ({ id: x.id, value: x.value, layerOrder: Infinity })),
  ].sort((a, b) => b.value - a.value || a.layerOrder - b.layerOrder || a.id.localeCompare(b.id));

  return {
    extras,
    orderById: new Map(ranked.map((r, index) => [r.id, index + 1])),
  };
}

/**
 * Rivers from the Wikidata snapshot that the rivers layer does not have (matched by normalised
 * name and aliases), with the merged world ranking. Without a snapshot there are no extras and the
 * layer ranking stands. Lakes are deliberately not extended: the Wikidata lake list (≥ 500 km²)
 * is full of reservoirs, extinct lakes, salt flats and wrong areas, and the Natural Earth lakes
 * already cover the real ones.
 */
export function buildExtras(dir = DATA_DIR): Record<ExtraKind, ExtrasResult> {
  return { river: mergeRivers(readLayer('rivers.json', dir), loadWikidata('rivers')) };
}
