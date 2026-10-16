export interface ToggleSwitchOptions {
  id?: string;
  checked: boolean;
  ariaLabel?: string;
  onChange?: (checked: boolean) => void;
}

export class ToggleSwitch {
  public readonly element: HTMLButtonElement;
  private checked: boolean;
  private readonly onChange?: (checked: boolean) => void;

  constructor(options: ToggleSwitchOptions) {
    this.checked = options.checked;
    this.onChange = options.onChange;

    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.role = 'switch';
    this.element.className = 'tl-toggle';
    this.element.setAttribute('aria-checked', String(this.checked));
    if (options.ariaLabel) {
      this.element.setAttribute('aria-label', options.ariaLabel);
    }
    if (options.id) {
      this.element.id = options.id;
    }

    const knob = document.createElement('span');
    knob.className = 'tl-toggle-knob';
    this.element.appendChild(knob);

    this.bindEvents();
  }

  private bindEvents(): void {
    this.element.addEventListener('click', e => {
      e.stopPropagation();
      this.toggle();
    });

    this.element.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      }
    });
  }

  public toggle(): void {
    this.setChecked(!this.checked, true);
  }

  public setChecked(value: boolean, emit = false): void {
    if (this.checked === value && !emit) return;
    this.checked = value;
    this.element.setAttribute('aria-checked', String(this.checked));
    if (emit && this.onChange) {
      this.onChange(this.checked);
    }
  }

  public isChecked(): boolean {
    return this.checked;
  }
}
