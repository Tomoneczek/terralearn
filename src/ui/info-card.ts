import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';
import { t } from '@/i18n';
import type { ObjectFacts } from '../../scripts/data/buildSearchAndFacts';

export interface InfoCardOptions {
  container: HTMLElement;
  store: Store<AppState>;
  onFlyTo?: () => void;
}

export class InfoCard {
  public readonly element: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly onFlyTo?: () => void;

  private factsCache: Record<string, ObjectFacts> | null = null;
  private unsubscribe: (() => void) | null = null;
  private isDestroyed = false;

  constructor(options: InfoCardOptions) {
    this.store = options.store;
    this.onFlyTo = options.onFlyTo;

    this.element = document.createElement('article');
    this.element.className = 'tl-info-card hidden';
    this.element.setAttribute('aria-label', t('card.title'));
    options.container.appendChild(this.element);

    this.bindEvents();
    this.bindStore();
    void this.loadFacts();
  }

  private async loadFacts(): Promise<void> {
    try {
      const url = resolveAssetUrl('/data/facts.json');
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as Record<string, ObjectFacts>;
        if (!this.isDestroyed) {
          this.factsCache = data;
          // Refresh if already selected
          const currentSelection = this.store.get().selection;
          if (currentSelection) {
            this.renderContent(currentSelection.id);
          }
        }
      }
    } catch (err) {
      console.warn('[InfoCard] Could not load facts.json:', err);
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.isDestroyed) return;
      if (e.key === 'Escape' && this.store.get().selection !== null) {
        this.close();
      }
    });
  }

  private bindStore(): void {
    this.unsubscribe = this.store.subscribe(
      s => ({ selection: s.selection, mode: s.mode }),
      ({ selection, mode }) => {
        if (!selection || mode === 'quiz') {
          this.element.classList.add('hidden');
          this.element.innerHTML = '';
        } else {
          this.renderContent(selection.id);
          this.element.classList.remove('hidden');
        }
      },
    );
  }

  public close(): void {
    const current = this.store.get();
    this.store.set({
      ...current,
      selection: null,
    });
  }

  private renderContent(id: string): void {
    this.element.innerHTML = '';
    const facts = this.factsCache?.[id];

    // Card Header
    const header = document.createElement('header');
    header.className = 'tl-card-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'tl-card-title-group';

    const kindBadge = document.createElement('span');
    kindBadge.className = 'tl-card-kind';
    kindBadge.textContent = facts?.kind_pl ?? 'Obiekt';

    const title = document.createElement('h2');
    title.className = 'tl-card-title';
    title.textContent = facts?.name_pl ?? id;

    titleGroup.appendChild(kindBadge);
    titleGroup.appendChild(title);

    if (facts?.name_en && facts.name_en !== facts.name_pl) {
      const subtitle = document.createElement('div');
      subtitle.className = 'tl-card-subtitle';
      subtitle.textContent = facts.name_en;
      titleGroup.appendChild(subtitle);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tl-card-close';
    closeBtn.setAttribute('aria-label', t('card.close'));
    closeBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    closeBtn.addEventListener('click', () => {
      this.close();
    });

    header.appendChild(titleGroup);
    header.appendChild(closeBtn);
    this.element.appendChild(header);

    // Stats Table / List
    if (facts?.stats && facts.stats.length > 0) {
      const statsList = document.createElement('dl');
      statsList.className = 'tl-card-stats';

      for (const stat of facts.stats) {
        const item = document.createElement('div');
        item.className = 'tl-card-stat-row';

        const dt = document.createElement('dt');
        dt.className = 'tl-card-stat-label';
        dt.textContent = stat.label;

        const dd = document.createElement('dd');
        dd.className = 'tl-card-stat-value';
        dd.textContent = stat.value;

        item.appendChild(dt);
        item.appendChild(dd);
        statsList.appendChild(item);
      }
      this.element.appendChild(statsList);
    }

    // Comparison note
    if (facts?.comparison) {
      const compBox = document.createElement('div');
      compBox.className = 'tl-card-comparison';

      const icon = document.createElement('span');
      icon.className = 'tl-card-comp-icon';
      icon.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';

      const compText = document.createElement('span');
      compText.className = 'tl-card-comp-text';
      compText.textContent = facts.comparison;

      compBox.appendChild(icon);
      compBox.appendChild(compText);
      this.element.appendChild(compBox);
    }

    // Actions
    const footer = document.createElement('footer');
    footer.className = 'tl-card-footer';

    const flyBtn = document.createElement('button');
    flyBtn.type = 'button';
    flyBtn.className = 'tl-card-btn';
    flyBtn.textContent = t('card.showOnGlobe');
    flyBtn.addEventListener('click', () => {
      if (this.onFlyTo) {
        this.onFlyTo();
      } else {
        window.dispatchEvent(new CustomEvent('tl-center-selected'));
      }
    });

    footer.appendChild(flyBtn);
    this.element.appendChild(footer);
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.element.remove();
  }
}
