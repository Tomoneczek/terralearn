import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import {
  SizeComparisonHud,
  formatArea,
  AFRICA_AREA_KM2,
  POLAND_AREA_KM2,
  SIZE_PRESETS,
} from '@/ui/size-comparison-hud';
import { clearGeoDataCache } from '@/globe/data-loader';

describe('SizeComparisonHud', () => {
  let container: HTMLElement;

  const samplePolygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-40, 70],
        [-30, 70],
        [-35, 75],
        [-40, 70],
      ],
    ],
  };

  beforeEach(() => {
    clearGeoDataCache();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('formatArea', () => {
    it('formats areas >= 1 mln km² with millions and exact km²', () => {
      const res = formatArea(2189751);
      expect(res).toContain('mln km²');
      expect(res).toContain('2 189 751 km²');
    });

    it('formats areas < 1 mln km² with exact km²', () => {
      const res = formatArea(312696);
      expect(res).toContain('312 696 km²');
      expect(res).not.toContain('mln');
    });
  });

  describe('Africa & Poland area ratios (Mercator myth buster)', () => {
    it('confirms Greenland on equator fits into Africa ~13.9 times', () => {
      const greenlandArea = 2189751;
      const ratio = Number((AFRICA_AREA_KM2 / greenlandArea).toFixed(1));
      expect(ratio).toBeCloseTo(13.9, 1);
    });

    it('confirms Greenland is ~7.0 times larger than Poland', () => {
      const greenlandArea = 2189751;
      const ratio = Number((greenlandArea / POLAND_AREA_KM2).toFixed(1));
      expect(ratio).toBeCloseTo(7.0, 1);
    });
  });

  describe('HUD UI rendering & interactions', () => {
    it('remains hidden when sizeComparison is inactive or null', () => {
      const store = createStore<AppState>(createInitialState());
      const hud = new SizeComparisonHud({ container, store });

      const el = container.querySelector('.tl-size-hud');
      expect(el).not.toBeNull();
      expect(el?.classList.contains('hidden')).toBe(true);

      hud.destroy();
    });

    it('displays HUD when sizeComparison is active and renders stats', () => {
      const store = createStore<AppState>(createInitialState());
      const hud = new SizeComparisonHud({ container, store });

      store.set({
        sizeComparison: {
          active: true,
          countryId: 'GL',
          countryName: 'Grenlandia',
          countryAreaKm2: 2189751,
          targetLat: 0,
          targetLng: 20,
          geometry: samplePolygon,
        },
      });

      const el = container.querySelector('.tl-size-hud');
      expect(el?.classList.contains('hidden')).toBe(false);

      // Verify country name and badge
      const countryName = el?.querySelector('.tl-size-country-name');
      expect(countryName?.textContent).toBe('Grenlandia');

      const badge = el?.querySelector('.tl-size-badge');
      expect(badge?.textContent).toBe('GL');

      // Verify area and comparison ratios
      const areaVal = el?.querySelector('.tl-size-stat-val');
      expect(areaVal?.textContent).toContain('mln km²');

      const ratioItems = el?.querySelectorAll('.tl-size-ratio-item');
      expect(ratioItems?.length).toBe(2); // vs Africa and vs Poland

      hud.destroy();
    });

    it('clears sizeComparison when close button is clicked', () => {
      const store = createStore<AppState>(createInitialState());
      const hud = new SizeComparisonHud({ container, store });

      store.set({
        sizeComparison: {
          active: true,
          countryId: 'GL',
          countryName: 'Grenlandia',
          countryAreaKm2: 2189751,
          targetLat: 0,
          targetLng: 20,
          geometry: samplePolygon,
        },
      });

      const closeBtn = container.querySelector('.tl-size-close-btn') as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();
      closeBtn.click();

      expect(store.get().sizeComparison).toBeNull();
      hud.destroy();
    });

    it('triggers setCountry and camera flyTo when preset is clicked', () => {
      const store = createStore<AppState>(createInitialState());
      const onFlyTo = vi.fn();
      const hud = new SizeComparisonHud({ container, store, onFlyTo });

      store.set({
        sizeComparison: {
          active: true,
          countryId: 'GL',
          countryName: 'Grenlandia',
          countryAreaKm2: 2189751,
          targetLat: 0,
          targetLng: 20,
          geometry: samplePolygon,
        },
      });

      const presetBtns = container.querySelectorAll('.tl-size-preset-btn');
      expect(presetBtns.length).toBe(SIZE_PRESETS.length);

      // Click first preset (Greenland over Africa)
      (presetBtns[0] as HTMLButtonElement).click();

      expect(onFlyTo).toHaveBeenCalledWith(5, 20, 2.2);
      hud.destroy();
    });

    it('updates ghost position on raw globe click', () => {
      const store = createStore<AppState>(createInitialState());
      const hud = new SizeComparisonHud({ container, store });

      store.set({
        sizeComparison: {
          active: true,
          countryId: 'GL',
          countryName: 'Grenlandia',
          countryAreaKm2: 2189751,
          targetLat: 70,
          targetLng: -40,
          geometry: samplePolygon,
        },
      });

      // Simulate click on globe at equator
      store.set({
        globeClick: { lat: 0, lng: 20 },
      });

      const current = store.get().sizeComparison;
      expect(current?.targetLat).toBe(0);
      expect(current?.targetLng).toBe(20);

      hud.destroy();
    });

    it('switches compared country when store selection changes', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  id: 'FR',
                  properties: {
                    id: 'FR',
                    kind: 'country',
                    name_pl: 'Francja',
                    rank: { area: 551695 },
                    labelLat: 46,
                    labelLng: 2,
                  },
                  geometry: samplePolygon,
                },
              ],
            }),
          }),
        ),
      );

      const store = createStore<AppState>(createInitialState());
      const hud = new SizeComparisonHud({ container, store });

      // Wait for preloadCountries to finish loading mock countries
      await new Promise(r => setTimeout(r, 50));

      // Start comparison with Greenland
      store.set({
        sizeComparison: {
          active: true,
          countryId: 'GL',
          countryName: 'Grenlandia',
          countryAreaKm2: 2189751,
          targetLat: 70,
          targetLng: -40,
          geometry: samplePolygon,
        },
      });

      // User selects France
      store.set({
        selection: { id: 'FR', layerId: 'countriesTopN', kind: 'country', name_pl: 'Francja' },
      });

      await new Promise(r => setTimeout(r, 50));

      const updated = store.get().sizeComparison;
      expect(updated?.countryId).toBe('FR');
      expect(updated?.countryName).toBe('Francja');

      // Test invalid country code in setCountry
      await hud.setCountry('NON_EXISTENT');
      expect(store.get().sizeComparison?.countryId).toBe('FR');

      hud.destroy();
    });

    it('handles empty/zero country area and preload errors gracefully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('Preload network failure'))),
      );

      const store = createStore<AppState>(createInitialState());
      const hud = new SizeComparisonHud({ container, store });

      store.set({
        sizeComparison: {
          active: true,
          countryId: 'XX',
          countryName: 'Nieznany',
          countryAreaKm2: 0,
          targetLat: 0,
          targetLng: 0,
          geometry: samplePolygon,
        },
      });

      const el = container.querySelector('.tl-size-hud');
      expect(el?.classList.contains('hidden')).toBe(false);

      hud.destroy();
    });

    it('destroys and removes element from DOM', () => {
      const store = createStore<AppState>(createInitialState());
      const hud = new SizeComparisonHud({ container, store });

      expect(container.querySelector('.tl-size-hud')).not.toBeNull();
      hud.destroy();
      expect(container.querySelector('.tl-size-hud')).toBeNull();
    });
  });
});
