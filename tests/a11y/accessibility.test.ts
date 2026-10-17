import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToggleSwitch } from '@/ui/components/toggle';
import { createRail, type RailItem } from '@/ui/rail';
import { initLayout } from '@/ui/layout';
import { CloudsController } from '@/globe/clouds';
import { createStore, createInitialState } from '@/state/store';
import { Scene } from 'three';

// Mock Three.js TextureLoader to avoid network calls in test
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    TextureLoader: class MockTextureLoader {
      load() {
        return {
          dispose: vi.fn(),
        };
      }
    },
  };
});

// WCAG relative luminance formula
function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs = 0, gs = 0, bs = 0] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// WCAG contrast ratio (L1 + 0.05) / (L2 + 0.05)
function getContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = getRelativeLuminance(...rgb1);
  const l2 = getRelativeLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Accessibility & WCAG 2.1 AA Audit (T-03)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('WCAG 1.4.3 Contrast (Minimum 4.5:1 for normal text)', () => {
    it('satisfies AA contrast ratio in Dark theme', () => {
      // --bg-1: #0d1117 (13, 17, 23)
      const bgDark: [number, number, number] = [13, 17, 23];
      // --text-1: hsl(210 20% 96%) ≈ #f0f3f6 (240, 243, 246)
      const text1Dark: [number, number, number] = [240, 243, 246];
      // --text-2: hsl(215 15% 68%) ≈ #9eaab7 (158, 170, 183)
      const text2Dark: [number, number, number] = [158, 170, 183];

      const ratioText1 = getContrastRatio(text1Dark, bgDark);
      const ratioText2 = getContrastRatio(text2Dark, bgDark);

      expect(ratioText1).toBeGreaterThanOrEqual(7.0); // Exceeds AAA (7:1)
      expect(ratioText2).toBeGreaterThanOrEqual(4.5); // Meets AA (4.5:1)
    });

    it('satisfies AA contrast ratio in Light (Classic School Atlas) theme', () => {
      // --bg-1: #ffffff (255, 255, 255)
      const bgLight: [number, number, number] = [255, 255, 255];
      // --text-1: hsl(220 30% 12%) ≈ #151d28 (21, 29, 40)
      const text1Light: [number, number, number] = [21, 29, 40];
      // --text-2: hsl(215 20% 32%) ≈ #414f62 (65, 79, 98)
      const text2Light: [number, number, number] = [65, 79, 98];

      const ratioText1 = getContrastRatio(text1Light, bgLight);
      const ratioText2 = getContrastRatio(text2Light, bgLight);

      expect(ratioText1).toBeGreaterThanOrEqual(7.0); // Exceeds AAA (7:1)
      expect(ratioText2).toBeGreaterThanOrEqual(4.5); // Meets AA (4.5:1)
    });
  });

  describe('ARIA Roles and Labels on Interactive Elements', () => {
    it('ensures ToggleSwitch has role="switch" and responsive aria-checked state', () => {
      const toggle = new ToggleSwitch({
        checked: false,
        ariaLabel: 'Warstwa rzek',
      });

      expect(toggle.element.getAttribute('role')).toBe('switch');
      expect(toggle.element.getAttribute('aria-label')).toBe('Warstwa rzek');
      expect(toggle.element.getAttribute('aria-checked')).toBe('false');

      toggle.setChecked(true);
      expect(toggle.element.getAttribute('aria-checked')).toBe('true');
    });

    it('ensures Navigation Rail items have accessible labels and keyboard focusability', () => {
      const items: RailItem[] = [
        { id: 'explore', label: 'Eksploracja', iconSvg: '<svg></svg>', active: true },
        { id: 'quiz', label: 'Quiz', iconSvg: '<svg></svg>' },
      ];

      const rail = createRail(items);
      const buttons = rail.querySelectorAll<HTMLButtonElement>('button.rail-btn');

      expect(buttons.length).toBeGreaterThanOrEqual(2);
      buttons.forEach(btn => {
        expect(btn.getAttribute('aria-label')).toBeTruthy();
        expect(btn.getAttribute('type')).toBe('button');
      });
    });

    it('ensures Mobile and Panel headers have accessible aria-labels', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      initLayout(root);

      const dragHandle = root.querySelector('.panel-drag-handle');
      expect(dragHandle?.getAttribute('role')).toBe('button');
      expect(dragHandle?.getAttribute('aria-label')).toBeTruthy();

      const minimizeBtn = root.querySelector('#btn-panel-minimize');
      expect(minimizeBtn?.getAttribute('aria-label')).toBeTruthy();

      const fabBtn = root.querySelector('#btn-mobile-panel-toggle');
      expect(fabBtn?.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('Motion Safety (prefers-reduced-motion)', () => {
    it('halts continuous orbital auto-rotation when user prefers reduced motion', () => {
      const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      vi.stubGlobal('matchMedia', matchMediaMock);

      const scene = new Scene();
      const store = createStore(createInitialState());
      const controller = new CloudsController(scene, store);

      const mesh = controller.getMesh()!;
      const initialRotationY = mesh.rotation.y;

      controller.tick();

      // Rotation should remain constant when reduced motion is preferred
      expect(mesh.rotation.y).toBe(initialRotationY);

      controller.destroy();
    });
  });
});
