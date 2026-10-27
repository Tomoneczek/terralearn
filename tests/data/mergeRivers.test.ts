import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  stitchSegments,
  orientRiverChains,
  KNOWN_MOUTHS,
  mergeRivers,
  type PositionList,
} from '../../scripts/data/mergeRivers';
import type { GeoFeatureCollection } from '../../scripts/data/schema';

describe('mergeRivers & River Flow Normalization', () => {
  describe('stitchSegments', () => {
    it('stitches end-to-start segments into a single continuous chain', () => {
      const seg1: PositionList = [
        [0, 0],
        [1, 1],
      ];
      const seg2: PositionList = [
        [1, 1],
        [2, 2],
      ];
      const result = stitchSegments([seg1, seg2]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([
        [0, 0],
        [1, 1],
        [2, 2],
      ]);
    });

    it('reverses second segment when endpoints meet end-to-end', () => {
      const seg1: PositionList = [
        [0, 0],
        [1, 1],
      ];
      const seg2: PositionList = [
        [2, 2],
        [1, 1],
      ]; // reversed
      const result = stitchSegments([seg1, seg2]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([
        [0, 0],
        [1, 1],
        [2, 2],
      ]);
    });

    it('stitches segments when endpoints meet start-to-start into continuous chain', () => {
      const seg1: PositionList = [
        [1, 1],
        [0, 0],
      ];
      const seg2: PositionList = [
        [1, 1],
        [2, 2],
      ];
      const result = stitchSegments([seg1, seg2]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([
        [2, 2],
        [1, 1],
        [0, 0],
      ]);
    });

    it('keeps disconnected segments as separate chains', () => {
      const seg1: PositionList = [
        [0, 0],
        [1, 1],
      ];
      const seg2: PositionList = [
        [10, 10],
        [11, 11],
      ];
      const result = stitchSegments([seg1, seg2]);
      expect(result).toHaveLength(2);
    });
  });

  describe('KNOWN_MOUTHS registry', () => {
    it('contains mouth coordinates for critical world rivers', () => {
      expect(KNOWN_MOUTHS['amazonas']).toBeDefined();
      expect(KNOWN_MOUTHS['mississippi']).toBeDefined();
      expect(KNOWN_MOUTHS['nile']).toBeDefined();
      expect(KNOWN_MOUTHS['volga']).toBeDefined();
      expect(KNOWN_MOUTHS['ob']).toBeDefined();
      expect(KNOWN_MOUTHS['lena']).toBeDefined();
      expect(KNOWN_MOUTHS['wisla']).toBeDefined();
    });
  });

  describe('orientRiverChains', () => {
    it('reverses chain if start is closer to mouth than end (upstream digitization)', () => {
      // Simulating Mississippi: mouth at [-89.2, 29.1]
      // digitized backwards from mouth [-89.2, 29.1] to source [-95.0, 47.1]
      const backwardsChain: PositionList = [
        [-89.2, 29.1],
        [-92.0, 38.0],
        [-95.0, 47.1],
      ];
      const oriented = orientRiverChains('mississippi', [backwardsChain]);
      expect(oriented).toHaveLength(1);
      // Now start must be source [-95.0, 47.1] and end must be mouth [-89.2, 29.1]
      expect(oriented[0]![0]).toEqual([-95.0, 47.1]);
      expect(oriented[0]![oriented[0]!.length - 1]).toEqual([-89.2, 29.1]);
    });

    it('leaves chain unchanged if end is already at the mouth', () => {
      // Simulating Nile: mouth at [31.2, 31.5]
      // already digitized from source [32.5, 15.6] to mouth [31.2, 31.5]
      const forwardChain: PositionList = [
        [32.5, 15.6],
        [32.0, 24.0],
        [31.2, 31.5],
      ];
      const oriented = orientRiverChains('nile', [forwardChain]);
      expect(oriented).toHaveLength(1);
      expect(oriented[0]![0]).toEqual([32.5, 15.6]);
      expect(oriented[0]![oriented[0]!.length - 1]).toEqual([31.2, 31.5]);
    });

    it('correctly handles delta branch orientation flowing towards the sea', () => {
      // Main stem: starts in Minnesota, ends at New Orleans mouth [-89.2, 29.1]
      const mainStem: PositionList = [
        [-95.0, 47.1],
        [-92.0, 38.0],
        [-89.2, 29.1],
      ];
      // Delta arm starting at junction [-89.2, 29.1] but digitized in reverse from ocean [-89.0, 29.0]
      const deltaArmBackwards: PositionList = [
        [-89.0, 29.0],
        [-89.2, 29.1],
      ];
      const oriented = orientRiverChains('mississippi', [mainStem, deltaArmBackwards]);
      expect(oriented).toHaveLength(2);
      // Delta arm must flow from junction [-89.2, 29.1] out to the sea [-89.0, 29.0]
      const orientedDelta = oriented[1]!;
      expect(orientedDelta[0]).toEqual([-89.2, 29.1]);
      expect(orientedDelta[orientedDelta.length - 1]).toEqual([-89.0, 29.0]);
    });
  });

  describe('mergeRivers full function', () => {
    it('groups, stitches, and orients features into GeoJSON output', () => {
      const rawMock = [
        {
          type: 'Feature' as const,
          properties: {
            name: 'Amazonas',
            name_en: 'Amazon',
          },
          geometry: {
            type: 'LineString' as const,
            // Backwards: mouth to source
            coordinates: [
              [-50.0, 0.0],
              [-60.0, -2.0],
              [-70.0, -4.0],
            ],
          },
        },
      ];
      const merged = mergeRivers(rawMock, { Amazonas: 'Amazonka' });
      expect(merged).toHaveLength(1);
      expect(merged[0]!.properties.name_pl).toBe('Amazonka');
      const coords = merged[0]!.geometry.coordinates[0]!;
      // Oriented from source (-70) to mouth (-50)
      expect(coords[0]![0]).toBe(-70.0);
      expect(coords[coords.length - 1]![0]).toBe(-50.0);
    });
  });

  describe('river systems', () => {
    const segment = (name: string, nameEn: string, coordinates: number[][]) => ({
      type: 'Feature' as const,
      properties: { name, name_en: nameEn },
      geometry: { type: 'LineString' as const, coordinates },
    });

    it('merges segments with different local names into one river (Yangtze regression)', () => {
      const merged = mergeRivers(
        [
          segment('Jinsha', 'Yangtze', [
            [95, 33],
            [100, 27],
          ]),
          segment('Chang Jiang', 'Yangtze', [
            [100, 27],
            [110, 30],
          ]),
          segment('Yangtze', 'Yangtze', [
            [110, 30],
            [121.8, 31.5],
          ]),
        ],
        { Yangtze: 'Jangcy', Jinsha: 'Jangcy (Dolina Złotego Piasku)' },
      );
      expect(merged).toHaveLength(1);
      expect(merged[0]!.properties.id).toBe('river-yangtze');
      expect(merged[0]!.properties.name_pl).toBe('Jangcy');
      expect(merged[0]!.properties.aliases).toEqual(
        expect.arrayContaining(['Jinsha', 'Chang Jiang']),
      );
    });

    it('merges explicit system members and uses the commonly cited length (Nile regression)', () => {
      const merged = mergeRivers(
        [
          segment('Victoria Nile', 'Victoria Nile', [
            [33, 0.5],
            [32, 2],
          ]),
          segment('El Bahr el Abyad', 'White Nile', [
            [32, 9],
            [32.5, 15.6],
          ]),
          segment('Nile', 'Nile', [
            [32.5, 15.6],
            [31.2, 31.5],
          ]),
          segment('El Bahr el Azraq', 'Blue Nile', [
            [37, 12],
            [32.5, 15.6],
          ]),
        ],
        { Nile: 'Nil' },
      );
      const names = merged.map(f => f.properties.name_en);
      expect(names).toEqual(['Nile', 'Blue Nile']);
      expect(merged[0]!.properties.rank.length).toBe(6650);
      expect(merged[0]!.properties.rank.order).toBe(1);
    });

    it('collapses repeated spaces in names ("São  Francisco")', () => {
      const merged = mergeRivers(
        [
          segment('São  Francisco', 'São  Francisco', [
            [-45, -20],
            [-36.4, -10.5],
          ]),
        ],
        {},
      );
      expect(merged[0]!.properties.name_en).toBe('São Francisco');
    });
  });

  describe('Output public/data/rivers.json Geographic Verification', () => {
    const riversPath = path.resolve(process.cwd(), 'public/data/rivers.json');
    const riversCol = JSON.parse(fs.readFileSync(riversPath, 'utf-8')) as GeoFeatureCollection;

    it('ranks Nile, Amazon and Yangtze as the three longest rivers, each a single feature', () => {
      const top = riversCol.features.slice(0, 3).map(f => f.properties.name_en);
      expect(top).toEqual(['Nile', 'Amazon', 'Yangtze']);
      const counts = new Map<string, number>();
      for (const f of riversCol.features) {
        counts.set(f.properties.name_en, (counts.get(f.properties.name_en) ?? 0) + 1);
      }
      expect([...counts].filter(([, n]) => n > 1)).toEqual([]);
    });

    function getRiverMainStem(name: string): PositionList {
      const feat = riversCol.features.find(
        f => f.properties.name_en === name || f.properties.name_pl === name,
      );
      expect(feat, `River ${name} must exist in rivers.json`).toBeDefined();
      const coords = feat!.geometry.coordinates as PositionList[];
      expect(coords.length).toBeGreaterThan(0);
      return coords[0]!;
    }

    it('Amazonka flows eastward from the Andes towards the Atlantic Ocean', () => {
      const main = getRiverMainStem('Amazon');
      const start = main[0]!;
      const end = main[main.length - 1]!;
      // Source in Peru/Andes (west, lng < -70)
      expect(start[0]).toBeLessThan(-70);
      // Mouth at Atlantic Ocean (east, lng > -55)
      expect(end[0]).toBeGreaterThan(-55);
    });

    it('Missisipi flows southward from Minnesota (Itasca) to Gulf of Mexico', () => {
      const main = getRiverMainStem('Mississippi');
      const start = main[0]!;
      const end = main[main.length - 1]!;
      // Source in Minnesota (north, lat > 45)
      expect(start[1]).toBeGreaterThan(45);
      // Mouth at Gulf of Mexico (south, lat < 30)
      expect(end[1]).toBeLessThan(30);
    });

    it('Nil flows northward from Sudan to Mediterranean Sea', () => {
      const main = getRiverMainStem('Nile');
      const start = main[0]!;
      const end = main[main.length - 1]!;
      // Source in south (lat < 20)
      expect(start[1]).toBeLessThan(20);
      // Mouth in north at Mediterranean (lat > 30)
      expect(end[1]).toBeGreaterThan(30);
    });

    it('Wołga flows southward from Valdai Hills into Caspian Sea', () => {
      const main = getRiverMainStem('Volga');
      const start = main[0]!;
      const end = main[main.length - 1]!;
      // Source in Valdai Hills (lat > 56)
      expect(start[1]).toBeGreaterThan(56);
      // Mouth at Caspian Sea (lat < 47)
      expect(end[1]).toBeLessThan(47);
    });

    it('Ob flows northward from Altai Mountains to Arctic Ocean (Gulf of Ob)', () => {
      const main = getRiverMainStem('Ob');
      const start = main[0]!;
      const end = main[main.length - 1]!;
      // Source in Altai (lat < 55)
      expect(start[1]).toBeLessThan(55);
      // Mouth at Gulf of Ob (lat > 65)
      expect(end[1]).toBeGreaterThan(65);
    });

    it('Wisła flows northward from Beskidy to Baltic Sea', () => {
      const main = getRiverMainStem('Wisła');
      const start = main[0]!;
      const end = main[main.length - 1]!;
      // Source in Beskidy (lat < 50)
      expect(start[1]).toBeLessThan(50);
      // Mouth at Baltic Sea (lat > 54)
      expect(end[1]).toBeGreaterThan(54);
    });
  });
});
