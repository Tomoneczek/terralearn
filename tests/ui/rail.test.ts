import { describe, it, expect, vi } from 'vitest';
import { createRail, updateRailLabels } from '@/ui/rail';
import { SVG_NAMESPACE } from '@/ui/dom';

describe('createRail', () => {
  it('creates rail with logo and nav buttons with valid SVG namespace', () => {
    const onSelect = vi.fn();
    const items = [
      {
        id: 'explore',
        label: 'Eksploracja',
        active: true,
        iconSvg:
          '<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
      },
      {
        id: 'layers',
        label: 'Warstwy',
        iconSvg:
          '<svg width="20" height="20" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/></svg>',
      },
    ];

    const rail = createRail(items, onSelect);
    const buttons = rail.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons.length).toBe(3);

    // Verify all buttons contain SVG with correct namespace
    buttons.forEach(btn => {
      const svg = btn.querySelector('svg');
      expect(svg).toBeDefined();
      expect(svg?.namespaceURI).toBe(SVG_NAMESPACE);
    });

    const logoBtn = buttons[0];
    const exploreBtn = buttons[1];
    const layersBtn = buttons[2];

    expect(logoBtn?.className).toContain('rail-logo');
    expect(exploreBtn?.className).toContain('active');
    expect(layersBtn?.className).not.toContain('active');

    // Clicking nav button updates active class and triggers onSelect
    layersBtn?.click();
    expect(exploreBtn?.className).not.toContain('active');
    expect(layersBtn?.className).toContain('active');
    expect(onSelect).toHaveBeenCalledWith('layers');
  });
});

describe('rail labels', () => {
  const items = [
    {
      id: 'explore',
      label: 'Explore',
      iconSvg: '<svg width="20" height="20"><circle r="4"/></svg>',
    },
    {
      id: 'settings',
      label: 'Settings',
      iconSvg: '<svg width="20" height="20"><circle r="4"/></svg>',
    },
  ];

  it('uses the given navigation and home labels and tags buttons by id', () => {
    const rail = createRail(items, undefined, { navAria: 'Quick navigation', home: 'Home' });
    expect(rail.getAttribute('aria-label')).toBe('Quick navigation');
    expect(rail.querySelector('.rail-logo')?.getAttribute('aria-label')).toBe('Home');
    expect(rail.querySelector('[data-rail-id="settings"]')).not.toBeNull();
  });

  // Regression: the rail labels were hard-coded Polish strings and never followed the language.
  it('re-translates the labels in place', () => {
    const rail = createRail(items, undefined, { navAria: 'Quick navigation', home: 'Home' });
    updateRailLabels(rail, {
      navAria: 'Szybka nawigacja',
      home: 'Strona główna',
      items: { explore: 'Eksploracja', settings: 'Ustawienia' },
    });

    expect(rail.getAttribute('aria-label')).toBe('Szybka nawigacja');
    expect(rail.querySelector('.rail-logo')?.getAttribute('aria-label')).toBe('Strona główna');
    const settings = rail.querySelector<HTMLButtonElement>('[data-rail-id="settings"]')!;
    expect(settings.getAttribute('aria-label')).toBe('Ustawienia');
    expect(settings.title).toBe('Ustawienia');
  });
});
