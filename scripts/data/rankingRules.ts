/**
 * Curated rules that decide what appears in the rankings and what counts towards the rank number
 * (LP). Everything here is deliberately an explicit, short list: Natural Earth does not classify
 * these cases consistently. See ADR-0062.
 */

/** Listed in the rankings with its value, but not counted: not a country (research stations only). */
export const UNRANKED_COUNTRY_IDS: ReadonlySet<string> = new Set(['AQ']);

/**
 * Natural Earth `Desert` regions that are not deserts: a semi-arid region (Caatinga), a province
 * (Punjab), a park (Big Bend), mountains, a plateau, and salt flats / pans (landforms).
 */
export const NOT_DESERT_IDS: ReadonlySet<string> = new Set([
  'desert-caatingas',
  'desert-punjab',
  'desert-big-bend',
  'desert-jabal-as-sawda',
  'desert-tassili-oua-n-ahaggar',
  'desert-salar-de-uyuni',
  'desert-makgadikgadi-pan',
  'desert-etosha-pan',
  'desert-great-salt-lake-desert',
]);

/**
 * Desert regions lying inside a larger desert, with the id of that desert. They stay on the globe
 * and in the table but have no rank number, so the list is not "Sahara, then pieces of Sahara".
 */
export const DESERT_PART_OF: Readonly<Record<string, string>> = Object.fromEntries(
  [
    'desert-libyan-desert',
    'desert-western-desert',
    'desert-eastern-desert',
    'desert-nubian-desert',
    'desert-tenere',
    'desert-erg-chech',
    'desert-sarir-kalanshiyu-ar-ramli-al-kabi',
    'desert-el-djouf',
    'desert-hamada-du-draa',
    'desert-tassili-n-ajjer',
    'desert-grand-erg-oriental',
    'desert-grand-erg-occidental',
    'desert-hamada-de-tinrhert',
    'desert-trarza',
    'desert-akchar',
    'desert-erg-iguidi',
    'desert-idhan-murzuq',
  ].map(id => [id, 'desert-sahara']),
);

/**
 * Smallest agglomeration shown as a "large city". Natural Earth's `megacity` flag is not about size
 * (only 11 of the 492 flagged places had 10 million people), so the population decides.
 */
export const MIN_CITY_POPULATION = 1_000_000;
