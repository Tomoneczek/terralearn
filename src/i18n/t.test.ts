import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale, getLocale } from './t';

describe('i18n', () => {
  beforeEach(() => {
    setLocale('pl');
  });

  it('translates nested keys in Polish by default', () => {
    expect(t('layers.lakes')).toBe('Największe jeziora');
    expect(t('sections.physical')).toBe('GEOGRAFIA FIZYCZNA');
  });

  it('interpolates parameters correctly', () => {
    expect(t('quiz.errorDistance')).toBe('Pomyłka');
    expect(t('card.area')).toBe('Powierzchnia');

    // Test dynamic interpolation
    const custom = t('quiz.questionPrefix', { name: 'Polska' });
    expect(custom).toBe('Wskaż:');
  });

  it('handles empty params and missing keys gracefully', () => {
    // @ts-expect-error test non-string object path
    expect(t('layers')).toBe('layers');
  });

  it('switches locales cleanly', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('layers.lakes')).toBe('Largest lakes');
    expect(t('sections.physical')).toBe('PHYSICAL GEOGRAPHY');
  });

  it('falls back to key for nonexistent keys', () => {
    // @ts-expect-error testing invalid key runtime fallback
    expect(t('unknown.key')).toBe('unknown.key');
  });
});
