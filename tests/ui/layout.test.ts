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
});
