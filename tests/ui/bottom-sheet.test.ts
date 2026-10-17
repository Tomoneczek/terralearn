import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BottomSheetController } from '@/ui/bottom-sheet';
import { initLayout } from '@/ui/layout';

describe('BottomSheetController & Mobile Layout', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('initializes layout with drag handle, minimize button, and mobile FAB', () => {
    const slots = initLayout(root);

    const dragHandle = root.querySelector('.panel-drag-handle');
    const dragPill = root.querySelector('.panel-drag-pill');
    const minimizeBtn = root.querySelector('#btn-panel-minimize');
    const fabBtn = root.querySelector('#btn-mobile-panel-toggle');

    expect(dragHandle).toBeTruthy();
    expect(dragPill).toBeTruthy();
    expect(minimizeBtn).toBeTruthy();
    expect(fabBtn).toBeTruthy();

    expect(slots.bottomSheet).toBeDefined();
    expect(slots.bottomSheet.getSnap()).toBe('half');
  });

  it('updates panel data-snap and handle aria-expanded when switching snap points', () => {
    const slots = initLayout(root);
    const panel = root.querySelector('.panel')!;
    const handle = root.querySelector('.panel-drag-handle')!;

    expect(panel.getAttribute('data-snap')).toBe('half');
    expect(handle.getAttribute('aria-expanded')).toBe('true');

    slots.bottomSheet.setSnap('peek');
    expect(slots.bottomSheet.getSnap()).toBe('peek');
    expect(panel.getAttribute('data-snap')).toBe('peek');
    expect(handle.getAttribute('aria-expanded')).toBe('false');

    slots.bottomSheet.setSnap('full');
    expect(slots.bottomSheet.getSnap()).toBe('full');
    expect(panel.getAttribute('data-snap')).toBe('full');
    expect(handle.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles between peek and half on drag handle click or keyboard activation', () => {
    const slots = initLayout(root);
    const handle = root.querySelector<HTMLElement>('.panel-drag-handle')!;

    // Initial is half; clicking handle toggles to peek
    handle.click();
    expect(slots.bottomSheet.getSnap()).toBe('peek');

    // Clicking again toggles back to half
    handle.click();
    expect(slots.bottomSheet.getSnap()).toBe('half');

    // Keyboard activation with Enter
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(slots.bottomSheet.getSnap()).toBe('peek');

    // Keyboard activation with Space
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(slots.bottomSheet.getSnap()).toBe('half');
  });

  it('minimizes panel to peek when clicking minimize button', () => {
    const slots = initLayout(root);
    const minimizeBtn = root.querySelector<HTMLButtonElement>('#btn-panel-minimize')!;

    slots.bottomSheet.setSnap('full');
    expect(slots.bottomSheet.getSnap()).toBe('full');

    minimizeBtn.click();
    expect(slots.bottomSheet.getSnap()).toBe('peek');
  });

  it('toggles bottom sheet when clicking mobile FAB button', () => {
    const slots = initLayout(root);
    const fabBtn = root.querySelector<HTMLButtonElement>('#btn-mobile-panel-toggle')!;

    slots.bottomSheet.setSnap('peek');
    fabBtn.click();
    expect(slots.bottomSheet.getSnap()).toBe('half');

    fabBtn.click();
    expect(slots.bottomSheet.getSnap()).toBe('peek');
  });

  it('handles touch drag gestures to resize and snap', () => {
    const panel = document.createElement('div');
    const handle = document.createElement('div');
    panel.appendChild(handle);
    document.body.appendChild(panel);

    Object.defineProperty(window, 'innerHeight', { value: 1000, writable: true });
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      height: 450,
      width: 400,
      top: 550,
      bottom: 1000,
      left: 0,
      right: 400,
      x: 0,
      y: 550,
      toJSON: () => {},
    });

    const onSnapChange = vi.fn();
    const sheet = new BottomSheetController({
      panel,
      handle,
      initialSnap: 'half',
      onSnapChange,
    });

    // Simulate touchstart
    const touchStartEvent = new TouchEvent('touchstart', {
      touches: [{ clientY: 550 } as Touch],
    });
    handle.dispatchEvent(touchStartEvent);

    // Simulate touchmove dragging upward by 300px
    const touchMoveEvent = new TouchEvent('touchmove', {
      touches: [{ clientY: 250 } as Touch],
    });
    window.dispatchEvent(touchMoveEvent);

    expect(panel.style.height).toBe('750px');

    // Simulate touchend
    const touchEndEvent = new TouchEvent('touchend');
    window.dispatchEvent(touchEndEvent);

    // Height was 750px (>65% of 1000px) -> snapped to full
    expect(sheet.getSnap()).toBe('full');
    expect(onSnapChange).toHaveBeenCalledWith('full');

    sheet.destroy();
  });

  it('handles strong downward flick velocity to snap to peek', () => {
    const panel = document.createElement('div');
    const handle = document.createElement('div');
    panel.appendChild(handle);
    document.body.appendChild(panel);

    Object.defineProperty(window, 'innerHeight', { value: 1000, writable: true });
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      height: 500,
      width: 400,
      top: 500,
      bottom: 1000,
      left: 0,
      right: 400,
      x: 0,
      y: 500,
      toJSON: () => {},
    });

    const sheet = new BottomSheetController({
      panel,
      handle,
      initialSnap: 'half',
    });

    // Touchstart
    handle.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [{ clientY: 500 } as Touch],
      }),
    );

    // Fast downward move
    window.dispatchEvent(
      new TouchEvent('touchmove', {
        touches: [{ clientY: 750 } as Touch],
      }),
    );

    // Touchend
    window.dispatchEvent(new TouchEvent('touchend'));

    // Downward swipe -> snap to peek
    expect(sheet.getSnap()).toBe('peek');

    sheet.destroy();
  });
});
