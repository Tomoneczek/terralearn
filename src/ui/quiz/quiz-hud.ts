import type { QuizEngine } from '@/quiz/engine';
import type { QuizQuestion, QuizAnswer } from '@/quiz/types';
import { getDistanceColor } from '@/geo/spherical';
import { t } from '@/i18n';

export interface QuizHudOptions {
  container: HTMLElement;
  engine: QuizEngine;
}

export class QuizHud {
  public readonly element: HTMLElement;
  private readonly engine: QuizEngine;

  private readonly progressEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly feedbackContainer: HTMLElement;
  private isDestroyed = false;

  constructor(options: QuizHudOptions) {
    this.engine = options.engine;

    this.element = document.createElement('div');
    this.element.className = 'tl-quiz-hud hidden';
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', t('quiz.title'));

    // Top info row
    const topRow = document.createElement('div');
    topRow.className = 'tl-quiz-top-row';

    this.progressEl = document.createElement('span');
    this.progressEl.className = 'tl-quiz-progress';

    this.scoreEl = document.createElement('span');
    this.scoreEl.className = 'tl-quiz-score';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tl-quiz-close';
    closeBtn.setAttribute('aria-label', t('card.close'));
    closeBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    closeBtn.addEventListener('click', () => {
      this.engine.stop();
    });

    topRow.appendChild(this.progressEl);
    topRow.appendChild(this.scoreEl);
    topRow.appendChild(closeBtn);
    this.element.appendChild(topRow);

    // Prompt row
    this.promptEl = document.createElement('h2');
    this.promptEl.className = 'tl-quiz-prompt';
    this.element.appendChild(this.promptEl);

    // Feedback row
    this.feedbackContainer = document.createElement('div');
    this.feedbackContainer.className = 'tl-quiz-feedback hidden';
    this.element.appendChild(this.feedbackContainer);

    options.container.appendChild(this.element);

    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.isDestroyed) return;
      if (e.key === 'Enter' && this.engine.getState() === 'feedback') {
        this.engine.nextQuestion();
      }
      if (e.key === 'Escape' && this.engine.getState() !== 'idle') {
        this.engine.stop();
      }
    });
  }

  public showQuestion(q: QuizQuestion, index: number, total: number, score: number): void {
    this.element.classList.remove('hidden');
    this.feedbackContainer.classList.add('hidden');
    this.feedbackContainer.innerHTML = '';

    this.progressEl.textContent = `${index + 1} / ${total}`;
    this.scoreEl.textContent = `${score.toLocaleString('pl-PL')} ${t('quiz.points')}`;
    this.promptEl.textContent = `${t('quiz.questionPrefix')} ${q.name_pl}`;
  }

  public showFeedback(answer: QuizAnswer): void {
    this.feedbackContainer.innerHTML = '';
    this.feedbackContainer.classList.remove('hidden');

    const pill = document.createElement('div');
    pill.className = 'tl-quiz-feedback-pill';
    const color = getDistanceColor(answer.distanceKm);
    pill.style.borderColor = color;
    pill.style.color = color;

    const errorText = document.createElement('span');
    errorText.textContent = `${t('quiz.errorDistance')}: ${answer.distanceKm.toLocaleString('pl-PL')} km (+${answer.points} ${t('quiz.points')})`;
    pill.appendChild(errorText);

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'tl-quiz-next-btn';
    nextBtn.textContent = `${t('quiz.next')} (Enter)`;
    nextBtn.addEventListener('click', () => {
      this.engine.nextQuestion();
    });

    this.feedbackContainer.appendChild(pill);
    this.feedbackContainer.appendChild(nextBtn);
  }

  public hide(): void {
    this.element.classList.add('hidden');
    this.feedbackContainer.classList.add('hidden');
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.element.remove();
  }
}
