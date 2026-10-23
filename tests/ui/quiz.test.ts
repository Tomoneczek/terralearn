import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '@/i18n';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { QuizEngine } from '@/quiz/engine';
import { QuizHud } from '@/ui/quiz/quiz-hud';
import { QuizSummaryModal } from '@/ui/quiz/quiz-summary';
import type { QuizRoundSummary } from '@/quiz/types';

// The app defaults to English; these tests assert Polish copy, so pin the locale explicitly.
beforeEach(() => setLocale('pl'));
const plState = () => ({ ...createInitialState(), locale: 'pl' as const });

describe('Quiz UI Components', () => {
  let container: HTMLElement;
  let engine: QuizEngine;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const store = createStore<AppState>(plState());
    engine = new QuizEngine(store);
  });

  describe('QuizHud', () => {
    it('renders question prompt, progress, and updates on feedback', () => {
      const hud = new QuizHud({ container, engine });

      const hudEl = container.querySelector('.tl-quiz-hud')!;
      expect(hudEl.classList.contains('hidden')).toBe(true);

      hud.showQuestion(
        {
          id: 'PL',
          name_pl: 'Polska',
          name_en: 'Poland',
          kind: 'country',
          layerId: 'countriesTopN',
          targetLat: 52.0,
          targetLng: 19.0,
        },
        0,
        10,
        0,
      );

      expect(hudEl.classList.contains('hidden')).toBe(false);
      const prompt = hudEl.querySelector('.tl-quiz-prompt');
      expect(prompt?.textContent).toContain('Polska');

      const progress = hudEl.querySelector('.tl-quiz-progress');
      expect(progress?.textContent).toBe('1 / 10');

      // Show feedback
      hud.showFeedback({
        question: {
          id: 'PL',
          name_pl: 'Polska',
          name_en: 'Poland',
          kind: 'country',
          layerId: 'countriesTopN',
          targetLat: 52.0,
          targetLng: 19.0,
        },
        clickLat: 52.0,
        clickLng: 19.0,
        distanceKm: 0,
        points: 1200,
      });

      const feedback = hudEl.querySelector('.tl-quiz-feedback')!;
      expect(feedback.classList.contains('hidden')).toBe(false);
      expect(feedback.textContent).toContain('0 km');
      expect(feedback.textContent).toContain('1200');

      hud.destroy();
    });

    it('renders reverse quiz prompt, category badge, 4 option buttons and handles answer click', () => {
      const hud = new QuizHud({ container, engine });
      const hudEl = container.querySelector('.tl-quiz-hud')!;

      hud.showQuestion(
        {
          id: 'PL',
          name_pl: 'Polska',
          name_en: 'Poland',
          kind: 'country',
          layerId: 'countriesTopN',
          targetLat: 52.0,
          targetLng: 19.0,
          options: ['Polska', 'Niemcy', 'Czechy', 'Francja'],
        },
        0,
        10,
        0,
        'reverse',
      );

      expect(hudEl.classList.contains('hidden')).toBe(false);
      const prompt = hudEl.querySelector('.tl-quiz-prompt');
      expect(prompt?.textContent).toBe('Co to za obiekt?');

      const category = hudEl.querySelector('.tl-quiz-category');
      expect(category?.textContent).toContain('Kraj');

      const options = hudEl.querySelectorAll('.tl-quiz-option-btn');
      expect(options.length).toBe(4);
      expect(options[0]?.textContent).toContain('1');
      expect(options[0]?.textContent).toContain('Polska');

      // Test feedback for correct reverse answer
      hud.showFeedback({
        question: {
          id: 'PL',
          name_pl: 'Polska',
          name_en: 'Poland',
          kind: 'country',
          layerId: 'countriesTopN',
          targetLat: 52.0,
          targetLng: 19.0,
        },
        mode: 'reverse',
        selectedAnswer: 'Polska',
        isCorrect: true,
        points: 1000,
      });

      const feedback = hudEl.querySelector('.tl-quiz-feedback')!;
      expect(feedback.classList.contains('hidden')).toBe(false);
      expect(feedback.textContent).toContain('Poprawna');
      expect(feedback.textContent).toContain('1000');

      const correctBtn = hudEl.querySelector('.tl-quiz-option-correct');
      expect(correctBtn).not.toBeNull();

      hud.destroy();
    });
  });

  describe('QuizSummaryModal', () => {
    it('renders summary title, score, badge, and answer list', () => {
      const summaryModal = new QuizSummaryModal({ container, engine });

      const modalEl = container.querySelector('.tl-quiz-modal-backdrop')!;
      expect(modalEl.classList.contains('hidden')).toBe(true);

      const mockSummary: QuizRoundSummary = {
        mode: 'classic',
        totalPoints: 10400,
        maxPoints: 12000,
        avgDistanceKm: 45,
        totalQuestions: 1,
        answers: [
          {
            question: {
              id: 'PL',
              name_pl: 'Polska',
              name_en: 'Poland',
              kind: 'country',
              layerId: 'countriesTopN',
              targetLat: 52.0,
              targetLng: 19.0,
            },
            mode: 'classic',
            clickLat: 52.0,
            clickLng: 19.0,
            distanceKm: 0,
            points: 1200,
          },
        ],
      };

      summaryModal.show(mockSummary);

      expect(modalEl.classList.contains('hidden')).toBe(false);
      const badgeTitle = modalEl.querySelector('.tl-summary-badge-title');
      expect(badgeTitle?.textContent).toBe('Mistrz Globusa');

      const rows = modalEl.querySelectorAll('.tl-summary-row');
      expect(rows.length).toBe(1);

      summaryModal.destroy();
    });

    it('renders reverse quiz summary with accuracy metrics', () => {
      const summaryModal = new QuizSummaryModal({ container, engine });
      const modalEl = container.querySelector('.tl-quiz-modal-backdrop')!;

      const mockSummary: QuizRoundSummary = {
        mode: 'reverse',
        totalPoints: 8000,
        maxPoints: 10000,
        correctCount: 8,
        totalQuestions: 10,
        answers: [
          {
            question: {
              id: 'PL',
              name_pl: 'Polska',
              name_en: 'Poland',
              kind: 'country',
              layerId: 'countriesTopN',
              targetLat: 52.0,
              targetLng: 19.0,
            },
            mode: 'reverse',
            selectedAnswer: 'Polska',
            isCorrect: true,
            points: 1000,
          },
        ],
      };

      summaryModal.show(mockSummary);

      expect(modalEl.classList.contains('hidden')).toBe(false);
      const metrics = modalEl.querySelectorAll('.tl-summary-metric');
      expect(metrics.length).toBe(2);
      expect(metrics[1]?.textContent).toContain('8 / 10');
      expect(metrics[1]?.textContent).toContain('80%');

      summaryModal.destroy();
    });
  });
});
