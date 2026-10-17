import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import { savePersistedState, loadPersistedState, applyPersistedState } from '@/state/persistence';
import type { AppState } from '@/state/types';
import { formatLabelText } from '@/globe/labels';
import { t, setLocale, getLocale } from '@/i18n';
import type { GeoFeature } from '@/globe/data-loader';

describe('G11-02 Locale Switch Logic & Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('pl');
  });

  describe('AppState & Store', () => {
    it('initializes with default locale pl', () => {
      const state = createInitialState();
      expect(state.locale).toBe('pl');
    });

    it('updates locale in store and notifies subscriber', () => {
      const store = createStore<AppState>(createInitialState());
      let notifiedLocale: string | null = null;

      store.subscribe(
        s => s.locale,
        loc => {
          notifiedLocale = loc;
        },
      );

      store.set({
        ...store.get(),
        locale: 'en',
      });

      expect(store.get().locale).toBe('en');
      expect(notifiedLocale).toBe('en');
    });
  });

  describe('Persistence', () => {
    it('persists and restores locale from localStorage', () => {
      const state = createInitialState();
      state.locale = 'en';

      savePersistedState(state);

      const persisted = loadPersistedState();
      expect(persisted).not.toBeNull();
      expect(persisted?.locale).toBe('en');

      const restored = applyPersistedState(createInitialState(), persisted!);
      expect(restored.locale).toBe('en');
    });

    it('defaults to pl if stored state has no locale', () => {
      const raw = {
        version: 1,
        theme: 'dark',
        quality: 'high',
        layers: {},
      };
      localStorage.setItem('terralearn_state_v1', JSON.stringify(raw));

      const persisted = loadPersistedState();
      expect(persisted).not.toBeNull();
      expect(persisted?.locale).toBeUndefined();

      const restored = applyPersistedState(createInitialState(), persisted!);
      expect(restored.locale).toBe('pl');
    });
  });

  describe('formatLabelText', () => {
    function createTestFeature(
      props: Partial<GeoFeature['properties']> & { id?: string | number },
    ): GeoFeature {
      const { id, ...rest } = props;
      return {
        type: 'Feature',
        id: id ?? 'feat_1',
        properties: {
          id: String(id ?? 'feat_1'),
          kind: 'country',
          layerId: 'countriesTopN',
          name_pl: '',
          name_en: '',
          ...rest,
        },
        geometry: { type: 'Point', coordinates: [0, 0] },
      };
    }

    it('prefers name_pl when locale is pl', () => {
      const feature = createTestFeature({
        id: 'PL',
        name_pl: 'Polska',
        name_en: 'Poland',
        name: 'Polska',
      });

      expect(formatLabelText(feature, 'pl')).toBe('Polska');
    });

    it('prefers name_en when locale is en', () => {
      const feature = createTestFeature({
        id: 'PL',
        name_pl: 'Polska',
        name_en: 'Poland',
        name: 'Polska',
      });

      expect(formatLabelText(feature, 'en')).toBe('Poland');
    });

    it('falls back to name_pl when name_en is absent in en mode', () => {
      const feature = createTestFeature({
        id: 'lake_1',
        name_pl: 'Jezioro Sniardwy',
        name_en: '',
      });

      expect(formatLabelText(feature, 'en')).toBe('Jezioro Sniardwy');
    });

    it('falls back to name_en when name_pl is absent in pl mode', () => {
      const feature = createTestFeature({
        id: 'river_1',
        name_pl: '',
        name_en: 'Amazon River',
      });

      expect(formatLabelText(feature, 'pl')).toBe('Amazon River');
    });

    it('falls back to id when no name properties exist', () => {
      const feature = createTestFeature({
        id: 'feature_99',
        name_pl: '',
        name_en: '',
      });

      expect(formatLabelText(feature, 'pl')).toBe('feature_99');
      expect(formatLabelText(feature, 'en')).toBe('feature_99');
    });
  });

  describe('setLocale & t() translations', () => {
    it('dynamically translates keys based on active locale', () => {
      setLocale('pl');
      expect(getLocale()).toBe('pl');
      expect(t('modes.language')).toBe('Język');
      expect(t('modes.langPl')).toBe('Polski');
      expect(t('modes.langEn')).toBe('English');

      setLocale('en');
      expect(getLocale()).toBe('en');
      expect(t('modes.language')).toBe('Language');
      expect(t('modes.langPl')).toBe('Polski');
      expect(t('modes.langEn')).toBe('English');
    });
  });
});
