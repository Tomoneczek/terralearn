import { describe, it, expect } from 'vitest';
import { parseWikidata, nameKey, distanceDeg } from '../../scripts/data/wikidata';
import { mergePeaks } from '../../scripts/data/wikidataPeaks';
import { mergeRivers, EXCLUDED_NAMES, MIN_EXTRA_RIVER_KM } from '../../scripts/data/wikidataExtras';

const uri = (q: string) => ({ value: `http://www.wikidata.org/entity/${q}` });
const lit = (value: string) => ({ value });
const row = (q: string, name: string, extra: Record<string, string> = {}) => ({
  item: uri(q),
  itemLabel: lit(name),
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, lit(v)])),
});

describe('parseWikidata', () => {
  it('folds repeated rows into one entity and takes the median of conflicting values', () => {
    const [e, ...rest] = parseWikidata(
      [
        row('Q1', 'Nile', { km: '6853', coord: 'Point(31.2 30.1)', iso: 'EG' }),
        row('Q1', 'Nile', { km: '6650', coord: 'Point(31.2 30.1)', iso: 'SD' }),
        row('Q1', 'Nile', { km: '6695', coord: 'Point(32 3)', plLabel: 'Nil', iso: 'EG' }),
      ],
      'km',
    );
    expect(rest).toHaveLength(0);
    expect(e).toMatchObject({ qid: 'Q1', name_en: 'Nile', name_pl: 'Nil', value: 6695 });
    expect(e?.countries).toEqual(['EG', 'SD']);
  });

  it('does not depend on the order of the rows', () => {
    const rows = [
      row('Q1', 'A', { km: '900', coord: 'Point(10 20)' }),
      row('Q1', 'A', { km: '1100', coord: 'Point(11 21)' }),
      row('Q1', 'A', { km: '1000', coord: 'Point(9 19)' }),
    ];
    expect(parseWikidata(rows, 'km')).toEqual(parseWikidata([...rows].reverse(), 'km'));
  });

  it('drops items without an English label, a value or valid coordinates', () => {
    const entities = parseWikidata(
      [
        row('Q2', 'Q2', { km: '900', coord: 'Point(1 1)' }),
        row('Q3', 'No value', { coord: 'Point(1 1)' }),
        row('Q4', 'No point', { km: '900' }),
        row('Q5', 'Off the globe', { km: '900', coord: 'Point(500 95)' }),
        row('Q6', 'Fine', { km: '900', coord: 'Point(1 2)' }),
      ],
      'km',
    );
    expect(entities.map(e => e.qid)).toEqual(['Q6']);
    expect(entities[0]).toMatchObject({ lng: 1, lat: 2 });
  });

  it('ignores a Polish label that is only the Q-id, and reads grouped country lists (peaks)', () => {
    const [e] = parseWikidata(
      [
        row('Q7', 'K2', {
          ele: '8611',
          prom: '4020',
          coord: 'Point(76.5 35.9)',
          plLabel: 'Q7',
          countries: 'CN,PK',
        }),
      ],
      'ele',
    );
    expect(e?.name_pl).toBeUndefined();
    expect(e).toMatchObject({ value: 8611, prominence: 4020, countries: ['CN', 'PK'] });
  });

  it('sorts by value, biggest first', () => {
    const entities = parseWikidata(
      [
        row('Q10', 'Short', { km: '600', coord: 'Point(0 0)' }),
        row('Q11', 'Long', { km: '2000', coord: 'Point(0 0)' }),
      ],
      'km',
    );
    expect(entities.map(e => e.name_en)).toEqual(['Long', 'Short']);
  });
});

