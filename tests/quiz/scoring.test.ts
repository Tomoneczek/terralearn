import { describe, it, expect } from 'vitest';
import { calculatePoints, getBadgeForScore } from '@/quiz/scoring';

describe('Quiz Scoring', () => {
  it('awards 1200 points for a perfect hit within 50 km', () => {
    expect(calculatePoints(0)).toBe(1200);
    expect(calculatePoints(35)).toBe(1200);
    expect(calculatePoints(50)).toBe(1200);
  });

  it('deducts points proportionally to distance error', () => {
    // 200 km error -> 1000 - 100 = 900
    expect(calculatePoints(200)).toBe(900);
    // 1000 km error -> 1000 - 500 = 500
    expect(calculatePoints(1000)).toBe(500);
    // 1900 km error -> 1000 - 950 = 50
    expect(calculatePoints(1900)).toBe(50);
  });

  it('clamps points to 0 when distance error is >= 2000 km', () => {
    expect(calculatePoints(2000)).toBe(0);
    expect(calculatePoints(5000)).toBe(0);
  });

  it('returns appropriate achievement badges for scores', () => {
    expect(getBadgeForScore(11000).title).toBe('Mistrz Globusa');
    expect(getBadgeForScore(8000).title).toBe('Doświadczony Podróżnik');
    expect(getBadgeForScore(5500).title).toBe('Adept Kartografii');
    expect(getBadgeForScore(2000).title).toBe('Początkujący Odkrywca');
  });
});
