/**
 * River systems: Natural Earth splits big rivers into segments named after the local name
 * (Jinsha / Chang Jiang / Yangtze, Victoria Nile / Albert Nile / White Nile / Nile, ...).
 * Segments are grouped by their English name and by the explicit aliases below, so every
 * river is a single feature. Lengths of the 1:50m geometry are heavily underestimated
 * (missing headwaters, simplified lines), so ranking uses commonly cited lengths when known.
 */

export interface RiverSystem {
  /** English display name. */
  nameEn: string;
  /** Raw (local) segment name used for the feature id and the Polish name lookup. */
  primary: string;
  /** Normalised English names of segments belonging to this system. */
  members: readonly string[];
}

export const RIVER_SYSTEMS: readonly RiverSystem[] = [
  {
    nameEn: 'Nile',
    primary: 'Nile',
    members: ['nile', 'victoria nile', 'albert nile', 'mountain nile', 'white nile'],
  },
  {
    nameEn: 'Amazon',
    primary: 'Amazonas',
    members: ['amazonas', 'amazon', 'ucayali', 'marañón'],
  },
  { nameEn: 'Congo', primary: 'Congo', members: ['congo', 'lualaba'] },
  { nameEn: 'Rhine', primary: 'Rhine', members: ['rhine', 'rhein'] },
  { nameEn: 'Irtysh', primary: 'Irtysh', members: ['irtysh', 'ertis'] },
  { nameEn: 'Salween', primary: 'Salween', members: ['salween', 'nu'] },
  // English names that Natural Earth gives in transliteration or with typos.
  { nameEn: 'Yellow River', primary: 'Huang', members: ['huang', 'yellow'] },
  { nameEn: 'Lower Tunguska', primary: 'Lower Tunguska', members: ['nizhnyaya tunguska'] },
  { nameEn: 'Godavari', primary: 'Godävari', members: ['godävari'] },
];

/**
 * Commonly cited river lengths in km (encyclopedic values; sources differ by a few percent).
 * Keyed by the normalised English name of the merged river.
 */
export const RIVER_LENGTHS_KM: Readonly<Record<string, number>> = {
  nile: 6650,
  amazon: 6400,
  yangtze: 6300,
  mississippi: 3730,
  missouri: 3767,
  yenisey: 3487,
  'yellow river': 5464,
  ob: 3650,
  paraná: 4880,
  congo: 4700,
  amur: 2824,
  lena: 4400,
  mekong: 4350,
  mackenzie: 1738,
  niger: 4180,
  irtysh: 4248,
  volga: 3530,
  murray: 2508,
  darling: 1472,
  madeira: 3250,
  yukon: 3190,
  indus: 3180,
  'são francisco': 2830,
  'syr darya': 2212,
  salween: 2815,
  'rio grande': 3051,
  'lower tunguska': 2989,
  danube: 2850,
  brahmaputra: 2900,
  euphrates: 2800,
  tigris: 1850,
  ganges: 2525,
  zambezi: 2574,
  tocantins: 2450,
  xingu: 2640,
  orinoco: 2140,
  'amu darya': 2540,
  kolyma: 2129,
  colorado: 2330,
  dnieper: 2201,
  ural: 2428,
  orange: 2200,
  don: 1870,
  aldan: 2273,
  vilyuy: 2650,
  kama: 1805,
  arkansas: 2364,
  ohio: 1579,
  columbia: 2000,
  angara: 1779,
  indigirka: 1726,
  olenëk: 2292,
  pechora: 1809,
  negro: 2250,
  uruguay: 1838,
  peace: 1923,
  limpopo: 1750,
  tapajós: 1992,
  dniester: 1362,
  vistula: 1047,
  rhine: 1233,
  elbe: 1094,
  oder: 840,
  loire: 1006,
  tagus: 1007,
  yamuna: 1376,
  godavari: 1465,
  krishna: 1400,
  fraser: 1375,
  nelson: 644,
  churchill: 1609,
  athabasca: 1231,
  snake: 1735,
  tennessee: 1049,
  kasai: 2153,
  ubangi: 1060,
  benue: 1400,
  okavango: 1600,
  helmand: 1150,
  tarim: 2030,
  vychegda: 1130,
  tobol: 1591,
  taz: 1401,
  xi: 2214,
  han: 1532,
  ayeyarwady: 2170,
  sutlej: 1450,
  chenab: 974,
  narmada: 1312,
};

const SYSTEM_BY_MEMBER = new Map<string, RiverSystem>(
  RIVER_SYSTEMS.flatMap(system => system.members.map(m => [m, system] as const)),
);

/** Trims and collapses repeated spaces (Natural Earth has e.g. "São  Francisco"). */
export function cleanRiverName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normaliseRiverName(name: string): string {
  return cleanRiverName(name).toLowerCase();
}

/** Grouping key of a raw segment: its system's English name, otherwise its own English name. */
export function riverSystemKey(nameEn: string): string {
  const key = normaliseRiverName(nameEn);
  const system = SYSTEM_BY_MEMBER.get(key);
  return system ? normaliseRiverName(system.nameEn) : key;
}

export function findRiverSystem(key: string): RiverSystem | undefined {
  return RIVER_SYSTEMS.find(s => normaliseRiverName(s.nameEn) === key);
}

/** Commonly cited length when known, otherwise the length measured on the geometry. */
export function riverLengthKm(key: string, measuredKm: number): number {
  return RIVER_LENGTHS_KM[key] ?? measuredKm;
}
