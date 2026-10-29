import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { RankingsDataSchema, RANKING_CATEGORIES, type RankingsData } from '@/rankings/types';

const DATA_DIR = path.resolve(process.cwd(), 'public/data');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));

const rankings: RankingsData = RankingsDataSchema.parse(read('rankings.json'));
const names = (category: (typeof RANKING_CATEGORIES)[number], n: number) =>
  rankings.categories[category].slice(0, n).map(r => r.name_en);

describe('rankings.json', () => {
  it('stays within the gzip budget (lazy-loaded, no geometry)', () => {
    const gzipKb =
      zlib.gzipSync(fs.readFileSync(path.join(DATA_DIR, 'rankings.json'))).length / 1024;
    expect(gzipKb).toBeLessThanOrEqual(140);
  });

  it('has the world top 3 of every well-known category', () => {
    expect(names('lakes', 3)).toEqual(['Caspian Sea', 'Superior', 'Victoria']);
    expect(names('rivers', 3)).toEqual(['Nile', 'Amazon', 'Yangtze']);
    expect(names('mountains', 3)).toEqual(['Himalayas', 'Karakoram', 'Hindu Kush']);
    expect(names('peaks', 3)).toEqual(['Mount Everest', 'K2', 'Kanchenjunga']);
    expect(names('countriesTopN', 2)).toEqual(['Russia', 'Antarctica']);
  });

  it('numbers every category 1…n without gaps; unranked rows have no number', () => {
    for (const category of RANKING_CATEGORIES) {
      const numbers = rankings.categories[category]
        .map(r => r.order)
        .filter((order): order is number => order !== null);
      expect(numbers, category).toEqual(numbers.map((_, i) => i + 1));
    }
  });

  it('keeps every object of the layer files, with a matching id and layer rank', () => {
    const sources = {
      lakes: ['lakes.json', 'lake'],
      rivers: ['rivers.json', 'river'],
      mountains: ['regions.json', 'mountain'],
      deserts: ['regions.json', 'desert'],
      landforms: ['landforms.json', 'landform'],
      marine: ['marine.json', 'marine'],
      countriesTopN: ['countries.json', 'country'],
      peaks: ['places.json', 'peak'],
      countriesPopulation: ['countries.json', 'country'],
      capitals: ['places.json', 'capital'],
    } as const;
    for (const [category, [file, kind]] of Object.entries(sources)) {
      const features: { properties: { id: string; kind: string; rank: { order?: number } } }[] =
        read(file).features.filter(
          (f: { properties: { kind: string } }) => f.properties.kind === kind,
        );
      const rows = rankings.categories[category as keyof typeof sources];
      const byId = new Map(rows.map(r => [r.id, r]));
      for (const f of features) {
        const row = byId.get(f.properties.id);
        expect(row, `${category}: ${f.properties.id}`).toBeDefined();
        expect(row?.layerOrder).toBe(f.properties.rank.order ?? 1);
      }
      // Rows beyond the layer's own objects are the table-only rivers from Wikidata
      const extra = rows.filter(r => r.layerOrder === undefined);
      expect(rows.length - extra.length, category).toBe(features.length);
      if (category !== 'rivers') expect(extra, category).toHaveLength(0);
    }
  });

  describe('rivers from Wikidata (table only)', () => {
    const rivers = rankings.categories.rivers;
    const extras = rivers.filter(r => r.layerOrder === undefined);

    it('adds notable rivers that have no geometry, with country names', () => {
      expect(extras.length).toBeGreaterThan(100);
      expect(extras.every(r => r.id.startsWith('river-wd-'))).toBe(true);
      expect(extras.every(r => r.value !== null && r.value >= 800)).toBe(true);
      const paraguay = extras.find(r => r.name_en === 'Paraguay River');
      expect(paraguay?.countries).toContain('BR');
    });

    it('ranks them together with the layer rivers by length, with the world top unchanged', () => {
      const values = rivers.map(r => r.value ?? 0);
      expect(values).toEqual([...values].sort((a, b) => b - a));
      expect(rivers.map(r => r.order)).toEqual(rivers.map((_, i) => i + 1));
      expect(names('rivers', 3)).toEqual(['Nile', 'Amazon', 'Yangtze']);
    });

    it('does not repeat a river the layer already has under another name', () => {
      const all = new Set(rivers.map(r => r.name_en));
      for (const duplicate of [
        'Yenisei',
        'Pearl River',
        'Irrawaddy River',
        'Solimões',
        'Olenyok',
      ]) {
        expect(all.has(duplicate), duplicate).toBe(false);
      }
      expect(new Set(rivers.map(r => r.name_en)).size).toBe(rivers.length);
    });

    it('leaves out wrong Wikidata values that would top the list', () => {
      expect(rivers.some(r => ['Bian River', 'Eridanos'].includes(r.name_en))).toBe(false);
    });

    it('has a card and a search entry for every one of them, with the same rank as the table', () => {
      const facts = read('facts.json');
      const search: { id: string }[] = read('search-index.json');
      const searchIds = new Set(search.map(s => s.id));
      for (const row of rivers) {
        const rank = facts[row.id]?.stats.find((s: { key: string }) => s.key === 'rank');
        expect(rank?.value, row.id).toBe(row.order);
      }
      for (const row of extras) expect(searchIds.has(row.id), row.id).toBe(true);
    });
  });

  it('has the peaks of Natural Earth and the missing summits from Wikidata', () => {
    const peaks = rankings.categories.peaks;
    expect(peaks.length).toBeGreaterThan(700);
    expect(peaks.map(r => r.name_en)).toEqual(
      expect.arrayContaining(['Makalu', 'Cho Oyu', 'Annapurna I']),
    );
    expect(new Set(peaks.map(r => r.id)).size).toBe(peaks.length);
    expect(peaks.every(r => r.layerOrder === r.order)).toBe(true);
  });

  it('orders peaks by height and keeps heights known for peaks', () => {
    const peaks = rankings.categories.peaks;
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i - 1]!.value!).toBeGreaterThanOrEqual(peaks[i]!.value!);
    }
  });

  it('resolves every referenced country code to names in both languages', () => {
    for (const category of RANKING_CATEGORIES) {
      for (const row of rankings.categories[category]) {
        for (const code of row.countries ?? []) {
          expect(rankings.countries[code], `${row.id} → ${code}`).toBeDefined();
        }
      }
    }
    expect(rankings.countries['PL']).toEqual({ pl: 'Polska', en: 'Poland' });
  });

  it('gives the longest river the largest extent for camera framing', () => {
    const nile = rankings.categories.rivers[0]!;
    expect(nile.extentKm).toBe(6650);
    expect(rankings.categories.peaks[0]!.extentKm).toBe(0);
  });

  describe('population rankings, unranked objects and curated lists', () => {
    const rank = (category: (typeof RANKING_CATEGORIES)[number], id: string) =>
      rankings.categories[category].find(r => r.id === id);

    it('ranks countries by inhabitants', () => {
      expect(names('countriesPopulation', 3)).toEqual([
        "People's Republic of China",
        'India',
        'United States of America',
      ]);
      expect(rankings.categories.countriesPopulation.every(r => r.value !== null)).toBe(true);
    });

    it('lists Antarctica with its value but without a number, and does not push others down', () => {
      for (const category of ['countriesTopN', 'countriesPopulation'] as const) {
        const aq = rank(category, 'AQ');
        expect(aq?.order, category).toBeNull();
        expect(aq?.value, category).toBeGreaterThan(0);
      }
      // By area Antarctica would be second; Canada keeps rank 2
      expect(rank('countriesTopN', 'CA')?.order).toBe(2);
      expect(rankings.categories.countriesTopN.filter(r => r.order === null)).toHaveLength(1);
    });

    it('keeps Antarctica out of the Top N drawn on the globe and off the world-rank of the cards', () => {
      const aq = rank('countriesTopN', 'AQ');
      expect(aq?.layerOrder).toBe(rankings.categories.countriesTopN.length);
      const facts = read('facts.json');
      expect(facts['AQ'].stats.some((s: { key: string }) => s.key === 'rank')).toBe(false);
      const canada = facts['CA'].stats.find((s: { key: string }) => s.key === 'rank');
      expect(canada.value).toBe(2);
    });

    it('lists capitals by population', () => {
      expect(rankings.categories.capitals).toHaveLength(200);
      expect(names('capitals', 2)).toEqual(['Tokyo', 'Mexico City']);
    });

    it('lists capitals and cities of at least one million together, each with its layer kind', () => {
      const cities = rankings.categories.cities;
      expect(cities.every(r => (r.value ?? 0) >= 1_000_000)).toBe(true);
      expect(new Set(cities.map(r => r.kind))).toEqual(new Set(['capital', 'megacity']));
      expect(cities[0]!.name_en).toBe('Tokyo');
      expect(cities.find(r => r.name_en === 'Warsaw')?.kind).toBe('capital');
    });

    it('has no "megacity" below the population threshold left in the layer', () => {
      const places = read('places.json').features.filter(
        (f: { properties: { kind: string } }) => f.properties.kind === 'megacity',
      );
      expect(places.length).toBeGreaterThan(300);
      expect(
        places.every(
          (f: { properties: { rank: { population: number } } }) =>
            f.properties.rank.population >= 1_000_000,
        ),
      ).toBe(true);
    });

    it('keeps only real deserts and marks parts of the Sahara as unranked parts', () => {
      const deserts = rankings.categories.deserts;
      const ids = new Set(deserts.map(r => r.id));
      for (const notDesert of ['desert-caatingas', 'desert-punjab', 'desert-salar-de-uyuni']) {
        expect(ids.has(notDesert), notDesert).toBe(false);
      }
      expect(names('deserts', 1)).toEqual(['Sahara']);
      const libyan = rank('deserts', 'desert-libyan-desert');
      expect(libyan).toMatchObject({ order: null, partOf: 'desert-sahara' });
      expect(rank('deserts', 'desert-gobi-desert')?.order).toBe(2);
      // Every unranked desert is a part of another one in the list
      for (const r of deserts.filter(d => d.order === null)) expect(ids.has(r.partOf!)).toBe(true);
    });

    it('agrees with the cards on the world rank of lakes, landforms and seas', () => {
      const facts = read('facts.json');
      for (const category of ['lakes', 'landforms', 'marine', 'countriesTopN'] as const) {
        for (const row of rankings.categories[category]) {
          const stat = facts[row.id]?.stats.find((s: { key: string }) => s.key === 'rank');
          if (stat) expect(stat.value, `${category}: ${row.id}`).toBe(row.order);
        }
      }
    });
  });
});
