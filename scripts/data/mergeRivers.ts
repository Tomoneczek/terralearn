import { geoLength } from 'd3-geo';
import type { GeoFeature } from './schema.js';

interface RawRiverProperties {
  name?: string | null;
  name_en?: string | null;
  name_alt?: string | null;
  scalerank?: number;
  featurecla?: string;
}

interface RawRiverFeature {
  type: 'Feature';
  properties: RawRiverProperties;
  geometry: {
    type: 'LineString' | 'MultiLineString';
    coordinates: number[][] | number[][][];
  };
}

export type Position = [number, number];
export type PositionList = Position[];
export type MultiPositionList = PositionList[];

function roundCoord(num: number): number {
  return Math.round(num * 1000) / 1000;
}

function roundPositions(line: number[][]): Position[] {
  return line.map(pt => [roundCoord(pt[0] ?? 0), roundCoord(pt[1] ?? 0)]);
}

function distSq(a: Position, b: Position): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Curated mouth locations [longitude, latitude] for major world rivers.
 * Used to ensure the digitized coordinates flow naturally from source to mouth.
 */
export const KNOWN_MOUTHS: Record<string, Position> = {
  amazonas: [-50.0, 0.0],
  amazon: [-50.0, 0.0],
  amazonka: [-50.0, 0.0],
  mississippi: [-89.2, 29.1],
  missouri: [-90.1, 38.8],
  ob: [73.0, 66.8],
  lena: [126.7, 72.3],
  yenisey: [83.1, 70.1],
  'verkhniy yenisey': [92.0, 51.7],
  amur: [140.8, 53.1],
  don: [39.3, 47.1],
  arkansas: [-91.1, 33.8],
  vilyuy: [126.4, 64.4],
  nile: [31.2, 31.5],
  volga: [47.6, 45.6],
  danube: [28.8, 45.2],
  donau: [28.8, 45.2],
  ganges: [89.3, 21.7],
  indus: [67.4, 24.0],
  paraná: [-58.4, -34.0],
  parana: [-58.4, -34.0],
  yukon: [-165.2, 61.3],
  huang: [119.0, 37.8],
  'huang he': [119.0, 37.8],
  niger: [5.5, 5.2],
  congo: [12.3, -6.0],
  lualaba: [24.3, 0.8],
  mekong: [106.1, 10.2],
  lancang: [101.6, 17.8],
  colorado: [-114.9, 31.9],
  zambezi: [36.1, -18.8],
  rhine: [4.2, 51.9],
  rhein: [4.2, 51.9],
  vistula: [18.9, 54.4],
  wisla: [18.9, 54.4],
  columbia: [-123.2, 46.1],
  'rio grande': [-97.1, 26.0],
  orinoco: [-61.1, 8.9],
  kolyma: [160.8, 68.5],
  pechora: [54.2, 68.3],
  orange: [16.4, -28.6],
  indigirka: [150.1, 71.2],
  ohio: [-89.1, 37.0],
  ural: [51.7, 46.9],
  mackenzie: [-134.2, 69.3],
  angara: [93.0, 58.1],
  'syr darya': [60.9, 46.1],
  'amu darya': [59.0, 43.8],
  uruguay: [-58.2, -32.5],
  peace: [-111.4, 59.0],
  negro: [-59.9, -3.1],
  taz: [78.6, 67.6],
  yamuna: [81.9, 25.4],
  kama: [49.2, 55.1],
  irtysh: [68.8, 61.1],
  ertis: [68.8, 61.1],
  purús: [-61.5, -3.7],
  purus: [-61.5, -3.7],
  ucayali: [-73.5, -4.4],
  aldan: [129.4, 63.5],
  olenëk: [119.7, 73.0],
  olenek: [119.7, 73.0],
  'nizhnyaya tunguska': [88.0, 65.8],
  yangtze: [121.8, 31.5],
  'chang jiang': [121.8, 31.5],
  jinsha: [103.9, 28.7],
  fraser: [-123.2, 49.1],
  elbe: [9.0, 53.9],
  oder: [14.6, 53.6],
  odra: [14.6, 53.6],
  po: [12.5, 44.9],
  tagus: [-9.3, 38.7],
  tajo: [-9.3, 38.7],
  tejo: [-9.3, 38.7],
  ebro: [0.8, 40.7],
  seine: [0.1, 49.4],
  thames: [0.7, 51.5],
  dnieper: [32.3, 46.5],
  dnipro: [32.3, 46.5],
  dniester: [30.5, 46.3],
  murray: [138.9, -35.5],
  darling: [141.9, -34.1],
  brahmaputra: [90.5, 23.3],
  tigris: [47.5, 31.0],
  euphrates: [47.5, 31.0],
  salween: [97.6, 16.5],
  nu: [97.6, 16.5],
  limpopo: [33.5, -25.2],
  red: [106.6, 20.3],
  chao_phraya: [100.6, 13.5],
  tocantins: [-48.7, -1.7],
  xingu: [-51.9, -1.5],
  tapajós: [-54.9, -2.4],
  tapajos: [-54.9, -2.4],
  madeira: [-58.8, -3.4],
  martha: [-58.8, -3.4],
  saint_lawrence: [-69.5, 48.0],
  nelson: [-92.5, 57.0],
  churchill: [-94.2, 58.8],
  athabasca: [-110.9, 58.7],
  'south saskatchewan': [-105.1, 53.2],
  'north saskatchewan': [-105.1, 53.2],
};

