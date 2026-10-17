import type { Store, AppState } from '@/state/types';
import type {
  QuizQuestion,
  QuizAnswer,
  QuizState,
  QuizRoundSummary,
  QuizMode,
  QuizConfig,
} from './types';
import { generateQuizQuestions } from './questions';
import { haversineDistanceKm } from '@/geo/spherical';
import { calculatePoints, calculateReversePoints } from './scoring';

export interface QuizEngineListeners {
  onStateChange?: (state: QuizState) => void;
  onQuestion?: (
    q: QuizQuestion,
    index: number,
    total: number,
    currentPoints: number,
    mode: QuizMode,
  ) => void;
  onFeedback?: (answer: QuizAnswer) => void;
  onFinish?: (summary: QuizRoundSummary) => void;
  onStop?: () => void;
  onCameraFlyTo?: (lat: number, lng: number, altitude?: number) => void;
}

export class QuizEngine {
  private readonly store: Store<AppState>;
  private readonly listeners: QuizEngineListeners;

  private state: QuizState = 'idle';
  private mode: QuizMode = 'classic';
  private config: QuizConfig | null = null;
  private questions: QuizQuestion[] = [];
  private answers: QuizAnswer[] = [];
  private currentIndex = 0;

  private snapshotLayers: AppState['layers'] | null = null;
  private snapshotHiddenLabels: boolean | null = null;
  private snapshotMode: AppState['mode'] | null = null;
  private unsubscribeClick: (() => void) | null = null;

  constructor(store: Store<AppState>, listeners: QuizEngineListeners = {}) {
    this.store = store;
    this.listeners = listeners;
    this.bindClick();
  }

  private bindClick(): void {
    this.unsubscribeClick = this.store.subscribe(
      s => s.globeClick,
      coords => {
        if (coords && this.state === 'question' && this.mode === 'classic') {
          this.handleGlobeClick(coords.lat, coords.lng);
        }
      },
    );
  }

  /**
   * Starts a quiz session with a specific configuration.
   */
  public startWithConfig(config: QuizConfig, customQuestions?: QuizQuestion[]): void {
    this.config = { ...config };
    this.mode = config.mode;

    // 1. Snapshot previous settings
    const currentState = this.store.get();
    this.snapshotLayers = { ...currentState.layers };
    this.snapshotHiddenLabels = currentState.hiddenLabels;
    this.snapshotMode = currentState.mode;

    // 2. Hide labels on globe and switch to quiz mode
    this.store.set({
      ...currentState,
      mode: 'quiz',
      hiddenLabels: true,
      hideSelectionLabel: config.mode === 'reverse',
      selection: null,
      hovered: null,
    });

    // 3. Initialize questions & answers
    this.questions =
      customQuestions ??
      generateQuizQuestions(undefined, config.questionCount, undefined, config.mode, config);
    this.answers = [];
    this.currentIndex = 0;

    this.setState('question');
    this.emitCurrentQuestion();
  }

  /**
   * Starts a quiz session. Supports overloaded signatures for backward compatibility.
   */
  public start(
    modeOrCountOrConfig: QuizMode | number | QuizConfig = 'classic',
    countOrCustom?: number | QuizQuestion[],
    customQuestions?: QuizQuestion[],
  ): void {
    if (typeof modeOrCountOrConfig === 'object' && modeOrCountOrConfig !== null) {
      this.startWithConfig(modeOrCountOrConfig, customQuestions);
      return;
    }

    let mode: QuizMode = 'classic';
    let count = 10;
    let custom: QuizQuestion[] | undefined;

    if (typeof modeOrCountOrConfig === 'number') {
      mode = 'classic';
      count = modeOrCountOrConfig;
      if (Array.isArray(countOrCustom)) {
        custom = countOrCustom;
      }
    } else {
      mode = modeOrCountOrConfig;
      if (typeof countOrCustom === 'number') {
        count = countOrCustom;
      }
      custom = customQuestions;
    }

    const config: QuizConfig = {
      mode,
      category: 'all',
      continent: 'all',
      difficulty: 'hard',
      questionCount: count,
    };

    this.startWithConfig(config, custom);
  }

  public handleGlobeClick(lat: number, lng: number): void {
    if (this.state !== 'question' || this.mode !== 'classic') return;

    const currentQ = this.questions[this.currentIndex];
    if (!currentQ) return;

    const dist = haversineDistanceKm(lat, lng, currentQ.targetLat, currentQ.targetLng);
    const points = calculatePoints(dist);

    const answer: QuizAnswer = {
      question: currentQ,
      mode: 'classic',
      clickLat: lat,
      clickLng: lng,
      distanceKm: dist,
      points,
    };
    this.answers.push(answer);

    this.setState('feedback');
    this.listeners.onFeedback?.(answer);
  }

