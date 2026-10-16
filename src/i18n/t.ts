import { pl } from './pl';
import { en } from './en';
import type { Dictionary, I18nKey } from './types';

export type Locale = 'pl' | 'en';

let currentLocale: Locale = 'pl';

const dictionaries: Record<Locale, Dictionary> = {
  pl,
  en,
};

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Resolves a dot-notated translation key and optionally interpolates params.
 * e.g. t('layers.lakes') or t('quiz.errorDistance', { n: 42 })
 */
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] ?? pl;
  const parts = key.split('.');
  let current: unknown = dict;

  for (const part of parts) {
    if (typeof current === 'object' && current !== null && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }

  if (typeof current !== 'string') {
    return key;
  }

  if (!params) {
    return current;
  }

  return Object.entries(params).reduce<string>(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    current,
  );
}
