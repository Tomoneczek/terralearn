import { describe, it, expect, vi } from 'vitest';
import { createRail } from '@/ui/rail';
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
