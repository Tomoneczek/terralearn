import { t } from '@/i18n';
import { parseSvg } from './dom';

export interface ImportConfirmModalOptions {
  container: HTMLElement;
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface ImportDetails {
  itemCount: number;
  exportedAt?: string;
}

export class ImportConfirmModal {
  public readonly element: HTMLElement;
  private readonly options: ImportConfirmModalOptions;
  private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor(options: ImportConfirmModalOptions) {
    this.options = options;

    this.element = document.createElement('div');
    this.element.className = 'tl-quiz-modal-backdrop hidden';
    this.element.id = 'modal-import-confirm';
    options.container.appendChild(this.element);
  }

  public show(details: ImportDetails): void {
    this.render(details);
    this.element.classList.remove('hidden');

    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.handleCancel();
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);

    // Focus confirm button for accessibility
    setTimeout(() => {
      const confirmBtn = this.element.querySelector<HTMLButtonElement>('#btn-import-confirm');
      confirmBtn?.focus();
    }, 50);
  }

  public hide(): void {
    this.element.classList.add('hidden');
    this.element.innerHTML = '';
    if (this.handleKeyDown) {
      window.removeEventListener('keydown', this.handleKeyDown);
      this.handleKeyDown = null;
    }
  }

  private handleCancel(): void {
    this.hide();
    this.options.onCancel?.();
  }

  private handleConfirm(): void {
    this.hide();
    this.options.onConfirm();
  }

  private render(details: ImportDetails): void {
    this.element.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'tl-quiz-summary-card tl-import-confirm-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'import-confirm-title');

    // Header with warning/import icon
    const header = document.createElement('div');
    header.className = 'tl-confirm-header';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'tl-confirm-icon';
    iconSpan.appendChild(
      parseSvg(
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      ),
    );

    const title = document.createElement('h2');
    title.id = 'import-confirm-title';
    title.className = 'tl-summary-title';
    title.textContent = t('transfer.confirmTitle');

    header.appendChild(iconSpan);
    header.appendChild(title);
    card.appendChild(header);

    // Message
    const msg = document.createElement('p');
    msg.className = 'tl-confirm-message';
    msg.textContent = t('transfer.confirmMessage');
    card.appendChild(msg);

    // Metadata badge
    const badgeBox = document.createElement('div');
    badgeBox.className = 'tl-summary-badge-box';

    const countSpan = document.createElement('span');
    countSpan.className = 'tl-confirm-badge-text';
    countSpan.textContent = t('transfer.confirmItemsCount', { count: details.itemCount });
    badgeBox.appendChild(countSpan);

    if (details.exportedAt) {
      const dateSpan = document.createElement('span');
      dateSpan.className = 'tl-confirm-date-text';
      try {
        const formattedDate = new Date(details.exportedAt).toLocaleString();
        dateSpan.textContent = formattedDate;
        badgeBox.appendChild(dateSpan);
      } catch {
        // Ignore invalid date strings
      }
    }
    card.appendChild(badgeBox);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'tl-summary-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'btn-import-cancel';
    cancelBtn.className = 'tl-quiz-btn secondary';
    cancelBtn.textContent = t('transfer.cancelButton');
    cancelBtn.addEventListener('click', () => this.handleCancel());

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.id = 'btn-import-confirm';
    confirmBtn.className = 'tl-quiz-btn primary';
    confirmBtn.textContent = t('transfer.confirmButton');
    confirmBtn.addEventListener('click', () => this.handleConfirm());

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    card.appendChild(actions);

    this.element.appendChild(card);
  }
}
