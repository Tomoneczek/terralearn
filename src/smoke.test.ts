import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrap } from '@/main';

describe('smoke test', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('verifies test environment and path alias support', () => {
    expect(true).toBe(true);
  });

  it('bootstraps the root element properly and mounts layout', () => {
    bootstrap();
    const app = document.getElementById('app');
    expect(app).not.toBeNull();
    expect(app?.getAttribute('data-ready')).toBe('true');
    expect(app?.querySelector('.rail')).not.toBeNull();
    expect(app?.querySelector('.panel')).not.toBeNull();
    expect(app?.querySelector('.stage')).not.toBeNull();
  });
});
