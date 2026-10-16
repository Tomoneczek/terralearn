import type { Store, AppState } from '@/state/types';
import type { QuizQuestion, QuizAnswer, QuizState, QuizRoundSummary } from './types';
import { generateQuizQuestions } from './questions';
import { haversineDistanceKm } from '@/geo/spherical';
import { calculatePoints } from './scoring';

export interface QuizEngineListeners {
  onStateChange?: (state: QuizState) => void;
  onQuestion?: (q: QuizQuestion, index: number, total: number, currentPoints: number) => void;
  onFeedback?: (answer: QuizAnswer) => void;
  onFinish?: (summary: QuizRoundSummary) => void;
  onStop?: () => void;
}

export class QuizEngine {
  private readonly store: Store<AppState>;
  private readonly listeners: QuizEngineListeners;

  private state: QuizState = 'idle';
  private questions: QuizQuestion[] = [];
  private answers: QuizAnswer[] = [];
  private currentIndex = 0;

  private snapshotLayers: AppState['layers'] | null = null;
  private snapshotHiddenLabels: boolean | null = null;
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
        if (coords && this.state === 'question') {
          this.handleGlobeClick(coords.lat, coords.lng);
        }
      },
    );
  }

  public start(questionsCount = 10, customQuestions?: QuizQuestion[]): void {
    // 1. Snapshot previous settings
    const currentState = this.store.get();
    this.snapshotLayers = { ...currentState.layers };
    this.snapshotHiddenLabels = currentState.hiddenLabels;

    // 2. Hide labels on globe for blind map challenge
    this.store.set({
      ...currentState,
      hiddenLabels: true,
      selection: null,
      hovered: null,
    });

    // 3. Initialize questions & answers
    this.questions = customQuestions ?? generateQuizQuestions(undefined, questionsCount);
    this.answers = [];
    this.currentIndex = 0;

    this.setState('question');
    this.emitCurrentQuestion();
  }

  public handleGlobeClick(lat: number, lng: number): void {
    if (this.state !== 'question') return;

    const currentQ = this.questions[this.currentIndex];
    if (!currentQ) return;

    const dist = haversineDistanceKm(lat, lng, currentQ.targetLat, currentQ.targetLng);
    const points = calculatePoints(dist);

    const answer: QuizAnswer = {
      question: currentQ,
      clickLat: lat,
      clickLng: lng,
      distanceKm: dist,
      points,
    };
    this.answers.push(answer);

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
    const mistakes = this.answers.filter(a => a.distanceKm > 200).map(a => a.question);

    if (mistakes.length > 0) {
      this.start(mistakes.length, mistakes);
    } else {
      this.start();
    }
  }

  private finishRound(): void {
    this.setState('finished');
    const totalPoints = this.answers.reduce((acc, a) => acc + a.points, 0);
    const avgDistance =
      this.answers.length > 0
        ? Math.round(this.answers.reduce((acc, a) => acc + a.distanceKm, 0) / this.answers.length)
        : 0;

    const summary: QuizRoundSummary = {
      totalPoints,
      maxPoints: this.questions.length * 1200,
      avgDistanceKm: avgDistance,
      answers: [...this.answers],
    };

    this.listeners.onFinish?.(summary);
  }

  public stop(): void {
    if (this.snapshotLayers) {
      this.store.set({
        ...this.store.get(),
        layers: this.snapshotLayers,
        hiddenLabels: this.snapshotHiddenLabels ?? false,
      });
      this.snapshotLayers = null;
      this.snapshotHiddenLabels = null;
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
      const currentPoints = this.answers.reduce((acc, a) => acc + a.points, 0);
      this.listeners.onQuestion?.(q, this.currentIndex, this.questions.length, currentPoints);
    }
  }

  public getState(): QuizState {
    return this.state;
  }

  public getCurrentQuestion(): QuizQuestion | undefined {
    return this.questions[this.currentIndex];
  }

  public getAnswers(): readonly QuizAnswer[] {
    return this.answers;
  }

  public destroy(): void {
    this.stop();
    if (this.unsubscribeClick) {
      this.unsubscribeClick();
      this.unsubscribeClick = null;
    }
  }
}
