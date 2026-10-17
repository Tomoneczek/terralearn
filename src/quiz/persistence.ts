import { z } from 'zod';
import type { QuizConfig } from './types';

export const QUIZ_CONFIG_STORAGE_KEY = 'terralearn_quiz_config_v1';

export const QuizConfigSchema = z.object({
  mode: z.enum(['classic', 'reverse']),
  category: z.enum([
    'all',
    'countries',
    'capitals',
    'rivers',
    'lakes',
    'mountains',
    'peaks',
    'deserts',
    'marine',
    'landforms',
  ]),
  continent: z.enum([
    'all',
    'europe',
    'asia',
    'africa',
    'north-america',
    'south-america',
    'oceania',
  ]),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  questionCount: z.number().int().min(1).max(50),
  srsFilter: z.enum(['none', 'due', 'difficult']).optional(),
});

export const DEFAULT_QUIZ_CONFIG: QuizConfig = {
  mode: 'classic',
  category: 'all',
  continent: 'all',
  difficulty: 'medium',
  questionCount: 10,
  srsFilter: 'none',
};

/**
 * Loads the last chosen quiz configuration from localStorage, validated against Zod schema.
 */
export function loadLastQuizConfig(): QuizConfig {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_QUIZ_CONFIG;
  }
  try {
    const raw = window.localStorage.getItem(QUIZ_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_QUIZ_CONFIG;
    const parsed = JSON.parse(raw);
    const validated = QuizConfigSchema.safeParse(parsed);
    if (!validated.success) {
      return DEFAULT_QUIZ_CONFIG;
    }
    return validated.data;
  } catch {
    return DEFAULT_QUIZ_CONFIG;
  }
}

/**
 * Persists the chosen quiz configuration to localStorage.
 */
export function saveLastQuizConfig(config: QuizConfig): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(QUIZ_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore quota or private browsing errors
  }
}