describe('nameKey / distanceDeg', () => {
  it('matches spellings of the same object', () => {
    expect(nameKey('Paraguay River')).toBe(nameKey('Paraguay'));
    expect(nameKey('Lago Titicaca')).toBe(nameKey('Titicaca'));
    expect(nameKey('Mount Everest')).toBe(nameKey('Everest'));
    expect(nameKey('Łaba')).toBe(nameKey('Laba'));
    expect(nameKey('São Francisco')).toBe(nameKey('Sao Francisco'));
  });

  it('measures distance across the antimeridian', () => {
    expect(distanceDeg({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeCloseTo(0.2, 5);
  });
});

describe('mergePeaks', () => {
  const entity = (name: string, value: number, lat: number, lng: number, pl?: string) => ({
    qid: `Q-${name}`,
    name_en: name,
    ...(pl ? { name_pl: pl } : {}),
    value,
    prominence: 2000,
    lat,
    lng,
    countries: [],
  });
  const existing = [
    { name_en: 'Mount Everest', lat: 27.99, lng: 86.92, elevation: 8848 },
    { name_en: 'Unnamed hill', lat: 10, lng: 10, elevation: 3000 },
  ];

  it('lends the Polish name to a peak with the same name or the same place, and adds the rest', () => {
    const { additions, polishNames } = mergePeaks(existing, [
      entity('Everest', 8848, 28, 87, 'Mount Everest (PL)'),
      entity('Different name, same spot', 3050, 10.01, 10.01, 'Wzgórze'),
      entity('Makalu', 8485, 27.9, 87.1, 'Makalu'),
    ]);
    expect(additions.map(a => a.name_en)).toEqual(['Makalu']);
    expect(polishNames.get(0)).toBe('Mount Everest (PL)');
    expect(polishNames.get(1)).toBe('Wzgórze');
  });

  it('keeps a neighbouring summit that is close but clearly higher or lower', () => {
    const { additions } = mergePeaks(existing, [entity('Lhotse', 8516, 27.96, 86.93)]);
    expect(additions.map(a => a.name_en)).toEqual(['Lhotse']);
  });

  it('adds only high peaks, highest first', () => {
    const { additions } = mergePeaks(existing, [
      entity('Low', 2400, 1, 1),
      entity('Mid', 3500, 2, 2),
      entity('High', 5000, 3, 3),
    ]);
    expect(additions.map(a => a.name_en)).toEqual(['High', 'Mid']);
  });
});

describe('mergeRivers', () => {
  const layer = [
    {
      properties: {
        id: 'river-nile',
        name_pl: 'Nil',
        name_en: 'Nile',
        aliases: ['White Nile'],
        rank: { length: 6650, order: 1 },
      },
    },
    {
      properties: {
        id: 'river-vistula',
        name_pl: 'Wisła',
        name_en: 'Vistula',
        rank: { length: 1047, order: 2 },
      },
    },
  ];
  const river = (name: string, km: number, pl?: string) => ({
    qid: `Q${km}`,
    name_en: name,
    ...(pl ? { name_pl: pl } : {}),
    value: km,
    lat: 1.234,
    lng: 5.678,
    countries: ['PL'],
  });

  it('adds only rivers the layer lacks (by name or alias), and only the long ones', () => {
    const { extras } = mergeRivers(layer, [
      river('White Nile', 3700),
      river('Wisła River', 1047, 'Wisła'),
      river('Warta', 808, 'Warta'),
      river('Brzoza', MIN_EXTRA_RIVER_KM - 1),
    ]);
    expect(extras.map(e => e.name_en)).toEqual(['Warta']);
    expect(extras[0]).toMatchObject({
      id: 'river-wd-q808',
      kind: 'river',
      name_pl: 'Warta',
      value: 808,
      lat: 1.23,
      lng: 5.68,
      countries: ['PL'],
    });
  });

  it('falls back to the English name and skips the known wrong entries', () => {
    const { extras } = mergeRivers(layer, [
      river('Eridanos', 5000),
      river('Bian River', 5806),
      river('Odra', 854),
    ]);
    expect(extras.map(e => [e.name_en, e.name_pl])).toEqual([['Odra', 'Odra']]);
    expect(EXCLUDED_NAMES.has(nameKey('Bian River'))).toBe(true);
  });

  it('ranks layer rivers and extras together by length', () => {
    const { orderById } = mergeRivers(layer, [river('Warta', 1200), river('Short', 900)]);
    expect(orderById.get('river-nile')).toBe(1);
    expect(orderById.get('river-wd-q1200')).toBe(2);
    expect(orderById.get('river-vistula')).toBe(3);
    expect(orderById.get('river-wd-q900')).toBe(4);
  });
});
