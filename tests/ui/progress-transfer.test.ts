import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SidebarController } from '@/ui/sidebar';
import { store } from '@/state';
import { showToast } from '@/ui/toast';
import { ImportConfirmModal } from '@/ui/import-confirm-modal';
import * as transferModule from '@/quiz/srs/transfer';

describe('Progress Transfer UI Integration', () => {
  let sidebarContainer: HTMLElement;
  let modalContainer: HTMLElement;
  let sidebar: SidebarController;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';

    sidebarContainer = document.createElement('div');
    modalContainer = document.createElement('div');
    document.body.appendChild(sidebarContainer);
    document.body.appendChild(modalContainer);

    sidebar = new SidebarController({
      container: sidebarContainer,
      store,
      modalContainer,
    });
  });

  afterEach(() => {
    sidebar.destroy();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders export and import buttons in the sidebar', () => {
    const exportBtn = sidebarContainer.querySelector<HTMLButtonElement>('#btn-export-progress');
    const importBtn = sidebarContainer.querySelector<HTMLButtonElement>('#btn-import-progress');
    const fileInput = sidebarContainer.querySelector<HTMLInputElement>('#input-import-progress');

    expect(exportBtn).toBeTruthy();
    expect(importBtn).toBeTruthy();
    expect(fileInput).toBeTruthy();
    expect(fileInput?.type).toBe('file');
    expect(fileInput?.accept).toContain('.json');
  });

  it('triggers downloadExportFile and shows success toast when clicking export button', () => {
    const downloadSpy = vi.spyOn(transferModule, 'downloadExportFile').mockImplementation(() => {});

    const exportBtn = sidebarContainer.querySelector<HTMLButtonElement>('#btn-export-progress')!;
    exportBtn.click();

    expect(downloadSpy).toHaveBeenCalledTimes(1);

    const toast = document.querySelector('.tl-toast-success');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain('Wyeksportowano postępy');
  });

  it('triggers fileInput click when clicking import button', () => {
    const fileInput = sidebarContainer.querySelector<HTMLInputElement>('#input-import-progress')!;
    const clickSpy = vi.spyOn(fileInput, 'click');

    const importBtn = sidebarContainer.querySelector<HTMLButtonElement>('#btn-import-progress')!;
    importBtn.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('shows error toast when imported file is invalid JSON', async () => {
    const fileInput = sidebarContainer.querySelector<HTMLInputElement>('#input-import-progress')!;

    const file = new File(['{ malformed json'], 'progress.json', { type: 'application/json' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: true,
    });

    fileInput.dispatchEvent(new Event('change'));

    // Wait for FileReader onload
    await new Promise(r => setTimeout(r, 50));

    const toast = document.querySelector('.tl-toast-error');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain('nie jest poprawnym');
  });

  it('shows error toast when imported file has unsupported version', async () => {
    const fileInput = sidebarContainer.querySelector<HTMLInputElement>('#input-import-progress')!;

    const file = new File([JSON.stringify({ version: 99, srs: {} })], 'progress.json', {
      type: 'application/json',
    });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: true,
    });

    fileInput.dispatchEvent(new Event('change'));

    await new Promise(r => setTimeout(r, 50));

    const toast = document.querySelector('.tl-toast-error');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain('Nieobsługiwana wersja');
  });

  it('shows confirmation modal when imported file is valid, and allows canceling', async () => {
    const applySpy = vi.spyOn(transferModule, 'applyImportedData');
    const fileInput = sidebarContainer.querySelector<HTMLInputElement>('#input-import-progress')!;

    const validPayload = {
      version: 1,
      exportedAt: '2026-10-17T14:00:00.000Z',
      srs: {
        PL: {
          id: 'PL',
          box: 5,
          lastReviewed: 100,
          nextReview: 200,
          consecutiveCorrect: 5,
          totalAttempts: 5,
          successCount: 5,
        },
      },
    };

    const file = new File([JSON.stringify(validPayload)], 'progress.json', {
      type: 'application/json',
    });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: true,
    });

    fileInput.dispatchEvent(new Event('change'));

    await new Promise(r => setTimeout(r, 50));

    // Modal should be visible
    const modal = document.querySelector<HTMLElement>('#modal-import-confirm');
    expect(modal).toBeTruthy();
    expect(modal?.classList.contains('hidden')).toBe(false);
    expect(modal?.textContent).toContain('Liczba obiektów SRS w pliku: 1');

    // Click Cancel
    const cancelBtn = modal!.querySelector<HTMLButtonElement>('#btn-import-cancel');
    expect(cancelBtn).toBeTruthy();
    cancelBtn!.click();

    expect(modal?.classList.contains('hidden')).toBe(true);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('applies imported data and displays success toast when confirming import', async () => {
    const applySpy = vi.spyOn(transferModule, 'applyImportedData');
    const fileInput = sidebarContainer.querySelector<HTMLInputElement>('#input-import-progress')!;

    const validPayload = {
      version: 1,
      exportedAt: '2026-10-17T14:00:00.000Z',
      srs: {
        FR: {
          id: 'FR',
          box: 3,
          lastReviewed: 100,
          nextReview: 200,
          consecutiveCorrect: 2,
          totalAttempts: 2,
          successCount: 2,
        },
        DE: {
          id: 'DE',
          box: 2,
          lastReviewed: 100,
          nextReview: 200,
          consecutiveCorrect: 1,
          totalAttempts: 1,
          successCount: 1,
        },
      },
    };

    const file = new File([JSON.stringify(validPayload)], 'progress.json', {
      type: 'application/json',
    });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: true,
    });

    fileInput.dispatchEvent(new Event('change'));

    await new Promise(r => setTimeout(r, 50));

    const modal = document.querySelector<HTMLElement>('#modal-import-confirm');
    expect(modal).toBeTruthy();
    const confirmBtn = modal!.querySelector<HTMLButtonElement>('#btn-import-confirm');
    expect(confirmBtn).toBeTruthy();
    confirmBtn!.click();

    expect(modal?.classList.contains('hidden')).toBe(true);
    expect(applySpy).toHaveBeenCalledTimes(1);

    const toast = document.querySelector('.tl-toast-success');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain('2 obiektów SRS');
  });

  it('closes ImportConfirmModal on Escape key', () => {
    const modal = new ImportConfirmModal({
      container: document.body,
      onConfirm: vi.fn(),
    });

    modal.show({ itemCount: 3, exportedAt: '2026-10-17T10:00:00.000Z' });
    expect(modal.element.classList.contains('hidden')).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal.element.classList.contains('hidden')).toBe(true);
  });

  it('manages toast notifications with auto-dismiss and manual close', async () => {
    vi.useFakeTimers();

    const toast = showToast('Test Message', 'info', 1000);
    expect(document.body.contains(toast)).toBe(true);
    expect(toast.textContent).toContain('Test Message');

    // Manual close button
    const closeBtn = toast.querySelector<HTMLButtonElement>('.tl-toast-close')!;
    closeBtn.click();
    expect(toast.classList.contains('tl-toast-hiding')).toBe(true);

    vi.advanceTimersByTime(300);
    expect(document.body.contains(toast)).toBe(false);

    vi.useRealTimers();
  });
});
