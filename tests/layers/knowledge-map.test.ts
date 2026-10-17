import { describe, it, expect } from 'vitest';
import { resolveSrsItem, getSrsColor, SRS_STATUS_COLORS } from '@/layers/styles';
import type { SrsState } from '@/quiz/srs';

describe('Knowledge Map Color Resolver', () => {
  const baseTime = 1700000000000;
  const oneDay = 24 * 60 * 60 * 1000;

  const mockSrsState: SrsState = {
    // Mastered item (Box 5)
    PL: {
      id: 'PL',
      box: 5,
      lastReviewed: baseTime,
      nextReview: baseTime + 14 * oneDay,
      consecutiveCorrect: 5,
      totalAttempts: 5,
      successCount: 5,
    },
    // Difficult item (Box 1)
    'river-volga': {
      id: 'river-volga',
      box: 1,
      lastReviewed: baseTime,
      nextReview: baseTime,
      consecutiveCorrect: 0,
      totalAttempts: 3,
      successCount: 1,
    },
    // Due item (Box 2, but review time has passed)
    'desert-sahara': {
      id: 'desert-sahara',
      box: 2,
      lastReviewed: baseTime - 2 * oneDay,
      nextReview: baseTime - oneDay,
      consecutiveCorrect: 1,
      totalAttempts: 1,
      successCount: 1,
    },
    // Learning item (Box 3, review time in future)
    'capital-paris': {
      id: 'capital-paris',
      box: 3,
      lastReviewed: baseTime,
      nextReview: baseTime + 3 * oneDay,
      consecutiveCorrect: 2,
      totalAttempts: 2,
      successCount: 2,
    },
    // Unattempted item (0 attempts)
    unattempted: {
      id: 'unattempted',
      box: 1,
      lastReviewed: baseTime,
      nextReview: baseTime,
      consecutiveCorrect: 0,
      totalAttempts: 0,
      successCount: 0,
    },
  };

  describe('resolveSrsItem', () => {
    it('resolves exact match', () => {
      expect(resolveSrsItem('PL', mockSrsState)?.id).toBe('PL');
    });

    it('resolves featureId with prefix when stored with prefix', () => {
      expect(resolveSrsItem('river-volga', mockSrsState)?.id).toBe('river-volga');
    });

    it('resolves featureId with prefix when stored without prefix', () => {
      const state: SrsState = {
        volga: {
          id: 'volga',
          box: 2,
          lastReviewed: baseTime,
          nextReview: baseTime + oneDay,
          consecutiveCorrect: 1,
          totalAttempts: 1,
          successCount: 1,
        },
      };
      expect(resolveSrsItem('river-volga', state)?.id).toBe('volga');
    });

    it('resolves featureId without prefix when stored with prefix', () => {
      expect(resolveSrsItem('volga', mockSrsState)?.id).toBe('river-volga');
    });

    it('resolves country code aliases (FRA <-> FR, DEU <-> DE)', () => {
      const state: SrsState = {
        FR: {
          id: 'FR',
          box: 4,
          lastReviewed: baseTime,
          nextReview: baseTime + 7 * oneDay,
          consecutiveCorrect: 3,
          totalAttempts: 3,
          successCount: 3,
        },
      };
      expect(resolveSrsItem('FRA', state)?.id).toBe('FR');
    });

    it('returns undefined when item is not found or empty', () => {
      expect(resolveSrsItem('unknown-id', mockSrsState)).toBeUndefined();
      expect(resolveSrsItem('', mockSrsState)).toBeUndefined();
    });
  });

  describe('getSrsColor', () => {
    it('returns green for mastered items (Box 5)', () => {
      const fill = getSrsColor('PL', mockSrsState, 'fill', baseTime);
      expect(fill).toBe(SRS_STATUS_COLORS.mastered.fill);
      const stroke = getSrsColor('PL', mockSrsState, 'stroke', baseTime);
      expect(stroke).toBe(SRS_STATUS_COLORS.mastered.stroke);
      const point = getSrsColor('PL', mockSrsState, 'point', baseTime);
      expect(point).toBe(SRS_STATUS_COLORS.mastered.point);
      const path = getSrsColor('PL', mockSrsState, 'path', baseTime);
      expect(path).toBe(SRS_STATUS_COLORS.mastered.path);
    });

    it('returns coral red for difficult items (Box 1)', () => {
      const fill = getSrsColor('river-volga', mockSrsState, 'fill', baseTime);
      expect(fill).toBe(SRS_STATUS_COLORS.difficult.fill);
      const path = getSrsColor('river-volga', mockSrsState, 'path', baseTime);
      expect(path).toBe(SRS_STATUS_COLORS.difficult.path);
    });

    it('returns amber/orange for due items (review time passed)', () => {
      const fill = getSrsColor('desert-sahara', mockSrsState, 'fill', baseTime);
      expect(fill).toBe(SRS_STATUS_COLORS.due.fill);
    });

    it('returns sky blue for active learning items (Box 2-4, not due)', () => {
      const point = getSrsColor('capital-paris', mockSrsState, 'point', baseTime);
      expect(point).toBe(SRS_STATUS_COLORS.learning.point);
    });

    it('returns null for new or unattempted items', () => {
      expect(getSrsColor('unattempted', mockSrsState, 'fill', baseTime)).toBeNull();
      expect(getSrsColor('non-existent', mockSrsState, 'fill', baseTime)).toBeNull();
    });
  });
});