/**
 * Stitch connected linestrings whose endpoints meet within tolerance.
 * Flips segments appropriately when joining end-to-end or start-to-start.
 */
export function stitchSegments(segments: PositionList[], toleranceDeg = 0.05): PositionList[] {
  const pool = segments.map(s => [...s]);
  const result: PositionList[] = [];
  const tolSq = toleranceDeg * toleranceDeg;

  while (pool.length > 0) {
    // Sort pool descending by vertex count so we grow the longest continuous stem first
    pool.sort((a, b) => b.length - a.length);
    let current = pool.shift()!;
    let grew = true;

    while (grew) {
      grew = false;
      const curStart = current[0]!;
      const curEnd = current[current.length - 1]!;

      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i]!;
        const segStart = seg[0]!;
        const segEnd = seg[seg.length - 1]!;

        if (distSq(curEnd, segStart) <= tolSq) {
          current = current.concat(seg.slice(1));
          pool.splice(i, 1);
          grew = true;
          break;
        } else if (distSq(curEnd, segEnd) <= tolSq) {
          current = current.concat(seg.slice(0, -1).reverse());
          pool.splice(i, 1);
          grew = true;
          break;
        } else if (distSq(curStart, segEnd) <= tolSq) {
          current = seg.concat(current.slice(1));
          pool.splice(i, 1);
          grew = true;
          break;
        } else if (distSq(curStart, segStart) <= tolSq) {
          current = seg.slice(1).reverse().concat(current);
          pool.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    result.push(current);
  }

  return result;
}

/**
 * Orient stitched chains so that their vertex order runs strictly from source (start)
 * to mouth (end). Uses known mouth coordinates and delta/tributary junction detection.
 */
export function orientRiverChains(riverKey: string, chains: PositionList[]): PositionList[] {
  if (chains.length === 0) return [];
  const mouth = KNOWN_MOUTHS[riverKey];

  const mainStem = chains[0]!;
  let orientedMainStem = mainStem;

  if (mouth && mainStem.length >= 2) {
    const dStart = distSq(mainStem[0]!, mouth);
    const dEnd = distSq(mainStem[mainStem.length - 1]!, mouth);
    if (dStart < dEnd) {
      // Reversed: start is closer to mouth than end -> reverse so start is source and end is mouth
      orientedMainStem = [...mainStem].reverse();
    }
  }

  const oriented: PositionList[] = [orientedMainStem];

  // For secondary branches (deltas and tributaries)
  for (let i = 1; i < chains.length; i++) {
    let branch = chains[i]!;
    if (branch.length < 2) {
      oriented.push(branch);
      continue;
    }

    const bStart = branch[0]!;
    const bEnd = branch[branch.length - 1]!;

    // Find closest vertex on orientedMainStem to bStart and bEnd
    let minStartDist = Infinity;
    let startStemIdx = 0;
    let minEndDist = Infinity;
    let endStemIdx = 0;

    for (let sIdx = 0; sIdx < orientedMainStem.length; sIdx++) {
      const stemPt = orientedMainStem[sIdx]!;
      const ds = distSq(bStart, stemPt);
      if (ds < minStartDist) {
        minStartDist = ds;
        startStemIdx = sIdx;
      }
      const de = distSq(bEnd, stemPt);
      if (de < minEndDist) {
        minEndDist = de;
        endStemIdx = sIdx;
      }
    }

    const junctionAtStart = minStartDist < minEndDist;
    const junctionIdx = junctionAtStart ? startStemIdx : endStemIdx;
    const fraction = junctionIdx / Math.max(1, orientedMainStem.length - 1);

    if (fraction >= 0.7) {
      // Delta distributary: flows outward from main stem towards mouth/sea
      // Junction must be at branch[0]. If junction was at bEnd, reverse so start is at junction.
      if (!junctionAtStart) {
        branch = [...branch].reverse();
      }
    } else {
      // Tributary: flows from headwaters into main stem
      // Junction must be at branch[last]. If junction was at bStart, reverse so end is at junction.
      if (junctionAtStart) {
        branch = [...branch].reverse();
      }
    }

    oriented.push(branch);
  }

  return oriented;
}

export function mergeRivers(
  rawFeatures: RawRiverFeature[],
  overrides: Record<string, string>,
): GeoFeature[] {
  const groups = new Map<
    string,
    {
      name: string;
      nameEn: string;
      aliases: Set<string>;
      lines: PositionList[];
    }
  >();

  for (const feature of rawFeatures) {
    const rawName = feature.properties.name || feature.properties.name_en;
    if (!rawName) continue;

    const trimmed = rawName.trim();
    const key = trimmed.toLowerCase();

    if (!groups.has(key)) {
      groups.set(key, {
        name: trimmed,
        nameEn: (feature.properties.name_en || trimmed).trim(),
        aliases: new Set<string>(),
        lines: [],
      });
    }

    const group = groups.get(key)!;
    if (feature.properties.name_alt) {
      group.aliases.add(feature.properties.name_alt);
    }

    if (feature.geometry.type === 'LineString') {
      group.lines.push(roundPositions(feature.geometry.coordinates as number[][]));
    } else if (feature.geometry.type === 'MultiLineString') {
      for (const line of feature.geometry.coordinates as number[][][]) {
        group.lines.push(roundPositions(line));
      }
    }
  }

  const results: GeoFeature[] = [];

  for (const [key, group] of groups) {
    if (group.lines.length === 0) continue;

    // 1. Stitch contiguous line segments into continuous chains
    const stitchedLines = stitchSegments(group.lines);

    // 2. Orient all chains from source to mouth
    const orientedLines: MultiPositionList = orientRiverChains(key, stitchedLines);

    const multiLineFeature = {
      type: 'Feature' as const,
      geometry: {
        type: 'MultiLineString' as const,
        coordinates: orientedLines,
      },
      properties: {},
    };

    const lengthKm = Math.round(geoLength(multiLineFeature) * 6371.0088);

    // Pick a representative coordinate along the main river stem for label
    const mainLine = orientedLines[0] ?? [];
    const midIdx = Math.floor(mainLine.length / 2);
    const midCoord = mainLine[midIdx] ?? [0, 0];

    const namePl = overrides[group.name] || overrides[group.nameEn] || group.name;

    results.push({
      type: 'Feature',
      id: `river-${slugify(group.name)}`,
      properties: {
        id: `river-${slugify(group.name)}`,
        kind: 'river',
        layerId: 'physical-rivers',
        name_pl: namePl,
        name_en: group.nameEn,
        aliases: Array.from(group.aliases),
        rank: {
          length: lengthKm,
        },
        labelLng: roundCoord(midCoord[0] ?? 0),
        labelLat: roundCoord(midCoord[1] ?? 0),
      },
      geometry: {
        type: 'MultiLineString',
        coordinates: orientedLines,
      },
    });
  }

  // Sort by length descending and set rank order
  results.sort((a, b) => (b.properties.rank.length || 0) - (a.properties.rank.length || 0));
  results.forEach((feat, idx) => {
    feat.properties.rank.order = idx + 1;
  });

  return results;
}
