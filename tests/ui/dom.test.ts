import { describe, it, expect } from 'vitest';
import { parseSvg, SVG_NAMESPACE } from '@/ui/dom';

describe('parseSvg', () => {
  it('parses SVG strings without xmlns and attaches correct SVG namespace', () => {
    const raw =
      '<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
    const el = parseSvg(raw);

    expect(el).toBeDefined();
    expect(el.tagName.toLowerCase()).toBe('svg');
    expect(el.namespaceURI).toBe(SVG_NAMESPACE);
    expect(el.querySelector('circle')).toBeDefined();
    expect(el.querySelector('circle')?.getAttribute('cx')).toBe('12');
  });

  it('preserves existing xmlns if provided in svg string', () => {
    const raw = `<svg xmlns="${SVG_NAMESPACE}" width="24" height="24"><line x1="0" y1="0" x2="10" y2="10"/></svg>`;
    const el = parseSvg(raw);

    expect(el.namespaceURI).toBe(SVG_NAMESPACE);
    expect(el.querySelector('line')).toBeDefined();
  });

  it('handles multiline SVGs with nested elements and attributes', () => {
    const raw = `
      <svg width="28" height="28" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="#0b0e14" stroke="#38bdf8" stroke-width="4"/>
        <ellipse cx="50" cy="50" rx="46" ry="18" fill="none" stroke="#0ea5e9" stroke-width="2"/>
      </svg>
    `;
    const el = parseSvg(raw);

    expect(el.tagName.toLowerCase()).toBe('svg');
    expect(el.namespaceURI).toBe(SVG_NAMESPACE);
    expect(el.querySelectorAll('circle, ellipse').length).toBe(2);
  });

  it('falls back safely to HTML parser when XML parser has errors', () => {
    // Malformed XML attribute syntax or unclosed entity that HTML5 parser can recover from
    const raw = '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" >';
    const el = parseSvg(raw);

    expect(el).toBeDefined();
    expect(el.tagName.toLowerCase()).toBe('svg');
    expect(el.namespaceURI).toBe(SVG_NAMESPACE);
  });
});
