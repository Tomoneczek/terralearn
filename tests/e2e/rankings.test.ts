import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetRankingsCache } from '@/rankings/load';

vi.mock('globe.gl', () => import('./globe-gl-mock'));

const DATA_DIR = path.resolve(process.cwd(), 'public/data');
const readData = (file: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));

async function loadPage(): Promise<typeof import('@/state')> {
  vi.resetModules();
  resetRankingsCache();
  document.body.innerHTML = '<div id="app"></div>';
  const state = await import('@/state');
  await import('@/main');
  return state;
}

describe('Rankings table (E2E smoke)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const real = ['rankings.json', 'facts.json'].find(f => url.endsWith(`/data/${f}`));
      return {
        ok: true,
        json: async () => (real ? readData(real) : { type: 'FeatureCollection', features: [] }),
      } as unknown as Response;
    }) as unknown as typeof global.fetch;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    global.fetch = originalFetch;
  });

  it('opens from the rail, switches category and locates the Nile', async () => {
    const { store } = await loadPage();
    const panel = document.querySelector<HTMLElement>('.tl-rankings')!;
    expect(panel.classList.contains('hidden')).toBe(true);

    document.getElementById('btn-rail-rankings')!.click();
    expect(store.get().rankingsPanelOpen).toBe(true);
    await vi.waitFor(() => expect(panel.querySelector('.tl-rankings-table')).not.toBeNull());

    panel.querySelector<HTMLButtonElement>('[data-category="rivers"]')!.click();
    expect(panel.querySelector('tr[data-id="river-nile"]')).not.toBeNull();
    expect(panel.querySelector('.tl-rankings-rank')?.textContent).toBe('1');
    expect(store.get().layers.rivers.enabled).toBe(false);

    panel.querySelector<HTMLButtonElement>('tr[data-id="river-nile"] .tl-rankings-locate')!.click();

    expect(store.get().layers.rivers.enabled).toBe(true);
    expect(store.get().selection).toMatchObject({ id: 'river-nile', kind: 'river' });
    const card = document.querySelector('.tl-info-card:not(.tl-rankings):not(.tl-moon-card)')!;
    await vi.waitFor(() => expect(card.classList.contains('hidden')).toBe(false));
    expect(card.textContent).toContain('Nile');
    // The table stays open and marks the located row
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(panel.querySelector('tr.is-selected')?.getAttribute('data-id')).toBe('river-nile');
  });

  it('opens on the matching category from the "Show table" link of a layer', async () => {
    const { store } = await loadPage();
    const link = document.querySelector<HTMLButtonElement>(
      '[data-layer-id="lakes"] .tl-layer-table-link',
    )!;
    link.click();
    expect(store.get()).toMatchObject({ rankingsPanelOpen: true, rankingsCategory: 'lakes' });
    const panel = document.querySelector<HTMLElement>('.tl-rankings')!;
    await vi.waitFor(() =>
      expect(panel.querySelector('tr[data-id="lake-caspian-sea"]')).not.toBeNull(),
    );
  });

  it('remembers the last category after a reload', async () => {
    const first = await loadPage();
    first.store.set({ rankingsCategory: 'peaks' });
    window.dispatchEvent(new Event('pagehide'));
    document.body.innerHTML = '';

    const second = await loadPage();
    expect(second.store.get().rankingsCategory).toBe('peaks');
    expect(second.store.get().rankingsPanelOpen).toBe(false);
  });
});
