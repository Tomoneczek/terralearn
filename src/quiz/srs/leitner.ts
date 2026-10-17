import type { SrsItem, SrsStatus, SrsState } from './types';

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const BOX_INTERVALS_MS: Record<number, number> = {
  1: 0, // Immediately due
  2: 1 * ONE_DAY_MS,
  3: 3 * ONE_DAY_MS,
  4: 7 * ONE_DAY_MS,
  5: 14 * ONE_DAY_MS,
};

/**
 * Calculates the updated SRS record for an item given whether the user answered correctly.
 */
export function calculateNextReview(
  existing: SrsItem | undefined,
  id: string,
  isCorrect: boolean,
  now: number = Date.now(),
): SrsItem {
  if (!existing) {
    if (isCorrect) {
      const box = 2;
      return {
        id,
        box,
        lastReviewed: now,
        nextReview: now + BOX_INTERVALS_MS[box]!,
        consecutiveCorrect: 1,
        totalAttempts: 1,
        successCount: 1,
      };
    } else {
      return {
        id,
        box: 1,
        lastReviewed: now,
        nextReview: now,
        consecutiveCorrect: 0,
        totalAttempts: 1,
        successCount: 0,
      };
    }
  }

  if (isCorrect) {
    const newBox = Math.min(5, existing.box + 1);
    return {
      id,
      box: newBox,
      lastReviewed: now,
      nextReview: now + BOX_INTERVALS_MS[newBox]!,
      consecutiveCorrect: existing.consecutiveCorrect + 1,
      totalAttempts: existing.totalAttempts + 1,
      successCount: existing.successCount + 1,
    };
  } else {
    return {
      id,
      box: 1,
      lastReviewed: now,
      nextReview: now,
      consecutiveCorrect: 0,
      totalAttempts: existing.totalAttempts + 1,
      successCount: existing.successCount,
    };
  }
}

/**
 * Returns the learning status of an SRS item at a given point in time.
 */
export function getItemStatus(item: SrsItem | undefined, now: number = Date.now()): SrsStatus {
  if (!item || item.totalAttempts === 0) {
    return 'new';
  }
  if (now >= item.nextReview) {
    return 'due';
  }
  if (item.box === 5) {
    return 'mastered';
  }
  return 'learning';
}

/**
 * Returns all SRS items that are due for review.
 */
export function getDueItems(state: SrsState, now: number = Date.now()): SrsItem[] {
  const items = Object.values(state);
  return items.filter(item => now >= item.nextReview);
}

/**
 * Returns all items considered difficult (Box 1 or success rate < 60% with at least 2 attempts).
 */
export function getDifficultItems(state: SrsState): SrsItem[] {
  const items = Object.values(state);
  return items.filter(item => {
    if (item.box === 1 && item.totalAttempts > 0) return true;
    if (item.totalAttempts >= 2 && item.successCount / item.totalAttempts < 0.6) return true;
    return false;
  });
}

/**
 * Returns count of items that are due for review.
 */
export function countDueItems(state: SrsState, now: number = Date.now()): number {
  return getDueItems(state, now).length;
}
