import { describe, it, expect } from 'vitest';
import {
  calculateNextReview,
  getItemStatus,
  getDueItems,
  getDifficultItems,
  countDueItems,
  ONE_DAY_MS,
  BOX_INTERVALS_MS,
} from '@/quiz/srs/leitner';
import type { SrsState } from '@/quiz/srs/types';

describe('Leitner Box SRS Algorithm', () => {
  const baseTime = 1700000000000;

  it('initializes a new item on first attempt', () => {
    // 1. First attempt correct -> advances directly to Box 2
    const correctItem = calculateNextReview(undefined, 'PL', true, baseTime);
    expect(correctItem.id).toBe('PL');
    expect(correctItem.box).toBe(2);
    expect(correctItem.lastReviewed).toBe(baseTime);
    expect(correctItem.nextReview).toBe(baseTime + BOX_INTERVALS_MS[2]!);
    expect(correctItem.consecutiveCorrect).toBe(1);
    expect(correctItem.totalAttempts).toBe(1);
    expect(correctItem.successCount).toBe(1);

    // 2. First attempt incorrect -> stays in Box 1, immediately due
    const incorrectItem = calculateNextReview(undefined, 'DE', false, baseTime);
    expect(incorrectItem.id).toBe('DE');
    expect(incorrectItem.box).toBe(1);
    expect(incorrectItem.lastReviewed).toBe(baseTime);
    expect(incorrectItem.nextReview).toBe(baseTime);
    expect(incorrectItem.consecutiveCorrect).toBe(0);
    expect(incorrectItem.totalAttempts).toBe(1);
    expect(incorrectItem.successCount).toBe(0);
  });

  it('advances through boxes 1 -> 2 -> 3 -> 4 -> 5 on consecutive successes', () => {
    let item = calculateNextReview(undefined, 'amazon', false, baseTime);
    expect(item.box).toBe(1);

    // Answer correctly -> Box 2
    item = calculateNextReview(item, 'amazon', true, baseTime);
    expect(item.box).toBe(2);
    expect(item.consecutiveCorrect).toBe(1);

    // Answer correctly -> Box 3
    item = calculateNextReview(item, 'amazon', true, baseTime);
    expect(item.box).toBe(3);
    expect(item.consecutiveCorrect).toBe(2);

    // Answer correctly -> Box 4
    item = calculateNextReview(item, 'amazon', true, baseTime);
    expect(item.box).toBe(4);
    expect(item.consecutiveCorrect).toBe(3);

    // Answer correctly -> Box 5 (mastery level)
    item = calculateNextReview(item, 'amazon', true, baseTime);
    expect(item.box).toBe(5);
    expect(item.consecutiveCorrect).toBe(4);

    // Another success caps at Box 5
    item = calculateNextReview(item, 'amazon', true, baseTime);
    expect(item.box).toBe(5);
    expect(item.consecutiveCorrect).toBe(5);
  });

  it('demotes item back to Box 1 immediately upon any mistake', () => {
    // Start at Box 4
    let item = calculateNextReview(undefined, 'everest', true, baseTime);
    item = calculateNextReview(item, 'everest', true, baseTime);
    item = calculateNextReview(item, 'everest', true, baseTime);
    expect(item.box).toBe(4);

    // Mistake
    item = calculateNextReview(item, 'everest', false, baseTime);
    expect(item.box).toBe(1);
    expect(item.consecutiveCorrect).toBe(0);
    expect(item.totalAttempts).toBe(4);
    expect(item.successCount).toBe(3);
    expect(item.nextReview).toBe(baseTime); // immediately due
  });

  it('computes correct learning status based on time and box', () => {
    expect(getItemStatus(undefined, baseTime)).toBe('new');

    const itemDue = calculateNextReview(undefined, 'item1', false, baseTime);
    expect(getItemStatus(itemDue, baseTime)).toBe('due');

    // Future review item in Box 2
    const itemLearning = calculateNextReview(undefined, 'item2', true, baseTime);
    expect(getItemStatus(itemLearning, baseTime)).toBe('learning');
    // Once time passes nextReview -> due
    expect(getItemStatus(itemLearning, baseTime + ONE_DAY_MS + 1000)).toBe('due');

    // Box 5 mastered
    let itemMastered = calculateNextReview(undefined, 'item3', true, baseTime);
    for (let i = 0; i < 4; i++) {
      itemMastered = calculateNextReview(itemMastered, 'item3', true, baseTime);
    }
    expect(itemMastered.box).toBe(5);
    expect(getItemStatus(itemMastered, baseTime)).toBe('mastered');
  });

  it('filters due and difficult items correctly', () => {
    const state: SrsState = {
      q1: {
        id: 'q1',
        box: 1,
        lastReviewed: baseTime,
        nextReview: baseTime,
        consecutiveCorrect: 0,
        totalAttempts: 2,
        successCount: 0,
      },
      q2: {
        id: 'q2',
        box: 3,
        lastReviewed: baseTime,
        nextReview: baseTime + 3 * ONE_DAY_MS,
        consecutiveCorrect: 2,
        totalAttempts: 2,
        successCount: 2,
      },
      q3: {
        id: 'q3',
        box: 2,
        lastReviewed: baseTime - 2 * ONE_DAY_MS,
        nextReview: baseTime - ONE_DAY_MS, // expired yesterday
        consecutiveCorrect: 1,
        totalAttempts: 1,
        successCount: 1,
      },
    };

    const due = getDueItems(state, baseTime);
    expect(due.map(d => d.id).sort()).toEqual(['q1', 'q3']);
    expect(countDueItems(state, baseTime)).toBe(2);

    const difficult = getDifficultItems(state);
    expect(difficult.map(d => d.id)).toEqual(['q1']);
  });
});
