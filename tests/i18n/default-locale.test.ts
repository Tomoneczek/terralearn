import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { createInitialState } from '@/state/store';

// The app starts in English (ADR-0006, amended 2026-10-20); Polish stays one switch away.
describe('default interface language', () => {
  it('starts the translation module in English', async () => {
    vi.resetModules();
    const { getLocale, t } = await import('@/i18n');
    const { en } = await import('@/i18n/en');

    expect(getLocale()).toBe('en');
    expect(t('app.title')).toBe(en.app.title);
  });

  it('starts the app state in English', () => {
    expect(createInitialState().locale).toBe('en');
  });

  it('declares English in the static HTML shell', () => {
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    expect(html).toMatch(/<html lang="en">/);
  });

  // Regression: the static metadata (shown in link previews and the browser tab before the app
  // boots) used to stay Polish after the default language changed.
  it('keeps the static metadata free of Polish copy', () => {
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    const manifest = fs.readFileSync(
      path.resolve(process.cwd(), 'public/manifest.webmanifest'),
      'utf-8',
    );
    const polishChars = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
    expect(html).not.toMatch(polishChars);
    expect(manifest).not.toMatch(polishChars);
    expect(html).not.toContain('Interaktywny');
    expect(manifest).not.toContain('Interaktywny');
  });
});
