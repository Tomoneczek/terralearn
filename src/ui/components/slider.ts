export interface TopNSliderOptions {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  presets?: readonly number[];
  unitLabel?: string;
  onChange?: (val: number) => void;
  debounceMs?: number;
}

export class TopNSlider {
  public readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly valueDisplay: HTMLElement;
  private readonly presetButtons: HTMLButtonElement[] = [];

  private value: number;
  private readonly min: number;
  private readonly max: number;
  private readonly step: number;
  private readonly unitLabel: string;
  private readonly onChange?: (val: number) => void;
  private readonly debounceMs: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: TopNSliderOptions) {
    this.value = Math.max(options.min, Math.min(options.max, options.value));
    this.min = options.min;
    this.max = options.max;
    this.step = options.step ?? 1;
    this.unitLabel = options.unitLabel ?? 'Top';
    this.onChange = options.onChange;
    this.debounceMs = options.debounceMs ?? 80;

    this.element = document.createElement('div');
    this.element.className = 'tl-slider-container';
    if (options.id) {
      this.element.id = options.id;
    }

    // Top Header: Label & Value
    const header = document.createElement('div');
    header.className = 'tl-slider-header';

    const label = document.createElement('span');
    label.className = 'tl-slider-label';
    label.textContent = this.unitLabel;

    this.valueDisplay = document.createElement('span');
    this.valueDisplay.className = 'tl-slider-value';
    this.valueDisplay.textContent = String(this.value);

    header.appendChild(label);
    header.appendChild(this.valueDisplay);
    this.element.appendChild(header);

    // Range Input
    this.input = document.createElement('input');
    this.input.type = 'range';
    this.input.className = 'tl-range';
    this.input.min = String(this.min);
    this.input.max = String(this.max);
    this.input.step = String(this.step);
    this.input.value = String(this.value);
    this.input.setAttribute('aria-label', `${this.unitLabel} ${this.value}`);
    this.element.appendChild(this.input);

    // Quick Presets
    const presets = options.presets ?? (this.max >= 50 ? [10, 25, 50] : []);
    if (presets.length > 0) {
      const presetsContainer = document.createElement('div');
      presetsContainer.className = 'tl-slider-presets';

      for (const preset of presets) {
        if (preset >= this.min && preset <= this.max) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `tl-preset-pill${preset === this.value ? ' active' : ''}`;
          btn.textContent = String(preset);
          btn.setAttribute('aria-pressed', String(preset === this.value));
          btn.addEventListener('click', e => {
            e.stopPropagation();
            this.setValue(preset, true, false);
          });
          this.presetButtons.push(btn);
          presetsContainer.appendChild(btn);
        }
      }

      this.element.appendChild(presetsContainer);
    }

    this.updateProgressFill();
    this.bindEvents();
  }

  private updateProgressFill(): void {
    const range = this.max - this.min;
    const pct = range === 0 ? 100 : Math.round(((this.value - this.min) / range) * 100);
    this.input.style.setProperty('--slider-pct', `${pct}%`);
  }

  private bindEvents(): void {
    this.input.addEventListener('input', () => {
      const val = Number(this.input.value);
      this.setValue(val, true, true);
    });
  }

  public setValue(val: number, emit = false, debounce = false): void {
    const clamped = Math.max(this.min, Math.min(this.max, val));
    this.value = clamped;
    this.input.value = String(clamped);
    this.valueDisplay.textContent = String(clamped);
    this.input.setAttribute('aria-label', `${this.unitLabel} ${clamped}`);
    this.updateProgressFill();

    for (const btn of this.presetButtons) {
      const isActive = Number(btn.textContent) === clamped;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    }

    if (emit && this.onChange) {
      if (debounce) {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          this.onChange?.(this.value);
        }, this.debounceMs);
      } else {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        this.onChange(this.value);
      }
    }
  }

  public getValue(): number {
    return this.value;
  }

  public destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
