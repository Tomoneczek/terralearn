import fs from 'node:fs';
import path from 'node:path';

/**
 * Wikidata (CC0) snapshot: extra peaks, rivers and lakes with PL/EN names and normalised
 * measurements. The queries live in `scripts/data/wikidata/*.rq`; `fetch.ts` caches the answers in
 * `.cache/data/raw/wikidata-<name>.json`. Nothing here talks to the network.
 */

const RAW_DIR = path.resolve(process.cwd(), '.cache/data/raw');

export interface WikidataEntity {
  qid: string;
  name_en: string;
  name_pl?: string;
  /** km (rivers), km² (lakes) or m (peaks), as normalised by the query. */
  value: number;
  /** Prominence in m (peaks only). */
  prominence?: number;
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2 codes, sorted. */
  countries: string[];
}

interface Binding {
  [variable: string]: { value: string } | undefined;
}

function parsePoint(wkt: string | undefined): { lat: number; lng: number } | null {
  const match = /^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/.exec(wkt ?? '');
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Folds the SPARQL rows (repeated per value, coordinate and country) into one entity per item.
 * Items without an English label (the label service then returns the bare Q-id) are dropped, since
 * the UI needs a name. Conflicting values resolve to the median, the first coordinate by text
 * order, so the result does not depend on the row order of the endpoint.
 */
export function parseWikidata(
  bindings: readonly Binding[],
  valueVar: 'km' | 'km2' | 'ele',
): WikidataEntity[] {
  const groups = new Map<
    string,
    {
      name_en: string;
      name_pl?: string;
      values: number[];
      proms: number[];
      coords: Set<string>;
      countries: Set<string>;
    }
  >();

  for (const row of bindings) {
    const uri = row.item?.value;
    const name = row.itemLabel?.value;
    const value = Number(row[valueVar]?.value);
    if (!uri || !name || /^Q\d+$/.test(name) || !Number.isFinite(value)) continue;
    const qid = uri.split('/').pop()!;

    let g = groups.get(qid);
    if (!g) {
      g = { name_en: name, values: [], proms: [], coords: new Set(), countries: new Set() };
      groups.set(qid, g);
    }
    const pl = row.plLabel?.value;
    if (pl && !/^Q\d+$/.test(pl)) g.name_pl = pl;
    g.values.push(value);
    const prom = Number(row.prom?.value);
    if (Number.isFinite(prom)) g.proms.push(prom);
    if (row.coord?.value) g.coords.add(row.coord.value);
    for (const iso of [row.iso?.value, ...(row.countries?.value.split(',') ?? [])]) {
      if (iso && /^[A-Z]{2}$/.test(iso)) g.countries.add(iso);
    }
  }

  const entities: WikidataEntity[] = [];
  for (const [qid, g] of groups) {
    const point = parsePoint([...g.coords].sort()[0]);
    if (!point) continue;
    entities.push({
      qid,
      name_en: g.name_en,
      ...(g.name_pl ? { name_pl: g.name_pl } : {}),
      value: Math.round(median(g.values) * 100) / 100,
      ...(g.proms.length ? { prominence: Math.round(median(g.proms)) } : {}),
      lat: point.lat,
      lng: point.lng,
      countries: [...g.countries].sort(),
    });
  }
  return entities.sort(
    (a, b) => b.value - a.value || a.qid.localeCompare(b.qid, 'en', { numeric: true }),
  );
}

const FILES = { peaks: 'ele', rivers: 'km', lakes: 'km2' } as const;

/** The cached snapshot of a category; an empty list when it has not been fetched. */
export function loadWikidata(category: keyof typeof FILES, rawDir = RAW_DIR): WikidataEntity[] {
  const file = path.join(rawDir, `wikidata-${category}.json`);
  if (!fs.existsSync(file)) return [];
  const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as { results: { bindings: Binding[] } };
  return parseWikidata(json.results.bindings, FILES[category]);
}

/** Lowercase, no diacritics, no generic words ("river", "lake", ...), only letters and digits. */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/\b(river|rio|fleuve|lake|lago|lac|reservoir|mount|mt|mountain)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

export function distanceDeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLng = Math.min(Math.abs(a.lng - b.lng), 360 - Math.abs(a.lng - b.lng));
  return Math.hypot(a.lat - b.lat, dLng * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180)));
}
