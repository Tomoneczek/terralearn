import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { QuizEngine } from '@/quiz/engine';
import { QuizHud } from '@/ui/quiz/quiz-hud';
import { QuizSummaryModal } from '@/ui/quiz/quiz-summary';
import type { QuizRoundSummary } from '@/quiz/types';

describe('Quiz UI Components', () => {
  let container: HTMLElement;
  let engine: QuizEngine;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const store = createStore<AppState>(createInitialState());
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
  });

  describe('QuizSummaryModal', () => {
    it('renders summary title, score, badge, and answer list', () => {
      const summaryModal = new QuizSummaryModal({ container, engine });

      const modalEl = container.querySelector('.tl-quiz-modal-backdrop')!;
      expect(modalEl.classList.contains('hidden')).toBe(true);

      const mockSummary: QuizRoundSummary = {
        totalPoints: 10400,
        maxPoints: 12000,
        avgDistanceKm: 45,
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
  });
});
