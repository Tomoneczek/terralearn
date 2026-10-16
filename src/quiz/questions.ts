import type { QuizQuestion } from './types';
import { DEFAULT_QUESTIONS_POOL } from '@/i18n/quiz-questions';

export { DEFAULT_QUESTIONS_POOL };

export function generateQuizQuestions(
  pool: readonly QuizQuestion[] = DEFAULT_QUESTIONS_POOL,
  count = 10,
  seed?: number,
): QuizQuestion[] {
  const shuffled = [...pool];

  // Pseudo-random shuffle if seed is provided, otherwise standard Math.random
  let currentSeed = seed ?? 12345;
  const random =
    seed !== undefined
      ? () => {
          currentSeed = (currentSeed * 9301 + 49297) % 233280;
          return currentSeed / 233280;
        }
      : Math.random;

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
}
