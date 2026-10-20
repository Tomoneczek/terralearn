import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { LegendOverlay } from '@/ui/legend';
import { Toolbar } from '@/ui/toolbar';
import { HoverTooltip } from '@/ui/hover-tooltip';
import type { CameraController } from '@/globe/camera';

describe('UI Overlays', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('LegendOverlay', () => {
    it('renders list of active layers and updates reactively', () => {
      const store = createStore<AppState>({
        ...createInitialState(),
        layers: {
          ...createInitialState().layers,
          lakes: { enabled: true },
          mountains: { enabled: true },
          rivers: { enabled: false },
        },
      });

      const legend = new LegendOverlay({ container, store });
      const initialRows = container.querySelectorAll('.tl-legend-row');
      expect(initialRows.length).toBeGreaterThanOrEqual(2);

      // Disable lakes
      store.set({
        ...store.get(),
        layers: {
          ...store.get().layers,
          lakes: { enabled: false },
        },
      });

      const updatedRows = container.querySelectorAll('.tl-legend-row');
      expect(updatedRows.length).toBe(initialRows.length - 1);

      legend.destroy();
    });

    it('toggles collapsed class when toggle button is clicked', () => {
      const store = createStore<AppState>(createInitialState());
      const legend = new LegendOverlay({ container, store });

      const card = container.querySelector('.tl-legend-card')!;
      const toggleBtn = container.querySelector<HTMLButtonElement>('.tl-legend-toggle')!;

      expect(card.classList.contains('collapsed')).toBe(false);
      toggleBtn.click();
      expect(card.classList.contains('collapsed')).toBe(true);

      legend.destroy();
    });
  });

  describe('Toolbar', () => {
    it('invokes camera methods on button clicks', () => {
      const mockCamera = {
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        resetView: vi.fn(),
        toggleAutoRotate: vi.fn().mockReturnValue(true),
      } as unknown as CameraController;

      const toolbar = new Toolbar({ container, camera: mockCamera });
      const buttons = container.querySelectorAll<HTMLButtonElement>('.tl-toolbar-btn');
      expect(buttons.length).toBe(5);

      // Verify each button has a valid SVG element in the SVG namespace
      buttons.forEach(btn => {
        const svg = btn.querySelector('svg');
        expect(svg).toBeDefined();
        expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg');
      });

      // 1. Zoom In
      buttons[0]?.click();
      expect(mockCamera.zoomIn).toHaveBeenCalledTimes(1);

      // 2. Zoom Out
      buttons[1]?.click();
      expect(mockCamera.zoomOut).toHaveBeenCalledTimes(1);

      // 3. Reset View
      buttons[2]?.click();
      expect(mockCamera.resetView).toHaveBeenCalledTimes(1);

      // 4. Auto rotate
      buttons[3]?.click();
      expect(mockCamera.toggleAutoRotate).toHaveBeenCalledTimes(1);
      expect(buttons[3]?.classList.contains('active')).toBe(true);

      toolbar.destroy();
    });
  });

  describe('HoverTooltip', () => {
    it('shows and hides tooltip according to store hovered state', () => {
      const store = createStore<AppState>(createInitialState());
      const tooltip = new HoverTooltip({ container, store });

      const el = container.querySelector('.tl-hover-tooltip')!;
      expect(el.classList.contains('hidden')).toBe(true);

      // Hover on lake
      store.set({
        ...store.get(),
        hovered: {
          id: 'l1',
          layerId: 'lakes',
          kind: 'lake',
          name_pl: 'Jezioro Bajkał',
        },
      });

      expect(el.classList.contains('hidden')).toBe(false);
      const nameEl = el.querySelector('.tl-tooltip-name');
      expect(nameEl?.textContent).toBe('Jezioro Bajkał');

      // Unhover
      store.set({
        ...store.get(),
        hovered: null,
      });

      expect(el.classList.contains('hidden')).toBe(true);
      tooltip.destroy();
    });

    // Regression: the tooltip used to print the raw feature kind (e.g. "country").
    it('shows a translated kind label instead of the raw kind', () => {
      const store = createStore<AppState>(createInitialState());
      const tooltip = new HoverTooltip({ container, store });
      const el = container.querySelector('.tl-hover-tooltip')!;

      store.set({
        ...store.get(),
        locale: 'pl',
        hovered: { id: 'pl', layerId: 'countriesTopN', kind: 'country', name_pl: 'Polska' },
      });
      expect(el.querySelector('.tl-tooltip-kind')?.textContent).toBe('Kraj / Państwo');

      store.set({
        ...store.get(),
        locale: 'en',
        hovered: {
          id: 'pl',
          layerId: 'countriesTopN',
          kind: 'country',
          name_pl: 'Polska',
          name_en: 'Poland',
        },
      });
      expect(el.querySelector('.tl-tooltip-kind')?.textContent).toBe('Country / State');
      expect(el.querySelector('.tl-tooltip-name')?.textContent).toBe('Poland');

      tooltip.destroy();
      store.set({ ...store.get(), locale: 'pl' });
    });

    it('shows no kind label for unknown kinds', () => {
      const store = createStore<AppState>(createInitialState());
      const tooltip = new HoverTooltip({ container, store });
      const el = container.querySelector('.tl-hover-tooltip')!;

      store.set({
        ...store.get(),
        hovered: { id: 'x', layerId: 'lakes', kind: 'mystery_kind', name_pl: 'X' },
      });
      expect(el.querySelector('.tl-tooltip-kind')?.textContent).toBe('');

      tooltip.destroy();
    });
  });
});
