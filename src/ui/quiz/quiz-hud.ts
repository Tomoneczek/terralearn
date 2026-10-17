import type { QuizEngine } from '@/quiz/engine';
import type { QuizQuestion, QuizAnswer, QuizMode } from '@/quiz/types';
import { getDistanceColor } from '@/geo/spherical';
import { t } from '@/i18n';
import { getAutocompleteSuggestions } from '@/quiz/questions';

export interface QuizHudOptions {
  container: HTMLElement;
  engine: QuizEngine;
}
function getCategoryLabel(kind: string): string {
  switch (kind) {
    case 'country':
      return t('quiz.categories.country');
    case 'river':
      return t('quiz.categories.river');
    case 'lake':
      return t('quiz.categories.lake');
    case 'mountain_range':
      return t('quiz.categories.mountain_range');
    case 'mountain':
      return t('quiz.categories.mountain');
    case 'peak':
      return t('quiz.categories.peak');
    case 'desert':
      return t('quiz.categories.desert');
    case 'capital':
      return t('quiz.categories.capital');
    case 'megacity':
      return t('quiz.categories.megacity');
    case 'marine':
      return t('quiz.categories.marine');
    case 'landform':
      return t('quiz.categories.landform');
    default:
      return t('quiz.categories.other');
  }
}

export class QuizHud {
  public readonly element: HTMLElement;
  private readonly engine: QuizEngine;

  private readonly progressEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly categoryEl: HTMLElement;
  private readonly optionsGrid: HTMLElement;
  private readonly inputRow: HTMLElement;
  private readonly textInput: HTMLInputElement;
  private readonly datalist: HTMLDataListElement;
  private readonly scoreEl: HTMLElement;
  private readonly feedbackContainer: HTMLElement;
  private currentMode: QuizMode = 'classic';
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

    // Category badge row (reverse quiz)
    this.categoryEl = document.createElement('div');
    this.categoryEl.className = 'tl-quiz-category hidden';
    this.element.appendChild(this.categoryEl);

    // Options grid (reverse quiz 4-choice)
    this.optionsGrid = document.createElement('div');
    this.optionsGrid.className = 'tl-quiz-options-grid hidden';
    this.element.appendChild(this.optionsGrid);

    // Text autocomplete input row (reverse quiz alternative input)
    this.inputRow = document.createElement('div');
    this.inputRow.className = 'tl-quiz-input-row hidden';

    this.datalist = document.createElement('datalist');
    this.datalist.id = 'tl-quiz-suggestions';

    this.textInput = document.createElement('input');
    this.textInput.type = 'text';
    this.textInput.className = 'tl-quiz-text-input';
    this.textInput.setAttribute('placeholder', t('quiz.typeAnswerPlaceholder'));
    this.textInput.setAttribute('list', 'tl-quiz-suggestions');

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'tl-quiz-submit-btn';
    submitBtn.textContent = 'OK';

    const handleSubmit = () => {
      const val = this.textInput.value.trim();
      if (val && this.engine.getState() === 'question') {
        this.engine.handleSelectAnswer(val);
      }
    };

