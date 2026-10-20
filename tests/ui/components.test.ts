import { describe, it, expect, vi } from 'vitest';
import { ToggleSwitch } from '@/ui/components/toggle';
import { TopNSlider } from '@/ui/components/slider';

describe('ToggleSwitch', () => {
  it('initializes with correct aria-checked attribute and state', () => {
    const toggle = new ToggleSwitch({ checked: false });
    expect(toggle.isChecked()).toBe(false);
    expect(toggle.element.getAttribute('aria-checked')).toBe('false');

    const toggleChecked = new ToggleSwitch({ checked: true, ariaLabel: 'Test Toggle' });
    expect(toggleChecked.isChecked()).toBe(true);
    expect(toggleChecked.element.getAttribute('aria-checked')).toBe('true');
    expect(toggleChecked.element.getAttribute('aria-label')).toBe('Test Toggle');
  });

  it('toggles state on click and emits onChange callback', () => {
    const onChange = vi.fn();
    const toggle = new ToggleSwitch({ checked: false, onChange });

    toggle.element.click();
    expect(toggle.isChecked()).toBe(true);
    expect(toggle.element.getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith(true);

    toggle.element.click();
    expect(toggle.isChecked()).toBe(false);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('toggles on Space and Enter keyboard keys', () => {
    const onChange = vi.fn();
    const toggle = new ToggleSwitch({ checked: false, onChange });

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    toggle.element.dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(toggle.isChecked()).toBe(true);

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    toggle.element.dispatchEvent(enterEvent);
    expect(toggle.isChecked()).toBe(false);
  });

  it('programmatically updates state via setChecked without firing onChange when emit=false', () => {
    const onChange = vi.fn();
    const toggle = new ToggleSwitch({ checked: false, onChange });

    toggle.setChecked(true, false);
    expect(toggle.isChecked()).toBe(true);
    expect(toggle.element.getAttribute('aria-checked')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();

    toggle.setChecked(false, true);
    expect(toggle.isChecked()).toBe(false);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('TopNSlider', () => {
  it('initializes with clamped value and renders value label', () => {
    const slider = new TopNSlider({
      min: 1,
      max: 50,
      value: 20,
      unitLabel: 'Top',
    });

    expect(slider.getValue()).toBe(20);
    const valueEl = slider.element.querySelector('.tl-slider-value');
    expect(valueEl?.textContent).toBe('20');

    const outOfBounds = new TopNSlider({
      min: 1,
      max: 50,
      value: 100,
    });
    expect(outOfBounds.getValue()).toBe(50);
  });

  it('clicking a preset pill sets the value and invokes onChange immediately', () => {
    const onChange = vi.fn();
    const slider = new TopNSlider({
      min: 1,
      max: 100,
      value: 10,
      presets: [10, 50, 100],
      onChange,
    });

    const presetButtons = slider.element.querySelectorAll<HTMLButtonElement>('.tl-preset-pill');
    expect(presetButtons.length).toBe(3);

    // Click preset 50
    presetButtons[1]?.click();
    expect(slider.getValue()).toBe(50);
    expect(onChange).toHaveBeenCalledWith(50);
    expect(presetButtons[1]?.classList.contains('active')).toBe(true);
    expect(presetButtons[0]?.classList.contains('active')).toBe(false);
  });

  // Regression: with a value matching no preset (e.g. 20) the pills must show no active state,
  // and the active pill must be exposed to assistive tech via aria-pressed.
  it('marks a preset pill active only when the value equals it', () => {
    const slider = new TopNSlider({ min: 1, max: 50, value: 20, presets: [10, 25, 50] });
    const pills = [...slider.element.querySelectorAll<HTMLButtonElement>('.tl-preset-pill')];

    expect(pills.some(b => b.classList.contains('active'))).toBe(false);
    expect(pills.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true);

    slider.setValue(25);
    expect(pills.filter(b => b.classList.contains('active')).map(b => b.textContent)).toEqual([
      '25',
    ]);
    expect(pills.filter(b => b.getAttribute('aria-pressed') === 'true').length).toBe(1);

    slider.setValue(30);
    expect(pills.some(b => b.classList.contains('active'))).toBe(false);
  });

  it('debounces input change from range slider', async () => {
    const onChange = vi.fn();
    const slider = new TopNSlider({
      min: 1,
      max: 50,
      value: 10,
      debounceMs: 50,
      onChange,
    });

    const rangeInput = slider.element.querySelector<HTMLInputElement>('.tl-range');
    expect(rangeInput).toBeDefined();

    if (rangeInput) {
      rangeInput.value = '35';
      rangeInput.dispatchEvent(new Event('input'));
    }

    expect(onChange).not.toHaveBeenCalled();

    await new Promise(r => setTimeout(r, 60));
    expect(onChange).toHaveBeenCalledWith(35);
    slider.destroy();
  });
});
