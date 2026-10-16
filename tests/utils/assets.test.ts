import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveAssetUrl } from '@/utils/assets';

describe('resolveAssetUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves relative and root-relative paths with default BASE_URL ("/")', () => {
    vi.stubEnv('BASE_URL', '/');

    expect(resolveAssetUrl('/data/lakes.json')).toBe('/data/lakes.json');
    expect(resolveAssetUrl('data/lakes.json')).toBe('/data/lakes.json');
    expect(resolveAssetUrl('textures/earth.jpg')).toBe('/textures/earth.jpg');
    expect(resolveAssetUrl('/textures/earth.jpg')).toBe('/textures/earth.jpg');
  });

  it('resolves relative and root-relative paths with custom BASE_URL ("/terralearn/")', () => {
    vi.stubEnv('BASE_URL', '/terralearn/');

    expect(resolveAssetUrl('/data/lakes.json')).toBe('/terralearn/data/lakes.json');
    expect(resolveAssetUrl('data/lakes.json')).toBe('/terralearn/data/lakes.json');
    expect(resolveAssetUrl('/textures/night.png')).toBe('/terralearn/textures/night.png');
  });

  it('normalizes base URL if trailing slash is missing', () => {
    vi.stubEnv('BASE_URL', '/terralearn');

    expect(resolveAssetUrl('/data/mountains.json')).toBe('/terralearn/data/mountains.json');
    expect(resolveAssetUrl('data/mountains.json')).toBe('/terralearn/data/mountains.json');
  });

  it('leaves external URLs untouched', () => {
    vi.stubEnv('BASE_URL', '/terralearn/');

    expect(resolveAssetUrl('https://example.com/map.geojson')).toBe(
      'https://example.com/map.geojson',
    );
    expect(resolveAssetUrl('http://localhost:3000/asset.png')).toBe(
      'http://localhost:3000/asset.png',
    );
    expect(resolveAssetUrl('//cdn.jsdelivr.net/npm/three')).toBe('//cdn.jsdelivr.net/npm/three');
  });

  it('leaves data: and blob: URIs untouched', () => {
    vi.stubEnv('BASE_URL', '/terralearn/');

    expect(resolveAssetUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(
      'data:image/svg+xml;base64,PHN2Zz4=',
    );
    expect(resolveAssetUrl('blob:http://localhost:3000/abc-123')).toBe(
      'blob:http://localhost:3000/abc-123',
    );
  });
});