    submitBtn.addEventListener('click', handleSubmit);
    this.textInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    });

    this.inputRow.appendChild(this.datalist);
    this.inputRow.appendChild(this.textInput);
    this.inputRow.appendChild(submitBtn);
    this.element.appendChild(this.inputRow);

    // Feedback row
    this.feedbackContainer = document.createElement('div');
    this.feedbackContainer.className = 'tl-quiz-feedback hidden';
    this.element.appendChild(this.feedbackContainer);

    options.container.appendChild(this.element);

    this.bindEvents();
    this.initAutocomplete();
  }

  private initAutocomplete(): void {
    const suggestions = getAutocompleteSuggestions();
    this.datalist.innerHTML = '';
    for (const name of suggestions) {
      const opt = document.createElement('option');
      opt.value = name;
      this.datalist.appendChild(opt);
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.isDestroyed) return;

      if (e.key === 'Enter' && this.engine.getState() === 'feedback') {
        this.engine.nextQuestion();
        return;
      }

      if (e.key === 'Escape' && this.engine.getState() !== 'idle') {
        this.engine.stop();
        return;
      }

      // Keyboard shortcuts 1..4 in reverse quiz when input is not focused
      if (
        this.engine.getState() === 'question' &&
        this.currentMode === 'reverse' &&
        document.activeElement !== this.textInput
      ) {
        if (['1', '2', '3', '4'].includes(e.key)) {
          const index = parseInt(e.key, 10) - 1;
          const buttons =
            this.optionsGrid.querySelectorAll<HTMLButtonElement>('.tl-quiz-option-btn');
          const btn = buttons[index];
          if (btn && !btn.disabled) {
            btn.click();
          }
        }
      }
    });
  }

  public showQuestion(
    q: QuizQuestion,
    index: number,
    total: number,
    score: number,
    mode: QuizMode = 'classic',
  ): void {
    this.currentMode = mode;
    this.element.classList.remove('hidden');
    this.feedbackContainer.classList.add('hidden');
    this.feedbackContainer.innerHTML = '';

    this.progressEl.textContent = `${index + 1} / ${total}`;
    this.scoreEl.textContent = `${score.toLocaleString('pl-PL')} ${t('quiz.points')}`;

    if (mode === 'classic') {
      this.categoryEl.classList.add('hidden');
      this.optionsGrid.classList.add('hidden');
      this.inputRow.classList.add('hidden');
      this.promptEl.textContent = `${t('quiz.questionPrefix')} ${q.name_pl}`;
    } else {
      // Reverse quiz: "Co to za obiekt?"
      this.promptEl.textContent = t('quiz.reversePrompt');

      // Category label
      const catName = getCategoryLabel(q.kind);
      this.categoryEl.textContent = `${t('quiz.categoryPrefix')} ${catName}`;
      this.categoryEl.classList.remove('hidden');

      // Render 4 options
      this.optionsGrid.innerHTML = '';
      this.optionsGrid.classList.remove('hidden');

      const options = q.options ?? [q.name_pl];
      options.forEach((optText, optIdx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tl-quiz-option-btn';
        btn.dataset.value = optText;

        const keyBadge = document.createElement('span');
        keyBadge.className = 'tl-quiz-option-key';
        keyBadge.textContent = String(optIdx + 1);

        const textSpan = document.createElement('span');
        textSpan.className = 'tl-quiz-option-text';
        textSpan.textContent = optText;

        btn.appendChild(keyBadge);
        btn.appendChild(textSpan);

        btn.addEventListener('click', () => {
          this.engine.handleSelectAnswer(optText);
        });

        this.optionsGrid.appendChild(btn);
      });

      // Alternative text input
      this.inputRow.classList.remove('hidden');
      this.textInput.value = '';
      this.textInput.disabled = false;
    }
  }

  public showFeedback(answer: QuizAnswer): void {
    this.feedbackContainer.innerHTML = '';
    this.feedbackContainer.classList.remove('hidden');

    const isClassic =
      answer.mode === 'classic' || (!answer.mode && answer.distanceKm !== undefined);

    if (isClassic) {
      const pill = document.createElement('div');
      pill.className = 'tl-quiz-feedback-pill';
      const color = getDistanceColor(answer.distanceKm ?? 0);
      pill.style.borderColor = color;
      pill.style.color = color;

      const errorText = document.createElement('span');
      errorText.textContent = `${t('quiz.errorDistance')}: ${(answer.distanceKm ?? 0).toLocaleString('pl-PL')} km (+${answer.points} ${t('quiz.points')})`;
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
    } else {
      // Reverse feedback
      const buttons = this.optionsGrid.querySelectorAll<HTMLButtonElement>('.tl-quiz-option-btn');
      buttons.forEach(btn => {
        btn.disabled = true;
        const text = btn.querySelector('.tl-quiz-option-text')?.textContent;
        if (text === answer.question.name_pl) {
          btn.classList.add('tl-quiz-option-correct');
        } else if (text === answer.selectedAnswer && !answer.isCorrect) {
          btn.classList.add('tl-quiz-option-incorrect');
        }
      });

      this.textInput.disabled = true;

      const pill = document.createElement('div');
      pill.className = 'tl-quiz-feedback-pill';

      if (answer.isCorrect) {
        pill.style.borderColor = '#4ade80';
        pill.style.color = '#4ade80';
        pill.textContent = `✓ ${t('quiz.correctFeedback')} (+${answer.points} ${t('quiz.points')})`;
      } else {
        pill.style.borderColor = '#f87171';
        pill.style.color = '#f87171';
        pill.textContent = `✗ ${t('quiz.incorrectFeedback')} ${answer.question.name_pl} (+0 ${t('quiz.points')})`;
      }

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
  }

  public hide(): void {
    this.element.classList.add('hidden');
    this.feedbackContainer.classList.add('hidden');
    this.categoryEl.classList.add('hidden');
    this.optionsGrid.classList.add('hidden');
    this.inputRow.classList.add('hidden');
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.element.remove();
  }
}
