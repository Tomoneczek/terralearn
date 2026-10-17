import type { Store, AppState } from '@/state/types';
import type { LayerId } from '@/layers';
import { resolveAssetUrl } from '@/utils/assets';
import { t, setLocale, getLocale } from '@/i18n';
import type { ObjectFacts, GeographicRelationItem } from '../../scripts/data/buildSearchAndFacts';

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
      s => ({ selection: s.selection, mode: s.mode, locale: s.locale }),
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
    const locale = this.store.get().locale ?? 'pl';
    if (getLocale() !== locale) {
      setLocale(locale);
    }

    this.element.innerHTML = '';
    const facts = this.factsCache?.[id];
    const isEn = locale === 'en';

    // Card Header
    const header = document.createElement('header');
    header.className = 'tl-card-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'tl-card-title-group';

    const kindBadge = document.createElement('span');
    kindBadge.className = 'tl-card-kind';
    kindBadge.textContent = isEn
      ? facts?.kind
        ? t(`quiz.categories.${facts.kind}` as never)
        : 'Feature'
      : (facts?.kind_pl ?? 'Obiekt');

    const mainTitle = isEn
      ? facts?.name_en || facts?.name_pl || id
      : facts?.name_pl || facts?.name_en || id;

    const subTitle = isEn
      ? facts?.name_pl && facts.name_pl !== facts.name_en
        ? facts.name_pl
        : undefined
      : facts?.name_en && facts.name_en !== facts.name_pl
        ? facts.name_en
        : undefined;

    const title = document.createElement('h2');
    title.className = 'tl-card-title';
    title.textContent = mainTitle;

    titleGroup.appendChild(kindBadge);
    titleGroup.appendChild(title);

    if (subTitle) {
      const subtitle = document.createElement('div');
      subtitle.className = 'tl-card-subtitle';
      subtitle.textContent = subTitle;
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

    // Geographic Relations
    if (facts?.relations) {
      const rel = facts.relations;
      const groups: { title: string; items: GeographicRelationItem[] }[] = [];

      // 1. Capital city
      if (rel.capital) {
        groups.push({
          title: t('card.capitalCity'),
          items: [rel.capital],
        });
      }

      // 2. Countries (flows through, located in, or country)
      if (rel.countries && rel.countries.length > 0) {
        let title = t('card.locatedIn');
        if (facts.kind === 'river') {
          title = t('card.flowsThrough');
        } else if (facts.kind === 'capital' || facts.kind === 'megacity' || facts.kind === 'peak') {
          title = t('card.country');
        }
        groups.push({
          title,
          items: rel.countries,
        });
      }

      // 3. Mountain range
      if (rel.mountainRange) {
        groups.push({
          title: t('card.mountainRange'),
          items: [rel.mountainRange],
        });
      }

      // 4. Neighbors / borders with
      if (rel.neighbors && rel.neighbors.length > 0) {
        groups.push({
          title: t('card.bordersWith'),
          items: rel.neighbors,
        });
      }

      if (groups.length > 0) {
        const relationsSection = document.createElement('section');
        relationsSection.className = 'tl-card-relations';
        relationsSection.setAttribute('aria-label', t('card.relationsTitle'));

        for (const group of groups) {
          const groupEl = document.createElement('div');
          groupEl.className = 'tl-relation-group';

          const groupTitle = document.createElement('span');
          groupTitle.className = 'tl-relation-group-title';
          groupTitle.textContent = group.title;
          groupEl.appendChild(groupTitle);

          const chipsContainer = document.createElement('div');
          chipsContainer.className = 'tl-relation-chips';

          for (const item of group.items) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'tl-relation-chip';
            chip.dataset.id = item.id;
            chip.dataset.layer = item.layerId;

            const itemName = isEn ? item.name_en || item.name_pl : item.name_pl || item.name_en;
            chip.setAttribute('aria-label', `${group.title}: ${itemName}`);

            const dot = document.createElement('span');
            dot.className = 'tl-relation-dot';
            dot.dataset.layer = item.layerId;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tl-relation-name';
            nameSpan.textContent = itemName;

            chip.appendChild(dot);
            chip.appendChild(nameSpan);

            chip.addEventListener('click', () => {
              this.store.set({
                ...this.store.get(),
                selection: {
                  id: item.id,
                  layerId: item.layerId as LayerId,
                  kind: item.kind,
                  lat: item.lat,
                  lng: item.lng,
                },
              });
              if (this.onFlyTo) {
                this.onFlyTo();
              } else {
                window.dispatchEvent(new CustomEvent('tl-center-selected'));
              }
            });

            chipsContainer.appendChild(chip);
          }

          groupEl.appendChild(chipsContainer);
          relationsSection.appendChild(groupEl);
        }

        this.element.appendChild(relationsSection);
      }
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
