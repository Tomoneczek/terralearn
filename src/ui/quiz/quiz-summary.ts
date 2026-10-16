import type { QuizEngine } from '@/quiz/engine';
import type { QuizRoundSummary } from '@/quiz/types';
import { getBadgeForScore } from '@/quiz/scoring';
import { getDistanceColor } from '@/geo/spherical';
import { t } from '@/i18n';

export interface QuizSummaryModalOptions {
  container: HTMLElement;
  engine: QuizEngine;
}

export class QuizSummaryModal {
  public readonly element: HTMLElement;
  private readonly engine: QuizEngine;

  constructor(options: QuizSummaryModalOptions) {
    this.engine = options.engine;

    this.element = document.createElement('div');
    this.element.className = 'tl-quiz-modal-backdrop hidden';
    options.container.appendChild(this.element);
  }

  public show(summary: QuizRoundSummary): void {
    this.element.innerHTML = '';
    this.element.classList.remove('hidden');

    const card = document.createElement('div');
    card.className = 'tl-quiz-summary-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', t('quiz.summary'));

    // 1. Badge & Title
    const badge = getBadgeForScore(summary.totalPoints);

    const title = document.createElement('h2');
    title.className = 'tl-summary-title';
    title.textContent = t('quiz.summary');
    card.appendChild(title);

    const badgeBox = document.createElement('div');
    badgeBox.className = 'tl-summary-badge-box';

    const badgeTitle = document.createElement('div');
    badgeTitle.className = 'tl-summary-badge-title';
    badgeTitle.textContent = badge.title;

    const badgeDesc = document.createElement('div');
    badgeDesc.className = 'tl-summary-badge-desc';
    badgeDesc.textContent = badge.description;

    badgeBox.appendChild(badgeTitle);
    badgeBox.appendChild(badgeDesc);
    card.appendChild(badgeBox);

    // 2. Metrics (Score & Distance)
    const metricsRow = document.createElement('div');
    metricsRow.className = 'tl-summary-metrics';

    const scoreCol = document.createElement('div');
    scoreCol.className = 'tl-summary-metric';
    const scoreVal = document.createElement('span');
    scoreVal.className = 'tl-summary-metric-val';
    scoreVal.textContent = `${summary.totalPoints.toLocaleString('pl-PL')} / ${summary.maxPoints.toLocaleString('pl-PL')}`;
    const scoreLbl = document.createElement('span');
    scoreLbl.className = 'tl-summary-metric-lbl';
    scoreLbl.textContent = t('quiz.score');
    scoreCol.appendChild(scoreVal);
    scoreCol.appendChild(scoreLbl);

    const distCol = document.createElement('div');
    distCol.className = 'tl-summary-metric';
    const distVal = document.createElement('span');
    distVal.className = 'tl-summary-metric-val';
    distVal.textContent = `${summary.avgDistanceKm.toLocaleString('pl-PL')} km`;
    const distLbl = document.createElement('span');
    distLbl.className = 'tl-summary-metric-lbl';
    distLbl.textContent = t('quiz.avgError');
    distCol.appendChild(distVal);
    distCol.appendChild(distLbl);

    metricsRow.appendChild(scoreCol);
    metricsRow.appendChild(distCol);
    card.appendChild(metricsRow);

    // 3. Review list
    const list = document.createElement('div');
    list.className = 'tl-summary-list';

    for (const ans of summary.answers) {
      const row = document.createElement('div');
      row.className = 'tl-summary-row';

      const name = document.createElement('span');
      name.className = 'tl-summary-item-name';
      name.textContent = ans.question.name_pl;

      const details = document.createElement('span');
      details.className = 'tl-summary-item-details';
      const color = getDistanceColor(ans.distanceKm);
      details.style.color = color;
      details.textContent = `${ans.distanceKm.toLocaleString('pl-PL')} km (+${ans.points} ${t('quiz.points')})`;

      row.appendChild(name);
      row.appendChild(details);
      list.appendChild(row);
    }
    card.appendChild(list);

    // 4. Action buttons
    const actions = document.createElement('div');
    actions.className = 'tl-summary-actions';

    const playAgainBtn = document.createElement('button');
    playAgainBtn.type = 'button';
    playAgainBtn.className = 'tl-btn-primary';
    playAgainBtn.textContent = t('quiz.playAgain');
    playAgainBtn.addEventListener('click', () => {
      this.hide();
      this.engine.start();
    });

    const repeatMistakesBtn = document.createElement('button');
    repeatMistakesBtn.type = 'button';
    repeatMistakesBtn.className = 'tl-btn-secondary';
    repeatMistakesBtn.textContent = t('quiz.reviewErrors');
    repeatMistakesBtn.addEventListener('click', () => {
      this.hide();
      this.engine.repeatMistakes();
    });

    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'tl-btn-tertiary';
    exitBtn.textContent = t('quiz.backToMap');
    exitBtn.addEventListener('click', () => {
      this.hide();
      this.engine.stop();
    });

    actions.appendChild(playAgainBtn);
    actions.appendChild(repeatMistakesBtn);
    actions.appendChild(exitBtn);
    card.appendChild(actions);

    this.element.appendChild(card);
  }

  public hide(): void {
    this.element.classList.add('hidden');
    this.element.innerHTML = '';
  }

  public destroy(): void {
    this.element.remove();
  }
}
