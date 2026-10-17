import { describe, it, expect } from 'vitest';
import {
  generateDistractors,
  generateQuizQuestions,
  getAutocompleteSuggestions,
  filterQuizQuestions,
  countMatchingQuestions,
  DEFAULT_QUESTIONS_POOL,
} from '@/quiz/questions';
import type { QuizConfig } from '@/quiz/types';

describe('Quiz Questions & Distractor Generator', () => {
  it('generates 3 distinct distractors plus correct answer for reverse mode', () => {
    const question = DEFAULT_QUESTIONS_POOL.find(q => q.id === 'nile')!;
    const { options, options_en } = generateDistractors(
      question,
      DEFAULT_QUESTIONS_POOL,
      () => 0.5,
    );

    expect(options.length).toBe(4);
    expect(options_en.length).toBe(4);
    expect(options).toContain(question.name_pl);
    expect(options_en).toContain(question.name_en);

    // Ensure all 4 options are unique
    const uniquePl = new Set(options);
    expect(uniquePl.size).toBe(4);
  });

  it('generates reverse questions with attached options and options_en', () => {
    const questions = generateQuizQuestions(DEFAULT_QUESTIONS_POOL, 5, 42, 'reverse');

    expect(questions.length).toBe(5);
    for (const q of questions) {
      expect(q.options).toBeDefined();
      expect(q.options?.length).toBe(4);
      expect(q.options).toContain(q.name_pl);
      expect(q.options_en?.length).toBe(4);
      expect(q.options_en).toContain(q.name_en);
    }
  });

  it('returns sorted unique autocomplete suggestions', () => {
    const suggestionsPl = getAutocompleteSuggestions(DEFAULT_QUESTIONS_POOL, 'pl');
    expect(suggestionsPl.length).toBeGreaterThan(10);
    expect(suggestionsPl).toContain('Polska');
    expect(suggestionsPl).toContain('Amazonka');

    // Verify alphabetical ordering
    const sorted = [...suggestionsPl].sort((a, b) => a.localeCompare(b));
    expect(suggestionsPl).toEqual(sorted);
  });

  it('filters questions by category, continent, and difficulty', () => {
    // 1. Filter by category
    const rivers = filterQuizQuestions(
      DEFAULT_QUESTIONS_POOL,
      {
        category: 'rivers',
        continent: 'all',
        difficulty: 'hard',
      },
      false,
    );
    expect(rivers.length).toBeGreaterThan(0);
    for (const r of rivers) {
      expect(r.category === 'rivers' || r.kind === 'river').toBe(true);
    }

    // 2. Filter by continent
    const europeQuestions = filterQuizQuestions(
      DEFAULT_QUESTIONS_POOL,
      {
        category: 'all',
        continent: 'europe',
        difficulty: 'hard',
      },
      false,
    );
    expect(europeQuestions.length).toBeGreaterThan(0);
    for (const q of europeQuestions) {
      expect(q.continent).toBe('europe');
    }

    // 3. Filter by difficulty
    const easyQuestions = filterQuizQuestions(
      DEFAULT_QUESTIONS_POOL,
      {
        category: 'all',
        continent: 'all',
        difficulty: 'easy',
      },
      false,
    );
    expect(easyQuestions.length).toBeGreaterThan(0);
    for (const q of easyQuestions) {
      expect(q.rank ?? 999).toBeLessThanOrEqual(10);
    }
  });

  it('returns exact count with countMatchingQuestions without fallback', () => {
    const countRivers = countMatchingQuestions(DEFAULT_QUESTIONS_POOL, {
      category: 'rivers',
      continent: 'all',
      difficulty: 'hard',
    });
    expect(countRivers).toBeGreaterThan(5);

    // Impossible or empty filter
    const countEmpty = countMatchingQuestions(DEFAULT_QUESTIONS_POOL, {
      category: 'deserts',
      continent: 'europe',
      difficulty: 'easy',
    });
    expect(countEmpty).toBe(0);
  });

  it('gracefully falls back when filter yields fewer than 4 items', () => {
    // There are 0 deserts in Europe with easy difficulty
    const fallbackResults = filterQuizQuestions(
      DEFAULT_QUESTIONS_POOL,
      {
        category: 'deserts',
        continent: 'europe',
        difficulty: 'easy',
      },
      true,
    );

    // Fallback guarantees at least 4 playable questions
    expect(fallbackResults.length).toBeGreaterThanOrEqual(4);
  });

  it('generates quiz questions strictly matching the given config', () => {
    const config: QuizConfig = {
      mode: 'classic',
      category: 'countries',
      continent: 'europe',
      difficulty: 'hard',
      questionCount: 4,
    };

    const questions = generateQuizQuestions(DEFAULT_QUESTIONS_POOL, 4, 123, 'classic', config);
    expect(questions.length).toBe(4);
    for (const q of questions) {
      expect(q.category === 'countries' || q.kind === 'country').toBe(true);
      expect(q.continent).toBe('europe');
    }
  });
});
