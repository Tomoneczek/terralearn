import type { QuizQuestion, QuizMode } from './types';
import { DEFAULT_QUESTIONS_POOL } from '@/i18n/quiz-questions';

export { DEFAULT_QUESTIONS_POOL };

/**
 * Creates a pseudo-random number generator if seed is provided, otherwise standard Math.random.
 */
function createRandom(seed?: number): () => number {
  if (seed === undefined) {
    return Math.random;
  }
  let currentSeed = seed;
  return () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };
}

/**
 * Shuffles an array in place with Fisher-Yates using the provided random function.
 */
function shuffleArray<T>(arr: T[], random: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }
  return arr;
}

/**
 * Generates 3 plausible distractors from the pool for a given question.
 * Prioritizes the same 'kind', falling back to the same 'layerId' or pool.
 */
export function generateDistractors(
  question: QuizQuestion,
  pool: readonly QuizQuestion[],
  random: () => number,
): { options: string[]; options_en: string[] } {
  // 1. Same kind first
  const sameKind = pool.filter(q => q.id !== question.id && q.kind === question.kind);
  shuffleArray(sameKind, random);

  const picked: QuizQuestion[] = [];
  picked.push(...sameKind.slice(0, 3));

  // 2. Same layer fallback if not enough
  if (picked.length < 3) {
    const sameLayer = pool.filter(
      q =>
        q.id !== question.id && q.layerId === question.layerId && !picked.some(p => p.id === q.id),
    );
    shuffleArray(sameLayer, random);
    picked.push(...sameLayer.slice(0, 3 - picked.length));
  }

  // 3. Any fallback if still not enough
  if (picked.length < 3) {
    const remaining = pool.filter(q => q.id !== question.id && !picked.some(p => p.id === q.id));
    shuffleArray(remaining, random);
    picked.push(...remaining.slice(0, 3 - picked.length));
  }

  // 4. Combine with the correct answer
  const rawPl = [question.name_pl, ...picked.map(p => p.name_pl)];
  const rawEn = [question.name_en, ...picked.map(p => p.name_en)];

  // Shuffle indices 0..3 identically
  const indices = [0, 1, 2, 3];
  shuffleArray(indices, random);

  return {
    options: indices.map(idx => rawPl[idx]!),
    options_en: indices.map(idx => rawEn[idx]!),
  };
}

/**
 * Generates a randomized list of quiz questions with optional reverse-mode options.
 */
export function generateQuizQuestions(
  pool: readonly QuizQuestion[] = DEFAULT_QUESTIONS_POOL,
  count = 10,
  seed?: number,
  mode: QuizMode = 'classic',
): QuizQuestion[] {
  const random = createRandom(seed);
  const shuffled = shuffleArray([...pool], random);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  if (mode === 'reverse') {
    return selected.map(q => {
      const { options, options_en } = generateDistractors(q, pool, random);
      return {
        ...q,
        options,
        options_en,
      };
    });
  }

  return selected;
}

/**
 * Returns all distinct names in the pool for autocomplete suggestions.
 */
export function getAutocompleteSuggestions(
  pool: readonly QuizQuestion[] = DEFAULT_QUESTIONS_POOL,
  locale: 'pl' | 'en' = 'pl',
): string[] {
  const set = new Set<string>();
  for (const q of pool) {
    const name = locale === 'pl' ? q.name_pl : q.name_en;
    if (name) set.add(name);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
