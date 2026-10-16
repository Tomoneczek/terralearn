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

type Position = [number, number];
type PositionList = Position[];
type MultiPositionList = PositionList[];

function roundCoord(num: number): number {
  return Math.round(num * 1000) / 1000;
}

function roundPositions(line: number[][]): Position[] {
  return line.map(pt => [roundCoord(pt[0] ?? 0), roundCoord(pt[1] ?? 0)]);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
      lines: number[][][];
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
      group.lines.push(feature.geometry.coordinates as number[][]);
    } else if (feature.geometry.type === 'MultiLineString') {
      for (const line of feature.geometry.coordinates as number[][][]) {
        group.lines.push(line);
      }
    }
  }

  const results: GeoFeature[] = [];

  for (const [, group] of groups) {
    if (group.lines.length === 0) continue;

    const roundedLines: MultiPositionList = group.lines.map(roundPositions);
    const multiLineFeature = {
      type: 'Feature' as const,
      geometry: {
        type: 'MultiLineString' as const,
        coordinates: roundedLines,
      },
      properties: {},
    };

    const lengthKm = Math.round(geoLength(multiLineFeature) * 6371.0088);

    // Pick a representative coordinate for label
    const firstLine = group.lines[0] ?? [];
    const longestLine = group.lines.reduce(
      (max, cur) => (cur.length > max.length ? cur : max),
      firstLine,
    );
    const midIdx = Math.floor(longestLine.length / 2);
    const midCoord = longestLine[midIdx] ?? [0, 0];

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
        coordinates: roundedLines,
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
