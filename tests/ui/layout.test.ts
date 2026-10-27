import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setLocale } from '@/i18n';
import { initLayout, PANEL_COLLAPSED_KEY } from '@/ui/layout';

describe('initLayout', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);
  });

  it('mounts all DOM containers and returns slots', () => {
    const slots = initLayout(root);

    expect(slots.globeContainer).toBeDefined();
    expect(slots.sidebarContainer).toBeDefined();
    expect(slots.searchContainer).toBeDefined();
    expect(slots.toolbarContainer).toBeDefined();
    expect(slots.legendContainer).toBeDefined();
    expect(slots.cardContainer).toBeDefined();
    expect(slots.bottomSheet).toBeDefined();

    expect(root.querySelector('nav.rail')).not.toBeNull();
    expect(root.querySelector('aside.panel')).not.toBeNull();
    expect(root.querySelector('main.stage')).not.toBeNull();
    expect(root.querySelector('#btn-mobile-panel-toggle')).not.toBeNull();
  });

  it('toggles panel collapsed class via togglePanel slot', () => {
    const slots = initLayout(root);
    expect(root.classList.contains('panel-collapsed')).toBe(false);

    slots.togglePanel();
    expect(root.classList.contains('panel-collapsed')).toBe(true);

    slots.togglePanel();
    expect(root.classList.contains('panel-collapsed')).toBe(false);
  });

  // User request: after choosing filters there was no visible way to hide the sidebar on desktop
  // (only the undocumented "[" shortcut).
  describe('hiding the panel on desktop', () => {
    it('hides and shows the panel from the header and the rail, with matching ARIA state', () => {
      setLocale('en');
      initLayout(root);
      const headerBtn = root.querySelector<HTMLButtonElement>('#btn-panel-collapse')!;
      const railBtn = root.querySelector<HTMLButtonElement>('#btn-rail-panel-toggle')!;
      expect(headerBtn.getAttribute('aria-expanded')).toBe('true');
      expect(headerBtn.getAttribute('aria-label')).toBe('Hide panel ([)');

      headerBtn.click();
      expect(root.classList.contains('panel-collapsed')).toBe(true);
      expect(railBtn.getAttribute('aria-expanded')).toBe('false');
      expect(railBtn.getAttribute('aria-label')).toBe('Show panel ([)');

      railBtn.click();
      expect(root.classList.contains('panel-collapsed')).toBe(false);
    });

    it('remembers the choice between visits', () => {
      initLayout(root).togglePanel();
      expect(localStorage.getItem(PANEL_COLLAPSED_KEY)).toBe('1');

      const next = document.createElement('div');
      document.body.appendChild(next);
      initLayout(next);
      expect(next.classList.contains('panel-collapsed')).toBe(true);
    });

    it('brings the panel back when a rail section is picked', () => {
      const slots = initLayout(root);
      slots.togglePanel();
      root.querySelector<HTMLButtonElement>('.rail-btn[data-rail-id="settings"]')!.click();
      expect(root.classList.contains('panel-collapsed')).toBe(false);
    });

    it('works without storage', () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const slots = initLayout(root);
      expect(root.classList.contains('panel-collapsed')).toBe(false);
      slots.togglePanel();
      expect(root.classList.contains('panel-collapsed')).toBe(true);
      getItem.mockRestore();
      setItem.mockRestore();
    });

    it('shows the toggles on desktop only (mobile uses the bottom sheet)', () => {
      const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/layout.css'), 'utf-8');
      const mobile = css.slice(css.indexOf('@media (max-width: 900px)'));
      expect(mobile).toMatch(
        /\.panel-collapse-btn,\s*#btn-rail-panel-toggle\s*\{\s*display: none;/,
      );
    });
  });

  it('handles keyboard shortcut "[" and respects input/textarea targets', () => {
    initLayout(root);

    // 1. Regular keydown "[" on body -> toggles panel
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }));
    expect(root.classList.contains('panel-collapsed')).toBe(true);

    // 2. Different key (e.g. 'Escape') -> does not toggle
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.classList.contains('panel-collapsed')).toBe(true);

    // 3. Keydown "[" with target HTMLInputElement -> ignored
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }));
    expect(root.classList.contains('panel-collapsed')).toBe(true);

    // 4. Keydown "[" with target HTMLTextAreaElement -> ignored
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }));
    expect(root.classList.contains('panel-collapsed')).toBe(true);

    // 5. Keydown "[" on normal button -> toggles back
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }));
    expect(root.classList.contains('panel-collapsed')).toBe(false);
  });

  it('handles rail navigation selection properly', () => {
    initLayout(root);
    const railBtns = root.querySelectorAll<HTMLButtonElement>('.rail-btn:not(.rail-logo)');
    expect(railBtns.length).toBeGreaterThan(1);

    const secondBtn = railBtns[1];
    secondBtn?.click();
    expect(secondBtn?.classList.contains('active')).toBe(true);
  });

  // Regression: the legend was stacked above the info card in the bottom-right overlay, so a
  // tall card pushed it up into the top-right toolbar.
  describe('overlay collisions', () => {
    const readCss = (rel: string): string =>
      fs.readFileSync(path.resolve(process.cwd(), 'src/styles', rel), 'utf-8');

    it('keeps the legend out of the overlay that holds the info card', () => {
      const slots = initLayout(root);
      const legendOverlay = slots.legendContainer.closest('.overlay');
      const cardOverlay = slots.cardContainer.closest('.overlay');

      expect(legendOverlay).not.toBeNull();
      expect(legendOverlay).not.toBe(cardOverlay);
      expect(legendOverlay?.classList.contains('overlay-bottom-left')).toBe(true);
      expect(legendOverlay?.classList.contains('overlay-bottom-right')).toBe(false);
    });

    it('positions the legend overlay bottom-left and caps the info card height', () => {
      const layoutCss = readCss('layout.css');
      expect(layoutCss).toMatch(/\.overlay-bottom-left\s*\{[^}]*left:/);
      expect(readCss('components/info-card.css')).toMatch(/max-height:\s*calc\(100vh/);
    });

    it('gives sidebar selects a fixed width so row labels are not truncated', () => {
      const css = readCss('components/sidebar.css');
      const rule = /\.tl-quality-select\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
      expect(rule).toMatch(/width:\s*10\.5rem/);
      expect(rule).toMatch(/flex:\s*0 0 auto/);
    });
  });

  describe('navigation rail', () => {
    it('offers a settings entry and announces rail selections', () => {
      initLayout(root);
      const received = vi.fn();
      window.addEventListener('tl-rail-select', received);

      const settingsBtn = root.querySelector<HTMLButtonElement>('[data-rail-id="settings"]');
      expect(settingsBtn).not.toBeNull();
      settingsBtn!.click();

      expect((received.mock.calls[0]![0] as CustomEvent).detail.id).toBe('settings');
      window.removeEventListener('tl-rail-select', received);
    });

    it('syncs the active rail button with the panel view', () => {
      initLayout(root);
      const active = (): string | undefined =>
        root.querySelector<HTMLElement>('.rail-btn.active')?.dataset.railId;

      window.dispatchEvent(new CustomEvent('tl-view-changed', { detail: { view: 'settings' } }));
      expect(active()).toBe('settings');
      window.dispatchEvent(new CustomEvent('tl-view-changed', { detail: { view: 'map' } }));
      expect(active()).toBe('explore');
    });

    // Regression: the rail labels were hard-coded Polish strings
    it('translates the rail labels and follows the language', () => {
      setLocale('en');
      const slots = initLayout(root);
      const label = (id: string): string | null =>
        root.querySelector(`[data-rail-id="${id}"]`)?.getAttribute('aria-label') ?? null;

      expect(label('explore')).toBe('Explore');
      expect(label('settings')).toBe('Settings');

      setLocale('pl');
      slots.refreshRail();
      expect(label('explore')).toBe('Eksploracja');
      expect(label('settings')).toBe('Ustawienia');
      setLocale('en');
    });
  });
});
