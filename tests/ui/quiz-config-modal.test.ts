import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuizConfigModal } from '@/ui/quiz/quiz-config-modal';
import type { QuizConfig } from '@/quiz/types';
import {
  loadLastQuizConfig,
  saveLastQuizConfig,
  DEFAULT_QUIZ_CONFIG,
  QUIZ_CONFIG_STORAGE_KEY,
} from '@/quiz/persistence';

describe('QuizConfigModal and Persistence', () => {
  let container: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders modal dialog with default configuration and controls', () => {
    const onStart = vi.fn();
    const modal = new QuizConfigModal({ container, onStart });

    expect(modal.element.classList.contains('hidden')).toBe(true);

    modal.show();

    expect(modal.element.classList.contains('hidden')).toBe(false);
    expect(modal.element.querySelector('[role="dialog"]')).not.toBeNull();
    expect(modal.element.querySelector('#quiz-continent-select')).not.toBeNull();
    expect(modal.element.querySelector('#quiz-category-select')).not.toBeNull();
    expect(modal.element.querySelector('#btn-modal-start-quiz')).not.toBeNull();
    expect(modal.element.querySelector('#btn-modal-cancel-quiz')).not.toBeNull();

    modal.destroy();
  });

  it('updates configuration when user interacts with controls and triggers onStart', () => {
    let startedConfig: QuizConfig | null = null;
    const modal = new QuizConfigModal({
      container,
      onStart: cfg => {
        startedConfig = cfg;
      },
    });

    modal.show();

    // Select reverse mode button
    const modeButtons = modal.element.querySelectorAll<HTMLButtonElement>('.tl-quiz-mode-btn');
    expect(modeButtons.length).toBe(2);
    modeButtons[1]?.click(); // click reverse mode

    // Select continent
    const continentSelect =
      modal.element.querySelector<HTMLSelectElement>('#quiz-continent-select')!;
    continentSelect.value = 'europe';
    continentSelect.dispatchEvent(new Event('change'));

    // Select category
    const categorySelect = modal.element.querySelector<HTMLSelectElement>('#quiz-category-select')!;
    categorySelect.value = 'rivers';
    categorySelect.dispatchEvent(new Event('change'));

    // Click "Rozpocznij quiz"
    const startBtn = modal.element.querySelector<HTMLButtonElement>('#btn-modal-start-quiz')!;
    startBtn.click();

    expect(startedConfig).not.toBeNull();
    const config = startedConfig as unknown as QuizConfig;
    expect(config.mode).toBe('reverse');
    expect(config.continent).toBe('europe');
    expect(config.category).toBe('rivers');
    expect(modal.element.classList.contains('hidden')).toBe(true);

    // Verify it was persisted to localStorage
    const saved = loadLastQuizConfig();
    expect(saved.mode).toBe('reverse');
    expect(saved.continent).toBe('europe');
    expect(saved.category).toBe('rivers');

    modal.destroy();
  });

  it('cancels modal when Cancel button is clicked or Escape key is pressed', () => {
    const onCancel = vi.fn();
    const modal = new QuizConfigModal({ container, onStart: vi.fn(), onCancel });

    modal.show();
    expect(modal.element.classList.contains('hidden')).toBe(false);

    // Press Escape
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal.element.classList.contains('hidden')).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);

    modal.destroy();
  });

  it('handles corrupted localStorage gracefully by falling back to DEFAULT_QUIZ_CONFIG', () => {
    localStorage.setItem(QUIZ_CONFIG_STORAGE_KEY, 'invalid json {[');
    expect(loadLastQuizConfig()).toEqual(DEFAULT_QUIZ_CONFIG);

    localStorage.setItem(QUIZ_CONFIG_STORAGE_KEY, JSON.stringify({ mode: 'invalid-mode' }));
    expect(loadLastQuizConfig()).toEqual(DEFAULT_QUIZ_CONFIG);

    const valid: QuizConfig = {
      mode: 'classic',
      category: 'mountains',
      continent: 'asia',
      difficulty: 'easy',
      questionCount: 5,
    };
    saveLastQuizConfig(valid);
    expect(loadLastQuizConfig()).toEqual(valid);
  });
});
