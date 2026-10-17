import type {
  QuizConfig,
  QuizMode,
  QuizCategory,
  ContinentId,
  QuizDifficulty,
  SrsFilter,
} from '@/quiz/types';
import { countMatchingQuestions } from '@/quiz/questions';
import { loadLastQuizConfig, saveLastQuizConfig, DEFAULT_QUIZ_CONFIG } from '@/quiz/persistence';
import { parseSvg } from '../dom';
import { t } from '@/i18n';

export interface QuizConfigModalOptions {
  container: HTMLElement;
  onStart: (config: QuizConfig) => void;
  onCancel?: () => void;
}

export class QuizConfigModal {
  public readonly element: HTMLElement;
  private readonly options: QuizConfigModalOptions;
  private currentConfig: QuizConfig;
  private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor(options: QuizConfigModalOptions) {
    this.options = options;
    this.currentConfig = { ...DEFAULT_QUIZ_CONFIG };

    this.element = document.createElement('div');
    this.element.className = 'tl-quiz-modal-backdrop hidden';
    options.container.appendChild(this.element);
  }

  public show(initialConfig?: Partial<QuizConfig>): void {
    const persisted = loadLastQuizConfig();
    this.currentConfig = {
      ...persisted,
      ...initialConfig,
    };

    this.render();
    this.element.classList.remove('hidden');

    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.handleCancel();
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);
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

  private handleStart(): void {
    saveLastQuizConfig(this.currentConfig);
    const configToStart = { ...this.currentConfig };
    this.hide();
    this.options.onStart(configToStart);
  }

  private render(): void {
    this.element.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'tl-quiz-config-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', t('quiz.configTitle'));

    // 1. Header
    const header = document.createElement('div');
    header.className = 'tl-quiz-config-header';

    const titleBox = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'tl-quiz-config-title';
    title.textContent = t('quiz.configTitle');

    const subtitle = document.createElement('p');
    subtitle.className = 'tl-quiz-config-subtitle';
    subtitle.textContent = t('quiz.configSubtitle');

    titleBox.appendChild(title);
    titleBox.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tl-quiz-close';
    closeBtn.setAttribute('aria-label', t('quiz.cancel'));
    closeBtn.appendChild(
      parseSvg(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      ),
    );
    closeBtn.addEventListener('click', () => this.handleCancel());

    header.appendChild(titleBox);
    header.appendChild(closeBtn);
    card.appendChild(header);

    // 2. Mode Selector (Segmented buttons)
    const modeSection = document.createElement('div');
    modeSection.className = 'tl-quiz-config-section';

    const modeLabel = document.createElement('label');
    modeLabel.className = 'tl-quiz-config-label';
    modeLabel.textContent = t('quiz.selectMode');
    modeSection.appendChild(modeLabel);

    const modeGroup = document.createElement('div');
    modeGroup.className = 'tl-quiz-mode-group';

    const modes: { id: QuizMode; label: string; iconSvg: string }[] = [
      {
        id: 'classic',
        label: t('quiz.modeClassic'),
        iconSvg:
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
      },
      {
        id: 'reverse',
        label: t('quiz.modeReverse'),
        iconSvg:
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
      },
    ];

