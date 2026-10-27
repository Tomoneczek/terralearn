import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clampOffset,
  makeDraggable,
  DRAGGABLE_CLASS,
  DRAGGING_CLASS,
  type DraggableController,
} from '@/ui/draggable';

const KEY = 'terralearn_panel_pos_test';

function pointer(type: string, x: number, y: number, target: Element): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
}

function translateOf(el: HTMLElement): string {
  return el.style.translate;
}

describe('clampOffset', () => {
  const viewport = { width: 1000, height: 800 };
  const base = { left: 300, top: 16, width: 400, height: 300 };

  it('keeps the panel inside the viewport with a margin', () => {
    expect(clampOffset({ x: -1000, y: -100 }, base, viewport)).toEqual({ x: -292, y: -8 });
    expect(clampOffset({ x: 1000, y: 1000 }, base, viewport)).toEqual({ x: 292, y: 476 });
    expect(clampOffset({ x: 50, y: 50 }, base, viewport)).toEqual({ x: 50, y: 50 });
  });

  it('aligns a panel larger than the viewport to the top-left edge', () => {
    const tall = { left: 0, top: 0, width: 400, height: 2000 };
    expect(clampOffset({ x: 0, y: -500 }, tall, viewport).y).toBe(8);
  });
});

describe('makeDraggable', () => {
  let panel: HTMLElement;
  let header: HTMLElement;
  let closeBtn: HTMLButtonElement;
  let controller: DraggableController | null;
  let narrow = false;

  const render = () => {
    // Panels rebuild their content on every render; dragging must survive that.
    panel.innerHTML = '<header class="hdr"><span class="t">Title</span><button>x</button></header>';
    header = panel.querySelector('.hdr')!;
    closeBtn = panel.querySelector('button')!;
  };

  beforeEach(() => {
    localStorage.clear();
    narrow = false;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: narrow,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    panel = document.createElement('div');
    document.body.appendChild(panel);
    // Layout is not computed in happy-dom: report a fixed rect shifted by the current offset.
    panel.getBoundingClientRect = () => {
      const [x = 0, y = 0] = (panel.style.translate || '0px 0px').split(' ').map(parseFloat);
      return { left: 300 + x, top: 16 + y, width: 400, height: 300 } as DOMRect;
    };
    render();
    controller = null;
  });

  afterEach(() => {
    controller?.destroy();
    panel.remove();
    vi.unstubAllGlobals();
  });

  it('moves the panel by dragging the header and remembers the position', () => {
    controller = makeDraggable(panel, { handle: '.hdr', storageKey: KEY });
    expect(panel.classList.contains(DRAGGABLE_CLASS)).toBe(true);

    pointer('pointerdown', 500, 30, panel.querySelector('.t')!);
    expect(panel.classList.contains(DRAGGING_CLASS)).toBe(true);
    pointer('pointermove', 400, 130, panel);
    pointer('pointerup', 400, 130, panel);

    expect(translateOf(panel)).toBe('-100px 100px');
    expect(panel.classList.contains(DRAGGING_CLASS)).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ x: -100, y: 100 });
  });

  it('restores the remembered position and keeps dragging after a re-render', () => {
    localStorage.setItem(KEY, JSON.stringify({ x: 40, y: 60 }));
    controller = makeDraggable(panel, { handle: '.hdr', storageKey: KEY });
    expect(translateOf(panel)).toBe('40px 60px');

    render();
    pointer('pointerdown', 500, 30, header);
    pointer('pointermove', 510, 40, panel);
    pointer('pointerup', 510, 40, panel);
    expect(translateOf(panel)).toBe('50px 70px');
  });

  it('never lets the panel leave the viewport', () => {
    controller = makeDraggable(panel, { handle: '.hdr', storageKey: KEY });
    pointer('pointerdown', 500, 30, header);
    pointer('pointermove', -2000, -2000, panel);
    pointer('pointerup', -2000, -2000, panel);
    expect(translateOf(panel)).toBe('-292px -8px');
  });

  it('ignores presses on buttons inside the header and outside the header', () => {
    controller = makeDraggable(panel, { handle: '.hdr', storageKey: KEY });
    pointer('pointerdown', 500, 30, closeBtn);
    pointer('pointermove', 600, 130, panel);
    expect(translateOf(panel)).toBe('');

    const body = document.createElement('p');
    panel.appendChild(body);
    pointer('pointerdown', 500, 200, body);
    pointer('pointermove', 600, 300, panel);
    expect(translateOf(panel)).toBe('');
  });

  it('resets the position on a header double click', () => {
    localStorage.setItem(KEY, JSON.stringify({ x: 40, y: 60 }));
    controller = makeDraggable(panel, { handle: '.hdr', storageKey: KEY });
    header.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(translateOf(panel)).toBe('');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('is disabled on narrow (mobile) screens', () => {
    narrow = true;
    localStorage.setItem(KEY, JSON.stringify({ x: 40, y: 60 }));
    controller = makeDraggable(panel, { handle: '.hdr', storageKey: KEY });
    expect(panel.classList.contains(DRAGGABLE_CLASS)).toBe(false);
    expect(translateOf(panel)).toBe('');

    pointer('pointerdown', 500, 30, header);
    pointer('pointermove', 600, 130, panel);
    expect(translateOf(panel)).toBe('');
  });

  it('ignores a corrupt stored position', () => {
    localStorage.setItem(KEY, '{not json');
    controller = makeDraggable(panel, { handle: '.hdr', storageKey: KEY });
    expect(translateOf(panel)).toBe('');
  });
});
