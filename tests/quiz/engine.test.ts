import { describe, it, expect, vi } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { QuizEngine } from '@/quiz/engine';
import type { QuizQuestion, QuizRoundSummary } from '@/quiz/types';

describe('QuizEngine', () => {
  const customQuestions: QuizQuestion[] = [
    {
      id: 'PL',
      name_pl: 'Polska',
      name_en: 'Poland',
      kind: 'country',
      layerId: 'countriesTopN',
      targetLat: 52.0,
      targetLng: 19.0,
    },
    {
      id: 'lake-victoria',
      name_pl: 'Jezioro Wiktorii',
      name_en: 'Lake Victoria',
      kind: 'lake',
      layerId: 'lakes',
      targetLat: -1.0,
      targetLng: 33.0,
    },
  ];

  it('starts in idle state and transitions to question state hiding labels', () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      hiddenLabels: false,
    });

    const onStateChange = vi.fn();
    const onQuestion = vi.fn();
    const engine = new QuizEngine(store, { onStateChange, onQuestion });

    expect(engine.getState()).toBe('idle');

    engine.start(2, customQuestions);

    expect(engine.getState()).toBe('question');
    expect(store.get().hiddenLabels).toBe(true);
    expect(onQuestion).toHaveBeenCalledWith(customQuestions[0], 0, 2, 0, 'classic');

    engine.destroy();
  });

  it('handles globe click answering the question and emits feedback', () => {
    const store = createStore<AppState>(createInitialState());
    const onFeedback = vi.fn();
    const engine = new QuizEngine(store, { onFeedback });

    engine.start(2, customQuestions);

    // Target is [52.0, 19.0]. Simulate clicking [52.0, 19.0] (perfect hit)
    store.set({
      ...store.get(),
      globeClick: { lat: 52.0, lng: 19.0 },
    });

    expect(engine.getState()).toBe('feedback');
    expect(onFeedback).toHaveBeenCalledTimes(1);
    const answer = engine.getAnswers()[0];
    expect(answer?.distanceKm).toBe(0);
    expect(answer?.points).toBe(1200);

    engine.destroy();
  });

  it('advances through questions and triggers finish round with summary', () => {
    const store = createStore<AppState>(createInitialState());
    let roundSummary: QuizRoundSummary | null = null;
    const engine = new QuizEngine(store, {
      onFinish: summary => {
        roundSummary = summary;
      },
    });

    engine.start(2, customQuestions);

    // Answer Q1 (Polska) with perfect hit
    engine.handleGlobeClick(52.0, 19.0);
    expect(engine.getState()).toBe('feedback');

    // Next to Q2 (Jezioro Wiktorii)
    engine.nextQuestion();
    expect(engine.getState()).toBe('question');
    expect(engine.getCurrentQuestion()?.id).toBe('lake-victoria');

    // Answer Q2 with ~200 km error (target: -1.0, 33.0)
    engine.handleGlobeClick(-2.8, 33.0);
    expect(engine.getState()).toBe('feedback');

    // Finish round
    engine.nextQuestion();
    expect(engine.getState()).toBe('finished');
    expect(roundSummary).not.toBeNull();
    const summary = roundSummary as unknown as QuizRoundSummary;
    expect(summary.answers.length).toBe(2);
    expect(summary.totalPoints).toBeGreaterThan(1200);

    engine.destroy();
  });

  it('stopping the quiz restores previous layers and hiddenLabels state', () => {
    const store = createStore<AppState>({
      ...createInitialState(),
      hiddenLabels: false,
      layers: {
        ...createInitialState().layers,
        mountains: { enabled: true, topN: 15 },
        rivers: { enabled: false },
      },
    });

    const engine = new QuizEngine(store);
    engine.start(2, customQuestions);

    expect(store.get().hiddenLabels).toBe(true);

    engine.stop();

    expect(engine.getState()).toBe('idle');
    expect(store.get().hiddenLabels).toBe(false);
    expect(store.get().layers.mountains.enabled).toBe(true);
    expect(store.get().layers.rivers.enabled).toBe(false);

    engine.destroy();
  });

  it('runs reverse quiz mode with camera flyTo and halo selection', () => {
    const store = createStore<AppState>(createInitialState());
    const onCameraFlyTo = vi.fn();
    const onFeedback = vi.fn();
    let roundSummary: QuizRoundSummary | null = null;

    const engine = new QuizEngine(store, {
      onCameraFlyTo,
      onFeedback,
      onFinish: summary => {
        roundSummary = summary;
      },
    });

    const reverseQuestions: QuizQuestion[] = [
      {
        ...customQuestions[0]!,
        options: ['Polska', 'Niemcy', 'Czechy', 'Francja'],
        altitude: 1.2,
      },
      {
        ...customQuestions[1]!,
        options: ['Jezioro Wiktorii', 'Bajkał', 'Tanganika', 'Huron'],
        altitude: 1.0,
      },
    ];

    engine.start('reverse', 2, reverseQuestions);

    expect(engine.getState()).toBe('question');
    expect(engine.getMode()).toBe('reverse');
    expect(store.get().mode).toBe('quiz');
    expect(store.get().hiddenLabels).toBe(true);
    expect(store.get().hideSelectionLabel).toBe(true);
    expect(store.get().selection?.id).toBe('PL');
    expect(onCameraFlyTo).toHaveBeenCalledWith(52.0, 19.0, 1.2);

    // Answer Q1 correctly
    engine.handleSelectAnswer('Polska');
    expect(engine.getState()).toBe('feedback');
    expect(store.get().hideSelectionLabel).toBe(false); // revealed in feedback
    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(engine.getAnswers()[0]?.isCorrect).toBe(true);
    expect(engine.getAnswers()[0]?.points).toBe(1000);

    // Move to Q2
    engine.nextQuestion();
    expect(engine.getState()).toBe('question');
    expect(store.get().hideSelectionLabel).toBe(true);
    expect(store.get().selection?.id).toBe('lake-victoria');
    expect(onCameraFlyTo).toHaveBeenCalledWith(-1.0, 33.0, 1.0);

    // Answer Q2 incorrectly
    engine.handleSelectAnswer('Bajkał');
    expect(engine.getState()).toBe('feedback');
    expect(engine.getAnswers()[1]?.isCorrect).toBe(false);
    expect(engine.getAnswers()[1]?.points).toBe(0);

    // Finish round
    engine.nextQuestion();
    expect(engine.getState()).toBe('finished');
    expect(roundSummary).not.toBeNull();
    const summary = roundSummary as unknown as QuizRoundSummary;
    expect(summary.mode).toBe('reverse');
    expect(summary.totalPoints).toBe(1000);
    expect(summary.correctCount).toBe(1);
    expect(summary.totalQuestions).toBe(2);

    // Repeat mistakes: should only repeat Q2 (lake-victoria)
    engine.repeatMistakes();
    expect(engine.getState()).toBe('question');
    expect(engine.getCurrentQuestion()?.id).toBe('lake-victoria');

    engine.destroy();
  });

  it('supports startWithConfig and carries config through to summary', () => {
    const store = createStore<AppState>(createInitialState());
    let finishedSummary: QuizRoundSummary | null = null;
    const engine = new QuizEngine(store, {
      onFinish: s => {
        finishedSummary = s;
      },
    });

    const config = {
      mode: 'classic' as const,
      category: 'rivers' as const,
      continent: 'europe' as const,
      difficulty: 'hard' as const,
      questionCount: 2,
    };

    engine.startWithConfig(config, customQuestions);
    expect(engine.getState()).toBe('question');
    expect(engine.getConfig()).toEqual(config);

    // Answer Q1
    engine.handleGlobeClick(52.0, 19.0);
    engine.nextQuestion();

    // Answer Q2
    engine.handleGlobeClick(-1.0, 33.0);
    engine.nextQuestion();

    expect(engine.getState()).toBe('finished');
    expect(finishedSummary).not.toBeNull();
    expect((finishedSummary as unknown as QuizRoundSummary).config).toEqual(config);

    engine.destroy();
  });
});
