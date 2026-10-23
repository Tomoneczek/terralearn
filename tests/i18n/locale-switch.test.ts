import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import { savePersistedState, loadPersistedState, applyPersistedState } from '@/state/persistence';
import type { AppState } from '@/state/types';
import { t, setLocale, getLocale } from '@/i18n';

describe('G11-02 Locale Switch Logic & Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('pl');
  });

  describe('AppState & Store', () => {
    it('initializes with the English default locale', () => {
      const state = createInitialState();
      expect(state.locale).toBe('en');
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
        locale: 'pl',
      });

      expect(store.get().locale).toBe('pl');
      expect(notifiedLocale).toBe('pl');
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

    it('defaults to en if stored state has no locale', () => {
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
      expect(restored.locale).toBe('en');
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
