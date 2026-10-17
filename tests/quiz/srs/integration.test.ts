import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, createInitialState } from '@/state/store';
import type { AppState } from '@/state/types';
import { QuizEngine } from '@/quiz/engine';
import { loadSrsState, clearSrsState } from '@/quiz/srs';
import { generateQuizQuestions } from '@/quiz/questions';
import type { QuizConfig, QuizQuestion } from '@/quiz/types';

describe('SRS Quiz Integration', () => {
  const customQuestions: QuizQuestion[] = [
    {
      id: 'PL',
      name_pl: 'Polska',
      name_en: 'Poland',
      kind: 'country',
      layerId: 'countriesTopN',
      targetLat: 52.0,
      targetLng: 19.0,
      category: 'countries',
      continent: 'europe',
    },
    {
      id: 'amazon',
      name_pl: 'Amazonka',
      name_en: 'Amazon River',
      kind: 'river',
      layerId: 'rivers',
      targetLat: -3.0,
      targetLng: -60.0,
      category: 'rivers',
      continent: 'south-america',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    clearSrsState();
  });

  it('automatically updates SRS records when answering in QuizEngine', () => {
    const store = createStore<AppState>(createInitialState());
    const engine = new QuizEngine(store);

    engine.start('classic', 2, customQuestions);

    // Answer Q1 (Polska) with perfect hit -> correct (dist = 0 <= 200km)
    engine.handleGlobeClick(52.0, 19.0);

    const srsState1 = loadSrsState();
    expect(srsState1['PL']).toBeDefined();
    expect(srsState1['PL']?.box).toBe(2);
    expect(srsState1['PL']?.successCount).toBe(1);

    // Next to Q2 (Amazonka)
    engine.nextQuestion();

    // Answer Q2 with big error -> incorrect (target: -3, -60; click: 0, 0)
    engine.handleGlobeClick(0, 0);

    const srsState2 = loadSrsState();
    expect(srsState2['amazon']).toBeDefined();
    expect(srsState2['amazon']?.box).toBe(1); // Box 1 = due / mistake
    expect(srsState2['amazon']?.successCount).toBe(0);

    engine.destroy();
  });

  it('selects due items when srsFilter is set to due', () => {
    const store = createStore<AppState>(createInitialState());
    const engine = new QuizEngine(store);

    // Round 1: Polska answered correctly, Amazonka answered incorrectly
    engine.start('classic', 2, customQuestions);
    engine.handleGlobeClick(52.0, 19.0);
    engine.nextQuestion();
    engine.handleGlobeClick(0, 0); // mistake -> amazon is in Box 1 (due)
    engine.destroy();

    // Now start a new session with srsFilter: 'due'
    const srsDueConfig: QuizConfig = {
      mode: 'classic',
      category: 'all',
      continent: 'all',
      difficulty: 'hard',
      questionCount: 4,
      srsFilter: 'due',
    };

    const questions = generateQuizQuestions(undefined, 4, 123, 'classic', srsDueConfig);
    expect(questions.length).toBeGreaterThanOrEqual(1);
    // Amazonka was due, so it should be prioritized in the filtered set
    const ids = questions.map(q => q.id);
    expect(ids).toContain('amazon');
  });

  it('updates SRS records on reverse quiz mode answers', () => {
    const store = createStore<AppState>(createInitialState());
    const engine = new QuizEngine(store);

    const reverseQuestions: QuizQuestion[] = [
      {
        ...customQuestions[0]!,
        options: ['Polska', 'Niemcy', 'Francja', 'Włochy'],
      },
    ];

    engine.start('reverse', 1, reverseQuestions);

    // Answer correctly
    engine.handleSelectAnswer('Polska');

    const srs = loadSrsState();
    expect(srs['PL']?.box).toBe(2);
    expect(srs['PL']?.successCount).toBe(1);

    engine.destroy();
  });
});
