import type { QuizQuestion, QuizMode, QuizConfig } from './types';
import { DEFAULT_QUESTIONS_POOL } from '@/i18n/quiz-questions';
import { loadSrsState } from './srs';

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
 * Filters a pool of quiz questions according to the specified QuizConfig criteria.
 * If allowFallback is true and fewer than 4 questions match, it progressively relaxes
 * difficulty, SRS, continent, and category constraints so a playable round is always possible.
 */
export function filterQuizQuestions(
  pool: readonly QuizQuestion[] = DEFAULT_QUESTIONS_POOL,
  config?: Partial<QuizConfig>,
  allowFallback = true,
): QuizQuestion[] {
  if (!config) return [...pool];

  const { category = 'all', continent = 'all', difficulty = 'hard', srsFilter = 'none' } = config;
  const srsState = srsFilter !== 'none' ? loadSrsState() : null;

  const matchesFilter = (q: QuizQuestion, matchDifficulty = true, matchSrs = true): boolean => {
    if (matchSrs && srsFilter !== 'none' && srsState) {
      const item = srsState[q.id];
      if (srsFilter === 'due') {
        const isDue = Boolean(item && Date.now() >= item.nextReview);
        if (!isDue) return false;
      } else if (srsFilter === 'difficult') {
        const isDifficult =
          item &&
          (item.box === 1 ||
            (item.totalAttempts >= 2 && item.successCount / item.totalAttempts < 0.6));
        if (!isDifficult) return false;
      }
    }

    if (category !== 'all') {
      const catMatch = q.category === category || q.kind === category || q.layerId === category;
      if (!catMatch) return false;
    }

    if (continent !== 'all') {
      if (q.continent && q.continent !== continent) return false;
    }

    if (matchDifficulty) {
      if (difficulty === 'easy' && (q.rank ?? 999) > 10) return false;
      if (difficulty === 'medium' && (q.rank ?? 999) > 25) return false;
    }

    return true;
  };

  const exactMatches = pool.filter(q => matchesFilter(q, true, true));

  if (!allowFallback || exactMatches.length >= 4) {
    return exactMatches;
  }

  const padPool = (relaxed: QuizQuestion[]): QuizQuestion[] => {
    const padded = [...exactMatches];
    for (const item of relaxed) {
      if (!padded.some(p => p.id === item.id)) {
        padded.push(item);
      }
    }
    return padded;
  };

  // Graceful fallback for narrow combinations:
  // 1. Relax difficulty within chosen SRS, continent, and category
  const relaxedDifficulty = pool.filter(q => matchesFilter(q, false, true));
  if (relaxedDifficulty.length >= 4) {
    return padPool(relaxedDifficulty);
  }

  // 2. Relax SRS filter
  if (srsFilter !== 'none') {
    const relaxedSrs = pool.filter(q => matchesFilter(q, false, false));
    if (relaxedSrs.length >= 4) {
      return padPool(relaxedSrs);
    }
  }

  // 3. Relax continent within category
  if (category !== 'all') {
    const relaxedContinent = pool.filter(
      q => q.category === category || q.kind === category || q.layerId === category,
    );
    if (relaxedContinent.length >= 4) {
      return padPool(relaxedContinent);
    }
  }

  // 4. Relax category within continent
  if (continent !== 'all') {
    const relaxedCategory = pool.filter(q => q.continent === continent);
    if (relaxedCategory.length >= 4) {
      return padPool(relaxedCategory);
    }
  }

  // 5. Default to full pool
  return padPool([...pool]);
}

/**
 * Returns the exact count of questions strictly matching the given config (no fallback).
 */
export function countMatchingQuestions(
  pool: readonly QuizQuestion[] = DEFAULT_QUESTIONS_POOL,
  config?: Partial<QuizConfig>,
): number {
  return filterQuizQuestions(pool, config, false).length;
}

/**
 * Generates 3 plausible distractors from the pool for a given question.
 * Prioritizes the same 'kind', falling back to the same 'layerId' or pool.
 */
export function generateDistractors(
  question: QuizQuestion,
  pool: readonly QuizQuestion[],
  random: () => number,
  fallbackPool?: readonly QuizQuestion[],
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

  // 3. Any fallback in pool if still not enough
  if (picked.length < 3) {
    const remaining = pool.filter(q => q.id !== question.id && !picked.some(p => p.id === q.id));
    shuffleArray(remaining, random);
    picked.push(...remaining.slice(0, 3 - picked.length));
  }

  // 4. Fallback to wider pool if still not enough
  if (picked.length < 3 && fallbackPool) {
    const fallbackSameKind = fallbackPool.filter(
      q => q.id !== question.id && q.kind === question.kind && !picked.some(p => p.id === q.id),
    );
    shuffleArray(fallbackSameKind, random);
    picked.push(...fallbackSameKind.slice(0, 3 - picked.length));

    if (picked.length < 3) {
      const fallbackRemaining = fallbackPool.filter(
        q => q.id !== question.id && !picked.some(p => p.id === q.id),
      );
      shuffleArray(fallbackRemaining, random);
      picked.push(...fallbackRemaining.slice(0, 3 - picked.length));
    }
  }

  // 5. Combine with the correct answer
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
  config?: QuizConfig,
): QuizQuestion[] {
  const random = createRandom(seed);
  const targetCount = config?.questionCount ?? count;

  const candidatePool = config ? filterQuizQuestions(pool, config, true) : [...pool];
  let selected: QuizQuestion[];

  if (config?.srsFilter && config.srsFilter !== 'none') {
    // Exact SRS matches
    const exactMatches = filterQuizQuestions(pool, config, false);

    const shuffledMatches = shuffleArray([...exactMatches], random);
    const remainingSlots = Math.max(0, targetCount - shuffledMatches.length);

    if (remainingSlots > 0) {
      const paddingCandidates = candidatePool.filter(q => !exactMatches.some(m => m.id === q.id));
      const shuffledPadding = shuffleArray([...paddingCandidates], random);
      selected = [...shuffledMatches, ...shuffledPadding.slice(0, remainingSlots)];
    } else {
      selected = shuffledMatches.slice(0, targetCount);
    }
  } else {
    const shuffled = shuffleArray([...candidatePool], random);
    selected = shuffled.slice(0, Math.min(targetCount, shuffled.length));
  }

  if (mode === 'reverse') {
    return selected.map(q => {
      const { options, options_en } = generateDistractors(q, candidatePool, random, pool);
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
  locale: 'pl' | 'en' = 'en',
): string[] {
  const set = new Set<string>();
  for (const q of pool) {
    const name = locale === 'pl' ? q.name_pl : q.name_en;
    if (name) set.add(name);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
