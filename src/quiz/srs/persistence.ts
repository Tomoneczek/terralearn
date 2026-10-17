import { z } from 'zod';
import type { SrsItem, SrsState } from './types';
import { calculateNextReview } from './leitner';

export const SRS_STORAGE_KEY = 'terralearn_srs_state_v1';

export const SrsItemSchema = z.object({
  id: z.string(),
  box: z.number().int().min(1).max(5),
  lastReviewed: z.number(),
  nextReview: z.number(),
  consecutiveCorrect: z.number().int().nonnegative(),
  totalAttempts: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
});

export const SrsStateSchema = z.record(z.string(), SrsItemSchema);

/**
 * Loads the user's SRS progress from localStorage, validated against Zod schema.
 */
export function loadSrsState(): SrsState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(SRS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const validated = SrsStateSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn('Invalid SRS state in localStorage, resetting.', validated.error);
      return {};
    }
    return validated.data;
  } catch (err) {
    console.warn('Failed to load SRS state from localStorage:', err);
    return {};
  }
}

/**
 * Persists the user's SRS progress map to localStorage.
 */
export function saveSrsState(state: SrsState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(SRS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or private mode errors
  }
}

/**
 * Updates an item's review status after answering and persists the state.
 */
export function updateSrsItem(id: string, isCorrect: boolean, now: number = Date.now()): SrsItem {
  const current = loadSrsState();
  const updated = calculateNextReview(current[id], id, isCorrect, now);
  current[id] = updated;
  saveSrsState(current);
  return updated;
}

/**
 * Clears SRS state from localStorage.
 */
export function clearSrsState(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(SRS_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}
