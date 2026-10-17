import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSrsState,
  saveSrsState,
  updateSrsItem,
  clearSrsState,
  SRS_STORAGE_KEY,
} from '@/quiz/srs/persistence';
import type { SrsState } from '@/quiz/srs/types';

describe('SRS State Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads empty object when localStorage is empty', () => {
    expect(loadSrsState()).toEqual({});
  });

  it('persists and retrieves valid SRS records', () => {
    const state: SrsState = {
      PL: {
        id: 'PL',
        box: 3,
        lastReviewed: 1700000000000,
        nextReview: 1700259200000,
        consecutiveCorrect: 2,
        totalAttempts: 2,
        successCount: 2,
      },
    };

    saveSrsState(state);
    const loaded = loadSrsState();
    expect(loaded).toEqual(state);
  });

  it('recovers gracefully from corrupted JSON or schema violations', () => {
    localStorage.setItem(SRS_STORAGE_KEY, '{ invalid json');
    expect(loadSrsState()).toEqual({});

    localStorage.setItem(SRS_STORAGE_KEY, JSON.stringify({ PL: { box: 99 } })); // invalid box
    expect(loadSrsState()).toEqual({});
  });

  it('updates item status incrementally via updateSrsItem', () => {
    const item1 = updateSrsItem('nile', true, 1000);
    expect(item1.id).toBe('nile');
    expect(item1.box).toBe(2);
    expect(item1.successCount).toBe(1);

    const loaded = loadSrsState();
    expect(loaded['nile']).toEqual(item1);

    // Update with a failure
    const item2 = updateSrsItem('nile', false, 2000);
    expect(item2.box).toBe(1);
    expect(item2.consecutiveCorrect).toBe(0);
    expect(item2.totalAttempts).toBe(2);
    expect(item2.successCount).toBe(1);

    expect(loadSrsState()['nile']).toEqual(item2);
  });

  it('clears persisted SRS state', () => {
    updateSrsItem('everest', true);
    expect(Object.keys(loadSrsState()).length).toBe(1);

    clearSrsState();
    expect(loadSrsState()).toEqual({});
  });
});
