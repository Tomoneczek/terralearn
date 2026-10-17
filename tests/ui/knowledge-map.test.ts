import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { SidebarController } from '@/ui/sidebar';
import { LegendOverlay } from '@/ui/legend';
import { LayerCompositor, type GlobeCompositorTarget } from '@/globe/compositor';
import { saveSrsState, clearSrsState, type SrsState } from '@/quiz/srs';
import { SRS_STATUS_COLORS } from '@/layers/styles';
import type { GeoFeature } from '@/globe/data-loader';

describe('Knowledge Map UI & Integration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    clearSrsState();
  });

  afterEach(() => {
    container.remove();
    localStorage.clear();
    clearSrsState();
    vi.restoreAllMocks();
  });

  describe('SidebarController Knowledge Map Toggle', () => {
    it('initializes with knowledgeMap unchecked and toggles store on click', () => {
      const store = createStore<AppState>(createInitialState());
      const sidebar = new SidebarController({ container, store });

      expect(store.get().knowledgeMap).toBe(false);

      // Locate Knowledge Map button toggle switch
      const toggles = container.querySelectorAll<HTMLButtonElement>('button[role="switch"]');
      const kmToggle = Array.from(toggles).find(t =>
        t.getAttribute('aria-label')?.includes('Mapa opanowania'),
      );
      expect(kmToggle).toBeDefined();
      expect(kmToggle!.getAttribute('aria-checked')).toBe('false');

      // Toggle it on
      kmToggle!.click();
      expect(store.get().knowledgeMap).toBe(true);
      expect(kmToggle!.getAttribute('aria-checked')).toBe('true');

      // Programmatic store update reflects in UI
      store.set({ ...store.get(), knowledgeMap: false });
      expect(kmToggle!.getAttribute('aria-checked')).toBe('false');

      sidebar.destroy();
    });
  });

  describe('LegendOverlay in Knowledge Map mode', () => {
    it('renders SRS status palette and updates when srsState changes', () => {
      const baseTime = 1700000000000;
      const mockSrs: SrsState = {
        PL: {
          id: 'PL',
          box: 5,
          lastReviewed: baseTime,
          nextReview: baseTime + 14 * 86400000,
          consecutiveCorrect: 5,
          totalAttempts: 5,
          successCount: 5,
        },
        DE: {
          id: 'DE',
          box: 2,
          lastReviewed: baseTime,
          nextReview: baseTime + 86400000,
          consecutiveCorrect: 1,
          totalAttempts: 1,
          successCount: 1,
        },
      };
      saveSrsState(mockSrs);

      const store = createStore<AppState>({
        ...createInitialState(),
        knowledgeMap: false,
      });

      const legend = new LegendOverlay({ container, store });

      // In normal mode, no SRS section title
      expect(container.querySelector('.tl-legend-section-title')).toBeNull();

      // Turn on knowledgeMap
      store.set({ ...store.get(), knowledgeMap: true });

      const srsTitle = container.querySelector('.tl-legend-section-title');
      expect(srsTitle).not.toBeNull();
      expect(srsTitle!.textContent).toContain('Stan opanowania');

      // Check stats: 1 mastered out of 2 total
      const statsVal = container.querySelector('.tl-legend-stats-val');
      expect(statsVal).not.toBeNull();
      expect(statsVal!.textContent).toBe('1 / 2');

      // Update SRS with another mastered item and fire event
      const updatedSrs: SrsState = {
        ...mockSrs,
        DE: {
          ...mockSrs.DE!,
          box: 5,
        },
      };
      saveSrsState(updatedSrs);

      // Check stats updated reactively to 2 / 2
      const updatedStatsVal = container.querySelector('.tl-legend-stats-val');
      expect(updatedStatsVal!.textContent).toBe('2 / 2');

      legend.destroy();
    });
  });

  describe('LayerCompositor Knowledge Map Styling', () => {
    it('applies SRS colors when knowledgeMap is true and respects selection/hover precedence', () => {
      const baseTime = 1700000000000;
      const mockSrs: SrsState = {
        PL: {
          id: 'PL',
          box: 5,
          lastReviewed: baseTime,
          nextReview: baseTime + 14 * 86400000,
          consecutiveCorrect: 5,
          totalAttempts: 5,
          successCount: 5,
        },
        'river-amazon': {
          id: 'river-amazon',
          box: 1,
          lastReviewed: baseTime,
          nextReview: baseTime,
          consecutiveCorrect: 0,
          totalAttempts: 2,
          successCount: 0,
        },
      };
      saveSrsState(mockSrs);

      const store = createStore<AppState>({
        ...createInitialState(),
        knowledgeMap: false,
      });

      let capColorFn: (feat: GeoFeature) => string = () => '';
      let strokeColorFn: (feat: GeoFeature) => string = () => '';
      let pathColorFn: (item: { feature: GeoFeature; points: number[][] }) => string = () => '';

      const mockGlobe: GlobeCompositorTarget = {
        polygonsData: vi.fn(),
        polygonCapColor: vi.fn(fn => {
          capColorFn = fn;
          return mockGlobe;
        }),
        polygonSideColor: vi.fn().mockReturnThis(),
        polygonStrokeColor: vi.fn(fn => {
          strokeColorFn = fn;
          return mockGlobe;
        }),
        polygonAltitude: vi.fn().mockReturnThis(),
        pathsData: vi.fn(),
        pathPoints: vi.fn().mockReturnThis(),
        pathPointLat: vi.fn().mockReturnThis(),
        pathPointLng: vi.fn().mockReturnThis(),
        pathPointAlt: vi.fn().mockReturnThis(),
        pathColor: vi.fn(fn => {
          pathColorFn = fn;
          return mockGlobe;
        }),
        pathStroke: vi.fn().mockReturnThis(),
        pointsData: vi.fn(),
        pointLat: vi.fn().mockReturnThis(),
        pointLng: vi.fn().mockReturnThis(),
        pointColor: vi.fn().mockReturnThis(),
        pointRadius: vi.fn().mockReturnThis(),
        pointAltitude: vi.fn().mockReturnThis(),
        labelsData: vi.fn(),
        labelLat: vi.fn().mockReturnThis(),
        labelLng: vi.fn().mockReturnThis(),
        labelText: vi.fn().mockReturnThis(),
        labelSize: vi.fn().mockReturnThis(),
        labelColor: vi.fn().mockReturnThis(),
        labelDotRadius: vi.fn().mockReturnThis(),
        labelAltitude: vi.fn().mockReturnThis(),
        ringsData: vi.fn().mockReturnThis(),
      };

      const compositor = new LayerCompositor(mockGlobe, store);

      const polandFeature: GeoFeature = {
        type: 'Feature',
        id: 'PL',
        properties: {
          id: 'PL',
          kind: 'country',
          layerId: 'countriesTopN',
          name_pl: 'Polska',
          name_en: 'Poland',
        },
        geometry: { type: 'Polygon', coordinates: [] },
      };

      const riverAmazonFeature: GeoFeature = {
        type: 'Feature',
        id: 'river-amazon',
        properties: {
          id: 'river-amazon',
          kind: 'river',
          layerId: 'rivers',
          name_pl: 'Amazonka',
          name_en: 'Amazon',
        },
        geometry: { type: 'LineString', coordinates: [] },
      };

      // 1. In standard mode (knowledgeMap: false), default styling is used
      const defaultCap = capColorFn(polandFeature);
      expect(defaultCap).not.toBe(SRS_STATUS_COLORS.mastered.fill);

      // 2. Enable knowledgeMap: true -> Poland should have mastered green
      store.set({ ...store.get(), knowledgeMap: true });
      const srsCap = capColorFn(polandFeature);
      expect(srsCap).toBe(SRS_STATUS_COLORS.mastered.fill);

      const srsStroke = strokeColorFn(polandFeature);
      expect(srsStroke).toBe(SRS_STATUS_COLORS.mastered.stroke);

      const srsRiver = pathColorFn({ feature: riverAmazonFeature, points: [] });
      expect(srsRiver).toBe(SRS_STATUS_COLORS.difficult.path);

      // 3. Selection highlight takes precedence over SRS color
      store.set({
        ...store.get(),
        selection: {
          id: 'PL',
          layerId: 'countriesTopN',
          kind: 'country',
        },
      });
      const selectedCap = capColorFn(polandFeature);
      expect(selectedCap).not.toBe(SRS_STATUS_COLORS.mastered.fill);
      expect(selectedCap).toContain('hsla(180');

      compositor.destroy();
    });
  });
});
