import type { Store, AppState } from '@/state/types';
import { resolveAssetUrl } from '@/utils/assets';
import { t } from '@/i18n';
import { searchIndex, type SearchIndexItem } from '@/geo/search';
import { getLayerColor } from './sidebar';

export interface SearchOverlayOptions {
  container: HTMLElement;
  store: Store<AppState>;
  onSelect?: (item: SearchIndexItem) => void;
}

export class SearchOverlay {
  public readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly dropdown: HTMLElement;
  private readonly store: Store<AppState>;
  private readonly onSelect?: (item: SearchIndexItem) => void;

  private items: SearchIndexItem[] = [];
  private currentResults: SearchIndexItem[] = [];
  private selectedIndex = -1;
  private isDestroyed = false;

  constructor(options: SearchOverlayOptions) {
    this.store = options.store;
    this.onSelect = options.onSelect;

    this.element = document.createElement('div');
    this.element.className = 'tl-search-box';

    // Search Icon
    const iconSpan = document.createElement('span');
    iconSpan.className = 'tl-search-icon';
    iconSpan.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
    this.element.appendChild(iconSpan);

    // Input
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'tl-search-input';
    this.input.placeholder = t('app.searchPlaceholder');
    this.input.setAttribute('aria-label', t('app.searchPlaceholder'));
    this.element.appendChild(this.input);

    // Keyboard shortcut badge
    const kbd = document.createElement('kbd');
    kbd.className = 'tl-search-kbd';
    kbd.textContent = '/';
    this.element.appendChild(kbd);

    // Dropdown list
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'tl-search-dropdown';
    this.dropdown.setAttribute('role', 'listbox');
    this.element.appendChild(this.dropdown);

    options.container.appendChild(this.element);

    this.bindEvents();
    void this.loadIndex();
  }

  private async loadIndex(): Promise<void> {
    try {
      const url = resolveAssetUrl('/data/search-index.json');
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as SearchIndexItem[];
        if (!this.isDestroyed) {
          this.items = data;
        }
      }
    } catch (err) {
      console.warn('[SearchOverlay] Could not load search-index.json:', err);
    }
  }

  private bindEvents(): void {
    // Global hotkey '/' and 'Ctrl+K'
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.isDestroyed) return;
      if (
        (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        this.input.focus();
      }
    });

    // Input typing
    this.input.addEventListener('input', () => {
      this.handleInput();
    });

    // Dropdown navigation
    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.moveSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveSelection(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.selectedIndex >= 0 && this.selectedIndex < this.currentResults.length) {
          const item = this.currentResults[this.selectedIndex];
          if (item) this.selectItem(item);
        }
      } else if (e.key === 'Escape') {
        this.closeDropdown();
        this.input.blur();
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', e => {
      if (!this.element.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });
  }

  private handleInput(): void {
    const q = this.input.value.trim();
    if (!q) {
      this.closeDropdown();
      return;
    }

    this.currentResults = searchIndex(q, this.items, 8);
    this.selectedIndex = this.currentResults.length > 0 ? 0 : -1;
    this.renderDropdown();
  }

  private moveSelection(delta: number): void {
    if (this.currentResults.length === 0) return;
    this.selectedIndex =
      (this.selectedIndex + delta + this.currentResults.length) % this.currentResults.length;
    this.updateHighlightedItem();
  }

  private updateHighlightedItem(): void {
    const items = this.dropdown.querySelectorAll('.tl-search-item');
    items.forEach((el, idx) => {
      el.classList.toggle('highlighted', idx === this.selectedIndex);
      if (idx === this.selectedIndex) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private renderDropdown(): void {
    this.dropdown.innerHTML = '';
    if (this.currentResults.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tl-search-empty';
      empty.textContent = t('search.noResults');
      this.dropdown.appendChild(empty);
      this.dropdown.classList.add('open');
      return;
    }

    this.currentResults.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = `tl-search-item${idx === this.selectedIndex ? ' highlighted' : ''}`;
      el.setAttribute('role', 'option');

      const dot = document.createElement('span');
      dot.className = 'tl-layer-dot';
      const color = getLayerColor(item.layerId);
      dot.style.backgroundColor = color;
      dot.style.color = color;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'tl-search-item-name';
      nameSpan.textContent = item.name_pl;

      const kindBadge = document.createElement('span');
      kindBadge.className = 'tl-search-item-kind';
      kindBadge.textContent = item.name_en !== item.name_pl ? item.name_en : item.kind;

      el.appendChild(dot);
      el.appendChild(nameSpan);
      el.appendChild(kindBadge);

      el.addEventListener('click', () => {
        this.selectItem(item);
      });

      this.dropdown.appendChild(el);
    });

    this.dropdown.classList.add('open');
  }

  public selectItem(item: SearchIndexItem): void {
    // 1. Ensure layer is enabled in store
    const current = this.store.get();
    const nextLayers = { ...current.layers };
    if (!nextLayers[item.layerId]?.enabled) {
      nextLayers[item.layerId] = {
        ...nextLayers[item.layerId],
        enabled: true,
      };
    }

    // 2. Set selection in store
    this.store.set({
      ...current,
      layers: nextLayers,
      selection: {
        id: item.id,
        layerId: item.layerId,
        kind: item.kind,
      },
    });

    // 3. Callback
    if (this.onSelect) {
      this.onSelect(item);
    } else {
      window.dispatchEvent(
        new CustomEvent('tl-fly-to', { detail: { lat: item.lat, lng: item.lng } }),
      );
    }

    this.input.value = '';
    this.closeDropdown();
  }

  public closeDropdown(): void {
    this.dropdown.classList.remove('open');
    this.dropdown.innerHTML = '';
    this.currentResults = [];
    this.selectedIndex = -1;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.element.remove();
  }
}
