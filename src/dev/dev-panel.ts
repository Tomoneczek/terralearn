import './dev-panel.css';
import type { FrameSummary } from './frame-stats';
import {
  exportDevParams,
  listDevParams,
  resetAllDevParams,
  setDevParam,
  type DevParamDefinition,
} from './dev-params';

export interface DevStats {
  fps: number;
  tier: string;
  drawCalls: number | null;
  altitude: number | null;
  /** Rolling frame-time summary; omitted when not sampled. */
  frame?: FrameSummary | null;
  /** Draw calls per globe object type, e.g. `polygon 912 · path 342`. */
  drawCallBreakdown?: string;
}

export interface DevPanelOptions {
  container: HTMLElement;
  stats: () => DevStats;
  /** Stats refresh interval in ms. */
  refreshMs?: number;
}

/**
 * Developer tuning panel (English-only on purpose: a dev tool, outside the i18n dictionary).
 * Mounted only with `?dev=true`, see load-dev-panel.ts.
 */
export class DevPanel {
  public readonly element: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly body: HTMLElement;
  private readonly status: HTMLElement;
  private readonly inputs = new Map<string, { input: HTMLInputElement; value: HTMLElement }>();
  private readonly stats: () => DevStats;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly destroyHooks: Array<() => void> = [];

  constructor(options: DevPanelOptions) {
    this.stats = options.stats;

    this.element = document.createElement('aside');
    this.element.className = 'tl-dev-panel';
    this.element.setAttribute('aria-label', 'Developer tools');

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'tl-dev-header';
    header.textContent = 'DEV';
    header.setAttribute('aria-expanded', 'true');
    header.addEventListener('click', () => {
      const collapsed = this.element.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', String(!collapsed));
    });

    this.body = document.createElement('div');
    this.body.className = 'tl-dev-body';

    this.statsEl = document.createElement('div');
    this.statsEl.className = 'tl-dev-stats';
    this.body.appendChild(this.statsEl);

    this.renderParams();

    const actions = document.createElement('div');
    actions.className = 'tl-dev-actions';
    actions.appendChild(this.button('Copy JSON', () => void this.copyJson()));
    actions.appendChild(this.button('Reset', () => this.reset()));
    this.body.appendChild(actions);

    this.status = document.createElement('div');
    this.status.className = 'tl-dev-status';
    this.status.setAttribute('role', 'status');
    this.body.appendChild(this.status);

    this.element.appendChild(header);
    this.element.appendChild(this.body);
    options.container.appendChild(this.element);

    this.refreshStats();
    this.timer = setInterval(() => this.refreshStats(), options.refreshMs ?? 500);
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tl-dev-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private renderParams(): void {
    const groups = new Map<string, DevParamDefinition[]>();
    for (const param of listDevParams()) {
      const list = groups.get(param.group) ?? [];
      list.push(param);
      groups.set(param.group, list);
    }

    for (const [group, list] of groups) {
      const section = document.createElement('section');
      section.className = 'tl-dev-group';
      const title = document.createElement('h3');
      title.textContent = group;
      section.appendChild(title);

      for (const param of list) {
        const row = document.createElement('label');
        row.className = 'tl-dev-row';
        const name = document.createElement('span');
        name.textContent = param.label;
        const value = document.createElement('output');
        value.textContent = this.format(param, param.get());
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(param.min);
        input.max = String(param.max);
        input.step = String(param.step);
        input.value = String(param.get());
        input.setAttribute('aria-label', param.label);
        input.addEventListener('input', () => {
          const applied = setDevParam(param.id, Number(input.value));
          if (applied !== undefined) value.textContent = this.format(param, applied);
        });
        row.append(name, value, input);
        section.appendChild(row);
        this.inputs.set(param.id, { input, value });
      }
      this.body.appendChild(section);
    }
  }

  private format(param: DevParamDefinition, value: number): string {
    const decimals = Math.max(0, -Math.floor(Math.log10(param.step)));
    return value.toFixed(decimals);
  }

  private refreshStats(): void {
    const s = this.stats();
    const fmt = (n: number | null, digits = 0): string => (n === null ? 'n/a' : n.toFixed(digits));
    const frame = s.frame
      ? ` · frame avg ${s.frame.avgMs.toFixed(1)} / p95 ${s.frame.p95Ms.toFixed(1)} / max ${s.frame.maxMs.toFixed(1)} ms`
      : '';
    const breakdown = s.drawCallBreakdown ? `\n${s.drawCallBreakdown}` : '';
    this.statsEl.textContent = `FPS ${s.fps} · tier ${s.tier} · draw calls ${fmt(s.drawCalls)} · alt ${fmt(s.altitude, 2)}${frame}${breakdown}`;
  }

  private reset(): void {
    resetAllDevParams();
    for (const param of listDevParams()) {
      const entry = this.inputs.get(param.id);
      if (!entry) continue;
      entry.input.value = String(param.get());
      entry.value.textContent = this.format(param, param.get());
    }
    this.setStatus('Reset to defaults');
  }

  private async copyJson(): Promise<void> {
    const json = JSON.stringify(exportDevParams(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      this.setStatus('Copied JSON to clipboard');
    } catch {
      console.info('[TerraLearn dev] params:', json);
      this.setStatus('Clipboard unavailable, printed to console');
    }
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
  }

  /** Registers cleanup run on destroy (e.g. unregistering params). */
  public onDestroy(hook: () => void): void {
    this.destroyHooks.push(hook);
  }

  public destroy(): void {
    clearInterval(this.timer);
    this.destroyHooks.forEach(hook => hook());
    this.element.remove();
  }
}
