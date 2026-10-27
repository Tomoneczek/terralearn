import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '@/i18n';
import { formatComparison, formatStat, kindLabel } from '@/ui/facts-format';

describe('facts formatting', () => {
  beforeEach(() => setLocale('en'));

  it('labels kinds by subtype first, then kind, then a generic fallback', () => {
    expect(kindLabel('marine', 'strait')).toBe('Strait');
    expect(kindLabel('landform', 'unknown-subtype')).toBe('Landform');
    expect(kindLabel('mountain_range')).toBe('Mountain range');
    expect(kindLabel('something-new')).toBe('Geographic feature');
    expect(kindLabel(undefined)).toBe('Geographic feature');
    setLocale('pl');
    expect(kindLabel('landform', 'plateau')).toBe('Wyżyna / Płaskowyż');
  });

  it('formats stats with locale separators and units', () => {
    expect(formatStat({ key: 'area', value: 9_984_670 })).toEqual({
      label: 'Area',
      value: '9,984,670 km²',
    });
    expect(formatStat({ key: 'rank', value: 3 })).toEqual({ label: 'World rank', value: '#3' });
    setLocale('pl');
    expect(formatStat({ key: 'maxElevation', value: 8848 })).toEqual({
      label: 'Najwyższy szczyt',
      value: '8848 m n.p.m.',
    });
  });

  it('uses "×" above 1 and a percentage below, with one decimal under 10', () => {
    expect(formatComparison({ metric: 'length', ref: 'vistula', ratio: 6.351 })).toBe(
      'Length ≈ 6.4× the Vistula',
    );
    expect(formatComparison({ metric: 'area', ref: 'sniardwy', ratio: 275.844 })).toBe(
      'Area ≈ 276× Lake Śniardwy',
    );
    expect(formatComparison({ metric: 'area', ref: 'poland', ratio: 0.0412 })).toBe(
      'Area ≈ 4.1% of Poland',
    );
    setLocale('pl');
    expect(formatComparison({ metric: 'area', ref: 'poland', ratio: 1.097 })).toBe(
      'Powierzchnia równa ok. 1,1x terytorium Polski',
    );
    expect(formatComparison({ metric: 'area', ref: 'poland', ratio: 0.989 })).toBe(
      'Powierzchnia stanowi ok. 99% powierzchni Polski',
    );
  });
});
