import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Scene } from 'three';
import { AtmosphereController } from '@/globe/atmosphere';
import { createStore, createInitialState } from '@/state/store';
import type { GlobeContext } from '@/globe';
import { initDevPanel } from '@/dev';
import { loadDevPanel } from '@/dev/load-dev-panel';
import { clearDevParams, listDevParams, setDevParam } from '@/dev/dev-params';

function fakeContext(): { context: GlobeContext; atmosphere: AtmosphereController } {
  const atmosphere = new AtmosphereController(new Scene(), createStore(createInitialState()));
  const context = {
    atmosphere,
    fpsMonitor: { getFps: () => 60 },
    quality: { getActiveTier: () => 'high' },
    camera: { getPointOfView: () => ({ lat: 0, lng: 0, altitude: 2 }) },
    globe: {
      renderer: () => {
        throw new Error('no renderer');
      },
    },
  } as unknown as GlobeContext;
  return { context, atmosphere };
}

describe('initDevPanel', () => {
  beforeEach(() => {
    clearDevParams();
    document.body.innerHTML = '';
  });

  it('registers atmosphere twilight params that drive the shader uniforms', () => {
    const { context, atmosphere } = fakeContext();
    const panel = initDevPanel(document.body, context);

    expect(listDevParams().map(p => p.id)).toEqual([
      'atmosphere.twilightStrength',
      'atmosphere.facingMin',
      'atmosphere.facingMax',
    ]);
    setDevParam('atmosphere.twilightStrength', 0.9);
    expect(atmosphere.getMaterial().uniforms.uTwilightStrength?.value).toBe(0.9);
    expect(document.querySelector('.tl-dev-stats')?.textContent).toContain('draw calls n/a');

    panel.destroy();
    expect(listDevParams()).toHaveLength(0);
    atmosphere.destroy();
  });
});

describe('loadDevPanel', () => {
  beforeEach(() => {
    clearDevParams();
    document.body.innerHTML = '';
  });

  it('does not import the dev module or touch the DOM without ?dev=true', async () => {
    const importer = vi.fn();
    const { context } = fakeContext();
    for (const search of ['', '?dev=false', '?dev=1']) {
      await loadDevPanel(search, document.body, context, importer);
    }
    expect(importer).not.toHaveBeenCalled();
    expect(document.querySelector('.tl-dev-panel')).toBeNull();
  });

  it('imports the dev module and mounts the panel with ?dev=true', async () => {
    const { context } = fakeContext();
    await loadDevPanel('?dev=true', document.body, context);
    expect(document.querySelector('.tl-dev-panel')).not.toBeNull();
  });

  it('swallows import failures instead of breaking the app', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { context } = fakeContext();
    await expect(
      loadDevPanel('?dev=true', document.body, context, () => Promise.reject(new Error('boom'))),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
