import { t, getLocale, type I18nKey } from '@/i18n';
import type { FactComparison, FactStat } from '../../scripts/data/buildSearchAndFacts';

const NUMBER_LOCALES = { pl: 'pl-PL', en: 'en-US' } as const;

export function formatNumber(value: number, maxDigits = 0): string {
  return value.toLocaleString(NUMBER_LOCALES[getLocale()], {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  });
}

/** One decimal below 10 ("2.4×", "4.2%"), whole numbers above ("276×", "42%"). */
function formatRatio(value: number): string {
  return formatNumber(value, value >= 10 ? 0 : 1);
}

/** Translated kind of a feature, preferring the landform/marine subtype ("Plateau", "Strait"). */
export function kindLabel(kind: string | undefined, subtype?: string): string {
  for (const key of [subtype, kind === 'mountain_range' ? 'mountain' : kind]) {
    if (!key) continue;
    const label = t(`card.kinds.${key}` as I18nKey);
    if (label !== `card.kinds.${key}`) return label;
  }
  return t('card.kinds.other');
}

const STAT_LABEL: Record<FactStat['key'], I18nKey> = {
  area: 'card.area',
  population: 'card.population',
  length: 'card.length',
  elevation: 'card.elevation',
  maxElevation: 'card.maxElevation',
  rank: 'card.worldRank',
};

const STAT_VALUE: Record<FactStat['key'], I18nKey> = {
  area: 'card.values.area',
  population: 'card.values.population',
  length: 'card.values.length',
  elevation: 'card.values.elevation',
  maxElevation: 'card.values.elevation',
  rank: 'card.values.rank',
};

export function formatStat(stat: FactStat): { label: string; value: string } {
  return {
    label: t(STAT_LABEL[stat.key]),
    value: t(STAT_VALUE[stat.key], { value: formatNumber(stat.value) }),
  };
}

/** "Area ≈ 2.4× Poland" or "Area ≈ 42% of Poland" in the current locale. */
export function formatComparison(comparison: FactComparison): string {
  const metric = t(`card.metrics.${comparison.metric}` as I18nKey);
  if (comparison.ratio >= 1) {
    return t('card.compareTimes', {
      metric,
      ratio: formatRatio(comparison.ratio),
      ref: t(`card.refsTimes.${comparison.ref}` as I18nKey),
    });
  }
  return t('card.comparePercent', {
    metric,
    pct: formatRatio(comparison.ratio * 100),
    ref: t(`card.refsPercent.${comparison.ref}` as I18nKey),
  });
}
