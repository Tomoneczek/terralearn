import { describe, it, expect } from 'vitest';
import { isDevMode } from '@/dev/dev-mode';

describe('isDevMode', () => {
  it('is true only for ?dev=true', () => {
    expect(isDevMode('?dev=true')).toBe(true);
    expect(isDevMode('?foo=1&dev=true')).toBe(true);
  });

  it('is false for missing, false-like or differently cased values', () => {
    for (const search of ['', '?', '?dev', '?dev=false', '?dev=1', '?dev=TRUE', '?devmode=true']) {
      expect(isDevMode(search)).toBe(false);
    }
  });
});
