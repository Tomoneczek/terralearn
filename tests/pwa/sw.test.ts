import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('G11-03 Service Worker Script Content & Strategy', () => {
  const swPath = path.resolve(process.cwd(), 'public/sw.js');

  it('sw.js file exists and is non-empty', () => {
    expect(fs.existsSync(swPath)).toBe(true);
    const content = fs.readFileSync(swPath, 'utf-8');
    expect(content.length).toBeGreaterThan(100);
  });

  it('defines cache names and event listeners', () => {
    const content = fs.readFileSync(swPath, 'utf-8');

    expect(content).toContain('CACHE_VERSION');
    expect(content).toContain('STATIC_CACHE');
    expect(content).toContain('RUNTIME_CACHE');
    expect(content).toContain("addEventListener('install'");
    expect(content).toContain("addEventListener('activate'");
    expect(content).toContain("addEventListener('fetch'");
  });

  it('precaches critical core assets for offline booting', () => {
    const content = fs.readFileSync(swPath, 'utf-8');

    expect(content).toContain("'index.html'");
    expect(content).toContain("'favicon.svg'");
    expect(content).toContain("'manifest.webmanifest'");
    expect(content).toContain("'textures/water-mask.png'");
    expect(content).toContain("'data/search-index.json'");
  });

  it('implements Cache-First for textures, data and hashed assets', () => {
    const content = fs.readFileSync(swPath, 'utf-8');

    expect(content).toContain("includes('/textures/')");
    expect(content).toContain("includes('/data/')");
    expect(content).toContain("includes('/assets/')");
  });

  it('implements Network-First for navigation mode requests', () => {
    const content = fs.readFileSync(swPath, 'utf-8');

    expect(content).toContain("request.mode === 'navigate'");
    expect(content).toContain('fetch(request)');
  });
});
