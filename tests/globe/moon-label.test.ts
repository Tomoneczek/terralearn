import { describe, it, expect, afterEach } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  DEFAULT_MOON_LABEL_PARAMS,
  MoonLabel,
  isBehindEarth,
  moonLabelOpacity,
  projectMoon,
} from '@/globe/moon-label';
import { MoonController } from '@/globe/moon';
import { HoverArbiter } from '@/globe/hover-arbiter';
import { MOON_RADIUS_SCENE } from '@/globe/day-night';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { setLocale } from '@/i18n';

const W = 1200;
const H = 800;
const params = DEFAULT_MOON_LABEL_PARAMS;

function camera(position: Vector3, target: Vector3): PerspectiveCamera {
  const cam = new PerspectiveCamera(50, W / H, 0.05, 125_000);
  cam.position.copy(position);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  return cam;
}

interface Setup {
  store: ReturnType<typeof createStore<AppState>>;
  container: HTMLElement;
  arbiter: HoverArbiter;
  moon: MoonController;
  label: MoonLabel;
  frames: FrameRequestCallback[];
  cam: { current: PerspectiveCamera };
}

const MOON_AT = new Vector3(0, 0, 6000);

function setup(options: { hoverCapable?: boolean; state?: Partial<AppState> } = {}): Setup {
  const store = createStore<AppState>({
    ...createInitialState(),
    dayNight: true,
    theme: 'dark',
    ...options.state,
  });
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H }) as DOMRect;
  document.body.appendChild(container);
  const arbiter = new HoverArbiter(store, container);
  const moon = new MoonController(null, store, {
    moonPosition: MOON_AT.clone(),
    sunDirection: new Vector3(1, 0, 0),
  });
  const cam = { current: camera(new Vector3(0, 0, 400), MOON_AT) };
  const frames: FrameRequestCallback[] = [];
  const label = new MoonLabel({
    container,
    store,
    moon,
    arbiter,
    getCamera: () => cam.current,
    hoverCapable: options.hoverCapable ?? true,
    requestFrame: cb => frames.push(cb),
    cancelFrame: () => undefined,
  });
  return { store, container, arbiter, moon, label, frames, cam };
}

function pointer(type: string, target: HTMLElement, x: number, y: number): void {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  target.dispatchEvent(event);
}

afterEach(() => {
  document.body.replaceChildren();
  setLocale('en');
});

describe('moonLabelOpacity', () => {
  it('is fully opaque near the cursor and rests at the minimum far away', () => {
    expect(moonLabelOpacity(0, params)).toBe(1);
    expect(moonLabelOpacity(params.nearPx, params)).toBe(1);
    expect(moonLabelOpacity(params.farPx, params)).toBe(params.minOpacity);
    expect(moonLabelOpacity(5000, params)).toBe(params.minOpacity);
    expect(moonLabelOpacity(null, params)).toBe(params.minOpacity);
  });

  it('fades smoothly and monotonically in between', () => {
    let prev = 1;
    for (let d = params.nearPx; d <= params.farPx; d += 5) {
      const o = moonLabelOpacity(d, params);
      expect(o).toBeLessThanOrEqual(prev);
      expect(prev - o).toBeLessThan(0.05);
      prev = o;
    }
  });

  it('stays opaque on devices without a hovering pointer', () => {
    expect(moonLabelOpacity(null, params, false)).toBe(1);
    expect(moonLabelOpacity(1000, params, false)).toBe(1);
  });
});

describe('Moon screen geometry', () => {
  it('detects when the globe hides the Moon from the camera', () => {
    expect(isBehindEarth(new Vector3(0, 0, -400), MOON_AT)).toBe(true);
    expect(isBehindEarth(new Vector3(0, 0, 400), MOON_AT)).toBe(false);
    expect(isBehindEarth(new Vector3(0, 300, -400), MOON_AT)).toBe(false);
  });

  it('projects the center and on-screen radius like three.js does', () => {
    const cam = camera(new Vector3(500, 200, 400), MOON_AT);
    const center = MOON_AT.clone().add(new Vector3(300, -100, 0));
    const state = projectMoon(center, MOON_RADIUS_SCENE, cam, W, H);
    const ndc = center.clone().project(cam);
    expect(state.x).toBeCloseTo(((ndc.x + 1) / 2) * W, 6);
    expect(state.y).toBeCloseTo(((1 - ndc.y) / 2) * H, 6);
    // ~0.27° radius at ~5600 units with a 50° FOV over 800 px: ~4 px
    expect(state.radiusPx).toBeGreaterThan(3);
    expect(state.radiusPx).toBeLessThan(6);
    expect(state.targetable).toBe(true);
  });

  it('is not targetable behind the camera', () => {
    const cam = camera(new Vector3(0, 0, 400), new Vector3(0, 0, -1000));
    expect(projectMoon(MOON_AT, MOON_RADIUS_SCENE, cam, W, H).targetable).toBe(false);
  });
});

