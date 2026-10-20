import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { initLayout } from '@/ui/layout';

describe('initLayout', () => {
  let root: HTMLElement;

  beforeEach(() => {
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
});