    for (const m of modes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tl-quiz-mode-btn ${this.currentConfig.mode === m.id ? 'active' : ''}`;
      btn.appendChild(parseSvg(m.iconSvg));
      const textSpan = document.createElement('span');
      textSpan.textContent = m.label;
      btn.appendChild(textSpan);
      btn.addEventListener('click', () => {
        this.currentConfig.mode = m.id;
        this.render();
      });
      modeGroup.appendChild(btn);
    }
    modeSection.appendChild(modeGroup);
    card.appendChild(modeSection);

    // 3. Dropdowns Grid: Continent & Category
    const grid = document.createElement('div');
    grid.className = 'tl-quiz-config-grid';

    // Continent Selector
    const contBox = document.createElement('div');
    contBox.className = 'tl-quiz-config-field';

    const contLabel = document.createElement('label');
    contLabel.className = 'tl-quiz-config-label';
    contLabel.htmlFor = 'quiz-continent-select';
    contLabel.textContent = t('quiz.selectContinent');

    const contSelect = document.createElement('select');
    contSelect.id = 'quiz-continent-select';
    contSelect.className = 'tl-quiz-config-select';

    const continents: { id: ContinentId; label: string }[] = [
      { id: 'all', label: t('quiz.continents.all') },
      { id: 'europe', label: t('quiz.continents.europe') },
      { id: 'asia', label: t('quiz.continents.asia') },
      { id: 'africa', label: t('quiz.continents.africa') },
      { id: 'north-america', label: t('quiz.continents.northAmerica') },
      { id: 'south-america', label: t('quiz.continents.southAmerica') },
      { id: 'oceania', label: t('quiz.continents.oceania') },
    ];

    for (const c of continents) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      if (this.currentConfig.continent === c.id) {
        opt.selected = true;
      }
      contSelect.appendChild(opt);
    }

    contSelect.addEventListener('change', () => {
      this.currentConfig.continent = contSelect.value as ContinentId;
      this.updateMatchingCount(countBadge);
    });

    contBox.appendChild(contLabel);
    contBox.appendChild(contSelect);
    grid.appendChild(contBox);

    // Category Selector
    const catBox = document.createElement('div');
    catBox.className = 'tl-quiz-config-field';

    const catLabel = document.createElement('label');
    catLabel.className = 'tl-quiz-config-label';
    catLabel.htmlFor = 'quiz-category-select';
    catLabel.textContent = t('quiz.selectCategory');

    const catSelect = document.createElement('select');
    catSelect.id = 'quiz-category-select';
    catSelect.className = 'tl-quiz-config-select';

    const categories: { id: QuizCategory; label: string }[] = [
      { id: 'all', label: t('quiz.categoryOptions.all') },
      { id: 'countries', label: t('quiz.categoryOptions.countries') },
      { id: 'capitals', label: t('quiz.categoryOptions.capitals') },
      { id: 'rivers', label: t('quiz.categoryOptions.rivers') },
      { id: 'lakes', label: t('quiz.categoryOptions.lakes') },
      { id: 'mountains', label: t('quiz.categoryOptions.mountains') },
      { id: 'peaks', label: t('quiz.categoryOptions.peaks') },
      { id: 'deserts', label: t('quiz.categoryOptions.deserts') },
      { id: 'marine', label: t('quiz.categoryOptions.marine') },
      { id: 'landforms', label: t('quiz.categoryOptions.landforms') },
    ];

    for (const cat of categories) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      if (this.currentConfig.category === cat.id) {
        opt.selected = true;
      }
      catSelect.appendChild(opt);
    }

    catSelect.addEventListener('change', () => {
      this.currentConfig.category = catSelect.value as QuizCategory;
      this.updateMatchingCount(countBadge);
    });

    catBox.appendChild(catLabel);
    catBox.appendChild(catSelect);
    grid.appendChild(catBox);

    card.appendChild(grid);

    // 4. Difficulty Selector (Segmented buttons)
    const diffSection = document.createElement('div');
    diffSection.className = 'tl-quiz-config-section';

    const diffLabel = document.createElement('label');
    diffLabel.className = 'tl-quiz-config-label';
    diffLabel.textContent = t('quiz.selectDifficulty');
    diffSection.appendChild(diffLabel);

    const diffGroup = document.createElement('div');
    diffGroup.className = 'tl-quiz-pill-group';

    const difficulties: { id: QuizDifficulty; label: string }[] = [
      { id: 'easy', label: t('quiz.difficultyEasy') },
      { id: 'medium', label: t('quiz.difficultyMedium') },
      { id: 'hard', label: t('quiz.difficultyHard') },
    ];

    for (const d of difficulties) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tl-quiz-pill-btn ${this.currentConfig.difficulty === d.id ? 'active' : ''}`;
      btn.textContent = d.label;
      btn.addEventListener('click', () => {
        this.currentConfig.difficulty = d.id;
        diffGroup.querySelectorAll('.tl-quiz-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateMatchingCount(countBadge);
      });
      diffGroup.appendChild(btn);
    }
    diffSection.appendChild(diffGroup);
    card.appendChild(diffSection);

    // 5. SRS Repetition Selector (Pills)
    const srsSection = document.createElement('div');
    srsSection.className = 'tl-quiz-config-section';

    const srsLabel = document.createElement('label');
    srsLabel.className = 'tl-quiz-config-label';
    srsLabel.textContent = t('quiz.srsFilter');
    srsSection.appendChild(srsLabel);

    const srsGroup = document.createElement('div');
    srsGroup.className = 'tl-quiz-pill-group';

    const srsOptions: { id: SrsFilter; label: string }[] = [
      { id: 'none', label: t('quiz.srsFilterNone') },
      { id: 'due', label: t('quiz.srsFilterDue') },
      { id: 'difficult', label: t('quiz.srsFilterDifficult') },
    ];

    for (const opt of srsOptions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isSelected = (this.currentConfig.srsFilter ?? 'none') === opt.id;
      btn.className = `tl-quiz-pill-btn ${isSelected ? 'active' : ''}`;
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        this.currentConfig.srsFilter = opt.id;
        srsGroup.querySelectorAll('.tl-quiz-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateMatchingCount(countBadge);
      });
      srsGroup.appendChild(btn);
    }
    srsSection.appendChild(srsGroup);
    card.appendChild(srsSection);

