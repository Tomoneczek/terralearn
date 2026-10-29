import { distanceDeg, nameKey, type WikidataEntity } from './wikidata.js';

/** Extra peaks must be this high (m) and, from the query, have a prominence of at least 1500 m. */
export const MIN_EXTRA_PEAK_ELEVATION = 2500;
/**
 * A Wikidata peak this close (degrees, about 5 km) to an existing one, and within
 * `SAME_PEAK_ELEVATION_M` of its height, is the same mountain. Neighbouring summits are separate
 * peaks even when close (Everest and Lhotse are 3 km apart but differ by over 300 m).
 */
export const SAME_PEAK_DISTANCE_DEG = 0.05;
export const SAME_PEAK_ELEVATION_M = 150;

export interface ExistingPeak {
  name_en: string;
  lat: number;
  lng: number;
  elevation: number;
}

export interface PeakMerge {
  /** Peaks missing from the existing data, highest first. */
  additions: WikidataEntity[];
  /** Polish name of an existing peak (by index in `existing`), where Wikidata has one. */
  polishNames: Map<number, string>;
}

/**
 * Compares Wikidata peaks with the peaks already built from Natural Earth. The same name, or the
 * same place and height, means the same mountain (it only lends its Polish name); every other peak
 * at least `MIN_EXTRA_PEAK_ELEVATION` high is an addition.
 */
export function mergePeaks(
  existing: readonly ExistingPeak[],
  wikidata: readonly WikidataEntity[],
): PeakMerge {
  const byName = new Map<string, number>();
  existing.forEach((p, i) => byName.set(nameKey(p.name_en), i));

  const additions: WikidataEntity[] = [];
  const polishNames = new Map<number, string>();
  const claimed = new Set<number>();

  for (const entity of wikidata) {
    let match = byName.get(nameKey(entity.name_en));
    if (match === undefined) {
      match = existing.findIndex(
        p =>
          distanceDeg(p, entity) < SAME_PEAK_DISTANCE_DEG &&
          Math.abs(p.elevation - entity.value) <= SAME_PEAK_ELEVATION_M,
      );
      if (match === -1) match = undefined;
    }

    if (match !== undefined) {
      if (entity.name_pl && !claimed.has(match)) {
        polishNames.set(match, entity.name_pl);
        claimed.add(match);
      }
      continue;
    }
    if (entity.value >= MIN_EXTRA_PEAK_ELEVATION) additions.push(entity);
  }

  additions.sort((a, b) => b.value - a.value || a.name_en.localeCompare(b.name_en, 'en'));
  return { additions, polishNames };
}
