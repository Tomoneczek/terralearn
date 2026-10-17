import { describe, it, expect } from 'vitest';
import {
  generateDistractors,
  generateQuizQuestions,
  getAutocompleteSuggestions,
  DEFAULT_QUESTIONS_POOL,
} from '@/quiz/questions';

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
});