    // 6. Question Count Selector (Pills)
    const countSection = document.createElement('div');
    countSection.className = 'tl-quiz-config-section';

    const countLabel = document.createElement('label');
    countLabel.className = 'tl-quiz-config-label';
    countLabel.textContent = t('quiz.selectQuestionCount');
    countSection.appendChild(countLabel);

    const countGroup = document.createElement('div');
    countGroup.className = 'tl-quiz-pill-group';

    const counts = [5, 10, 15];
    for (const c of counts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tl-quiz-pill-btn ${this.currentConfig.questionCount === c ? 'active' : ''}`;
      btn.textContent = `${c}`;
      btn.addEventListener('click', () => {
        this.currentConfig.questionCount = c;
        countGroup.querySelectorAll('.tl-quiz-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      countGroup.appendChild(btn);
    }
    countSection.appendChild(countGroup);
    card.appendChild(countSection);

    // 6. Matching count indicator badge
    const countBadge = document.createElement('div');
    countBadge.className = 'tl-quiz-count-badge';
    this.updateMatchingCount(countBadge);
    card.appendChild(countBadge);

    // 7. Action buttons
    const actions = document.createElement('div');
    actions.className = 'tl-quiz-config-actions';

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'tl-btn-primary';
    startBtn.id = 'btn-modal-start-quiz';
    startBtn.textContent = t('quiz.startQuiz');
    startBtn.addEventListener('click', () => this.handleStart());

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'tl-btn-secondary';
    cancelBtn.id = 'btn-modal-cancel-quiz';
    cancelBtn.textContent = t('quiz.cancel');
    cancelBtn.addEventListener('click', () => this.handleCancel());

    actions.appendChild(startBtn);
    actions.appendChild(cancelBtn);
    card.appendChild(actions);

    this.element.appendChild(card);
  }

  private updateMatchingCount(badge: HTMLElement): void {
    const count = countMatchingQuestions(undefined, this.currentConfig);
    badge.textContent = `${t('quiz.availableQuestions')} ${count}`;
  }

  public destroy(): void {
    if (this.handleKeyDown) {
      window.removeEventListener('keydown', this.handleKeyDown);
      this.handleKeyDown = null;
    }
    this.element.remove();
  }
}