describe('MoonLabel', () => {
  it('shows the label at the Moon at real scale, resting at the minimum opacity', () => {
    const { label } = setup();
    label.update();
    expect(label.isShown()).toBe(true);
    expect(label.element.classList.contains('is-shown')).toBe(true);
    expect(label.element.style.transform).toBe('translate(600.0px, 400.0px)');
    expect(Number(label.element.style.opacity)).toBe(params.minOpacity);
    expect(label.element.textContent).toBe('Moon');
    label.destroy();
  });

  it('fades in, tightens and claims the pointer when the cursor approaches', () => {
    const { label, container, arbiter } = setup();
    pointer('pointermove', container, 610, 405);
    label.update();
    expect(Number(label.element.style.opacity)).toBe(1);
    expect(label.element.classList.contains('is-near')).toBe(true);
    expect(label.isHovered()).toBe(true);
    expect(arbiter.isMoonClaimed()).toBe(true);
    expect(container.style.cursor).toBe('pointer');

    pointer('pointermove', container, 760, 400);
    label.update();
    expect(label.isHovered()).toBe(false);
    const mid = Number(label.element.style.opacity);
    expect(mid).toBeGreaterThan(params.minOpacity);
    expect(mid).toBeLessThan(1);
    label.destroy();
  });

  it('opens the Moon panel on click (and closes the object card), but not after a drag', () => {
    const { label, container, store } = setup({
      state: { selection: { id: 'pl', layerId: 'countriesTopN', kind: 'country' } },
    });
    pointer('pointermove', container, 602, 401);
    label.update();

    pointer('pointerdown', container, 100, 100);
    pointer('click', container, 602, 401);
    expect(store.get().moonPanelOpen).toBe(false);

    pointer('pointerdown', container, 602, 401);
    pointer('click', container, 602, 401);
    expect(store.get().moonPanelOpen).toBe(true);
    expect(store.get().selection).toBeNull();
    label.destroy();
  });

  it('opens the panel from the label itself and from the keyboard', () => {
    const { label, store } = setup();
    label.update();
    label.element.querySelector<HTMLElement>('.tl-moon-label-text')?.click();
    expect(store.get().moonPanelOpen).toBe(true);

    store.set({ moonPanelOpen: false });
    label.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(store.get().moonPanelOpen).toBe(true);
    label.destroy();
  });

  it('hides the label for an enlarged Moon but keeps it clickable', () => {
    const { label, container, store } = setup({ state: { moonScale: 5 } });
    pointer('pointermove', container, 600, 412);
    label.update();
    expect(label.isShown()).toBe(false);
    expect(label.isHovered()).toBe(true);
    pointer('pointerdown', container, 600, 412);
    pointer('click', container, 600, 412);
    expect(store.get().moonPanelOpen).toBe(true);
    label.destroy();
  });

  it('hides the label when the Moon gets large on screen (camera close by)', () => {
    const { label, cam } = setup();
    cam.current = camera(new Vector3(0, 0, 5800), MOON_AT);
    label.update();
    expect(label.getScreenState()?.radiusPx).toBeGreaterThan(params.maxRadiusPx);
    expect(label.isShown()).toBe(false);
    label.destroy();
  });

  it('neither shows nor claims the Moon behind the globe', () => {
    const { label, container, cam } = setup();
    cam.current = camera(new Vector3(0, 0, -400), MOON_AT);
    pointer('pointermove', container, 600, 400);
    label.update();
    expect(label.getScreenState()?.targetable).toBe(false);
    expect(label.isShown()).toBe(false);
    expect(label.isHovered()).toBe(false);
    label.destroy();
  });

  it('turns off with the day/night mode', () => {
    const { label, store } = setup();
    store.set({ dayNight: false });
    label.update();
    expect(label.getScreenState()).toBeNull();
    expect(label.isShown()).toBe(false);
    label.destroy();
  });

  it('stays opaque on touch screens', () => {
    const { label } = setup({ hoverCapable: false });
    label.update();
    expect(Number(label.element.style.opacity)).toBe(1);
    label.destroy();
  });

  it('follows the UI language', () => {
    const { label, store } = setup();
    store.set({ locale: 'pl' });
    expect(label.element.textContent).toBe('Księżyc');
    expect(label.element.getAttribute('aria-label')).toBe('Księżyc – pokaż szczegóły');
    label.destroy();
  });

  it('updates every animation frame until destroyed', () => {
    const { label, frames, container, arbiter } = setup();
    expect(frames).toHaveLength(1);
    frames[0]!(0);
    expect(label.isShown()).toBe(true);
    expect(frames).toHaveLength(2);

    pointer('pointermove', container, 600, 400);
    label.update();
    label.destroy();
    expect(container.contains(label.element)).toBe(false);
    expect(arbiter.isMoonClaimed()).toBe(false);
  });
});
