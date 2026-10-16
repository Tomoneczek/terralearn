import { describe, it, expect, beforeEach } from 'vitest';
import { initLayout } from './layout';

describe('Layout', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('initializes semantic structure with all required slots', () => {
    const slots = initLayout(root);

    expect(slots.globeContainer).toBeDefined();
    expect(slots.sidebarContainer).toBeDefined();
    expect(slots.searchContainer).toBeDefined();
    expect(slots.toolbarContainer).toBeDefined();
    expect(slots.legendContainer).toBeDefined();
    expect(slots.cardContainer).toBeDefined();

    expect(root.querySelector('.rail')).not.toBeNull();
    expect(root.querySelector('.panel')).not.toBeNull();
    expect(root.querySelector('.stage')).not.toBeNull();
  });

  it('toggles panel collapse state correctly', () => {
    const slots = initLayout(root);
    expect(root.classList.contains('panel-collapsed')).toBe(false);

    slots.togglePanel();
    expect(root.classList.contains('panel-collapsed')).toBe(true);

    slots.togglePanel();
    expect(root.classList.contains('panel-collapsed')).toBe(false);

    // Keyboard shortcut '[' toggles panel
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '[' }));
    expect(root.classList.contains('panel-collapsed')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '[' }));
    expect(root.classList.contains('panel-collapsed')).toBe(false);
  });

  it('handles rail navigation selection properly', () => {
    initLayout(root);
    const railBtns = root.querySelectorAll('.rail-btn:not(.rail-logo)');
    expect(railBtns.length).toBeGreaterThan(1);

    const secondBtn = railBtns[1] as HTMLButtonElement;
    secondBtn.click();
    expect(secondBtn.classList.contains('active')).toBe(true);
  });
});
