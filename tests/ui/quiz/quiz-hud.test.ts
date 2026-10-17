import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuizHud } from '@/ui/quiz/quiz-hud';
import type { QuizEngine } from '@/quiz/engine';
import type { QuizQuestion, QuizAnswer, QuizState } from '@/quiz/types';

describe('QuizHud', () => {
  let container: HTMLElement;
  let mockEngine: QuizEngine;
  let currentState: QuizState;
  let stopFn: ReturnType<typeof vi.fn>;
  let nextQuestionFn: ReturnType<typeof vi.fn>;
  let handleSelectAnswerFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    currentState = 'question';
    stopFn = vi.fn();
    nextQuestionFn = vi.fn();
    handleSelectAnswerFn = vi.fn();

    mockEngine = {
      getState: () => currentState,
      stop: stopFn,
      nextQuestion: nextQuestionFn,
      handleSelectAnswer: handleSelectAnswerFn,
    } as unknown as QuizEngine;
  });

  it('renders initial closed state and mounts DOM elements', () => {
    const hud = new QuizHud({ container, engine: mockEngine });
    expect(hud.element.classList.contains('hidden')).toBe(true);

    const closeBtn = hud.element.querySelector<HTMLButtonElement>('.tl-quiz-close');
    expect(closeBtn).not.toBeNull();
    closeBtn?.click();
    expect(stopFn).toHaveBeenCalled();

    hud.destroy();
  });

  it('displays classic mode question and formats prompt', () => {
    const hud = new QuizHud({ container, engine: mockEngine });

    const q: QuizQuestion = {
      id: 'pl',
      layerId: 'countriesTopN',
      kind: 'country',
      name_pl: 'Polska',
      name_en: 'Poland',
      targetLat: 52,
      targetLng: 19,
    };

    hud.showQuestion(q, 0, 10, 100, 'classic');

    expect(hud.element.classList.contains('hidden')).toBe(false);
    expect(hud.element.querySelector('.tl-quiz-prompt')?.textContent).toContain('Polska');
    expect(hud.element.querySelector('.tl-quiz-progress')?.textContent).toBe('1 / 10');

    hud.destroy();
  });

  it('displays reverse mode question, category badges, 4 options and handles selection', () => {
    const hud = new QuizHud({ container, engine: mockEngine });

    const kinds = [
      'country',
      'river',
      'lake',
      'mountain_range',
      'mountain',
      'peak',
      'desert',
      'capital',
      'megacity',
      'marine',
      'landform',
      'unknown',
    ];

    for (const kind of kinds) {
      const q: QuizQuestion = {
        id: `test-${kind}`,
        layerId: 'countriesTopN',
        kind,
        name_pl: `Test ${kind}`,
        name_en: `Test ${kind} EN`,
        targetLat: 10,
        targetLng: 20,
        options: ['Opcja 1', 'Opcja 2', 'Opcja 3', 'Opcja 4'],
      };

      hud.showQuestion(q, 1, 10, 200, 'reverse');
      expect(hud.element.querySelector('.tl-quiz-category')?.textContent).toBeDefined();
    }

    // Click option 2
    const optionButtons = hud.element.querySelectorAll<HTMLButtonElement>('.tl-quiz-option-btn');
    expect(optionButtons.length).toBe(4);
    optionButtons[1]?.click();
    expect(handleSelectAnswerFn).toHaveBeenCalledWith('Opcja 2');

    // Text input submission via OK button
    const textInput = hud.element.querySelector<HTMLInputElement>('.tl-quiz-text-input');
    const submitBtn = hud.element.querySelector<HTMLButtonElement>('.tl-quiz-submit-btn');

    if (textInput && submitBtn) {
      textInput.value = 'Ręczna Odpowiedź';
      submitBtn.click();
      expect(handleSelectAnswerFn).toHaveBeenCalledWith('Ręczna Odpowiedź');

      // Submit via Enter key
      textInput.value = 'Inna Odpowiedź';
      textInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(handleSelectAnswerFn).toHaveBeenCalledWith('Inna Odpowiedź');
    }

    hud.destroy();
  });

  it('handles keyboard shortcuts (1..4, Enter, Escape) correctly', () => {
    const hud = new QuizHud({ container, engine: mockEngine });

    const q: QuizQuestion = {
      id: 'q1',
      layerId: 'capitals',
      kind: 'capital',
      name_pl: 'Paryż',
      name_en: 'Paris',
      targetLat: 48.8,
      targetLng: 2.3,
      options: ['Berlin', 'Paryż', 'Madryt', 'Rzym'],
    };

    hud.showQuestion(q, 0, 5, 0, 'reverse');

    // Press key '3' -> option index 2 ('Madryt')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    expect(handleSelectAnswerFn).toHaveBeenCalledWith('Madryt');

    // Press Escape in non-idle state
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(stopFn).toHaveBeenCalled();

    // Switch to feedback state and press Enter -> nextQuestion
    currentState = 'feedback';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(nextQuestionFn).toHaveBeenCalled();

    hud.destroy();
  });

  it('shows classic feedback and advances on next button click', () => {
    const hud = new QuizHud({ container, engine: mockEngine });

    const answer: QuizAnswer = {
      question: {
        id: 'q-classic',
        layerId: 'mountains',
        kind: 'mountain',
        name_pl: 'Rysy',
        name_en: 'Rysy',
        targetLat: 49.1,
        targetLng: 20.0,
      },
      mode: 'classic',
      distanceKm: 42,
      points: 850,
      isCorrect: true,
    };

    hud.showFeedback(answer);

    const feedbackEl = hud.element.querySelector('.tl-quiz-feedback');
    expect(feedbackEl?.classList.contains('hidden')).toBe(false);
    expect(feedbackEl?.textContent).toContain('42 km');

    const nextBtn = feedbackEl?.querySelector<HTMLButtonElement>('.tl-quiz-next-btn');
    expect(nextBtn).not.toBeNull();
    nextBtn?.click();
    expect(nextQuestionFn).toHaveBeenCalled();

    hud.hide();
    expect(hud.element.classList.contains('hidden')).toBe(true);

    hud.destroy();
  });

  it('shows reverse feedback for correct and incorrect answers', () => {
    const hud = new QuizHud({ container, engine: mockEngine });

    const q: QuizQuestion = {
      id: 'q-rev',
      layerId: 'deserts',
      kind: 'desert',
      name_pl: 'Sahara',
      name_en: 'Sahara',
      targetLat: 23,
      targetLng: 12,
      options: ['Gobi', 'Sahara', 'Kalahari', 'Atakama'],
    };

    hud.showQuestion(q, 0, 5, 0, 'reverse');

    // Correct answer feedback
    const correctAns: QuizAnswer = {
      question: q,
      mode: 'reverse',
      selectedAnswer: 'Sahara',
      points: 1000,
      isCorrect: true,
    };
    hud.showFeedback(correctAns);
    expect(hud.element.querySelector('.tl-quiz-feedback')?.textContent).toContain('✓');

    // Incorrect answer feedback
    const incorrectAns: QuizAnswer = {
      question: q,
      mode: 'reverse',
      selectedAnswer: 'Gobi',
      points: 0,
      isCorrect: false,
    };
    hud.showFeedback(incorrectAns);
    expect(hud.element.querySelector('.tl-quiz-feedback')?.textContent).toContain('✗');

    hud.destroy();
  });
});
