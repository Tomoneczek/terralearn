import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('G11-03 Web App Manifest & PWA Assets', () => {
  const manifestPath = path.resolve(process.cwd(), 'public/manifest.webmanifest');

  it('manifest file exists and is valid JSON', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);
    expect(manifest).toBeTypeOf('object');
  });

  it('contains all required PWA manifest fields', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    expect(manifest.name).toBe('TerraLearn – Interaktywny Globus 3D');
    expect(manifest.short_name).toBe('TerraLearn');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.theme_color).toBe('#0a0e17');
    expect(manifest.background_color).toBe('#0a0e17');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  });

  it('references existing icon files including maskable', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const publicDir = path.resolve(process.cwd(), 'public');

    let hasMaskable = false;
    for (const icon of manifest.icons) {
      expect(icon.src).toBeDefined();
      const iconPath = path.join(publicDir, icon.src);
      expect(fs.existsSync(iconPath)).toBe(true);

      if (icon.purpose === 'maskable') {
        hasMaskable = true;
      }
    }

    expect(hasMaskable).toBe(true);
  });
});