  public handleSelectAnswer(selectedAnswer: string): void {
    if (this.state !== 'question' || this.mode !== 'reverse') return;

    const currentQ = this.questions[this.currentIndex];
    if (!currentQ) return;

    const normalizedSelected = selectedAnswer.trim().toLowerCase();
    const normalizedPl = currentQ.name_pl.trim().toLowerCase();
    const normalizedEn = currentQ.name_en.trim().toLowerCase();

    const isCorrect =
      normalizedSelected === normalizedPl ||
      normalizedSelected === normalizedEn ||
      (currentQ.name_pl.includes('(') &&
        normalizedSelected === currentQ.name_pl.split('(')[0]?.trim().toLowerCase());

    const points = calculateReversePoints(isCorrect);

    const answer: QuizAnswer = {
      question: currentQ,
      mode: 'reverse',
      selectedAnswer,
      isCorrect,
      points,
    };
    this.answers.push(answer);

    // In feedback phase, reveal label so user sees the verified name
    this.store.set({ hideSelectionLabel: false });

    this.setState('feedback');
    this.listeners.onFeedback?.(answer);
  }

  public nextQuestion(): void {
    if (this.state !== 'feedback') return;

    if (this.currentIndex + 1 < this.questions.length) {
      this.currentIndex++;
      this.setState('question');
      this.emitCurrentQuestion();
    } else {
      this.finishRound();
    }
  }

  public repeatMistakes(): void {
    const isReverse = this.mode === 'reverse';
    const mistakes = isReverse
      ? this.answers.filter(a => !a.isCorrect).map(a => a.question)
      : this.answers.filter(a => (a.distanceKm ?? 0) > 200).map(a => a.question);

    if (mistakes.length > 0) {
      if (this.config) {
        this.startWithConfig({ ...this.config, questionCount: mistakes.length }, mistakes);
      } else {
        this.start(this.mode, mistakes.length, mistakes);
      }
    } else {
      if (this.config) {
        this.startWithConfig(this.config);
      } else {
        this.start(this.mode);
      }
    }
  }

  private finishRound(): void {
    this.setState('finished');
    const totalPoints = this.answers.reduce((acc, a) => acc + a.points, 0);

    let summary: QuizRoundSummary;

    if (this.mode === 'reverse') {
      const correctCount = this.answers.filter(a => a.isCorrect).length;
      summary = {
        mode: 'reverse',
        config: this.config ? { ...this.config } : undefined,
        totalPoints,
        maxPoints: this.questions.length * 1000,
        correctCount,
        totalQuestions: this.questions.length,
        answers: [...this.answers],
      };
    } else {
      const avgDistance =
        this.answers.length > 0
          ? Math.round(
              this.answers.reduce((acc, a) => acc + (a.distanceKm ?? 0), 0) / this.answers.length,
            )
          : 0;

      summary = {
        mode: 'classic',
        config: this.config ? { ...this.config } : undefined,
        totalPoints,
        maxPoints: this.questions.length * 1200,
        avgDistanceKm: avgDistance,
        totalQuestions: this.questions.length,
        answers: [...this.answers],
      };
    }

    this.listeners.onFinish?.(summary);
  }

  public stop(): void {
    if (this.snapshotLayers) {
      this.store.set({
        ...this.store.get(),
        layers: this.snapshotLayers,
        hiddenLabels: this.snapshotHiddenLabels ?? false,
        hideSelectionLabel: false,
        mode: this.snapshotMode ?? 'explore',
        selection: null,
      });
      this.snapshotLayers = null;
      this.snapshotHiddenLabels = null;
      this.snapshotMode = null;
    } else {
      this.store.set({
        hideSelectionLabel: false,
        mode: 'explore',
        selection: null,
      });
    }

    this.setState('idle');
    this.questions = [];
    this.answers = [];
    this.currentIndex = 0;
    this.listeners.onStop?.();
  }

  private setState(state: QuizState): void {
    this.state = state;
    this.listeners.onStateChange?.(state);
  }

  private emitCurrentQuestion(): void {
    const q = this.questions[this.currentIndex];
    if (q) {
      if (this.mode === 'reverse') {
        // Hide selection label so answer is not spoiled on globe
        this.store.set({
          hideSelectionLabel: true,
          selection: {
            id: q.id,
            layerId: q.layerId,
            kind: q.kind,
            name_pl: q.name_pl,
            name_en: q.name_en,
            lat: q.targetLat,
            lng: q.targetLng,
          },
        });

        // Trigger camera fly-to
        this.listeners.onCameraFlyTo?.(q.targetLat, q.targetLng, q.altitude ?? 1.2);
      }

      const currentPoints = this.answers.reduce((acc, a) => acc + a.points, 0);
      this.listeners.onQuestion?.(
        q,
        this.currentIndex,
        this.questions.length,
        currentPoints,
        this.mode,
      );
    }
  }

  public getState(): QuizState {
    return this.state;
  }

  public getMode(): QuizMode {
    return this.mode;
  }

  public getCurrentQuestion(): QuizQuestion | undefined {
    return this.questions[this.currentIndex];
  }

  public getAnswers(): readonly QuizAnswer[] {
    return this.answers;
  }

  public getConfig(): QuizConfig | null {
    return this.config ? { ...this.config } : null;
  }

  public destroy(): void {
    this.stop();
    if (this.unsubscribeClick) {
      this.unsubscribeClick();
      this.unsubscribeClick = null;
    }
  }
}
