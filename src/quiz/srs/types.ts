export type SrsStatus = 'new' | 'learning' | 'due' | 'mastered';

export interface SrsItem {
  id: string;
  box: number; // 1..5
  lastReviewed: number; // ms timestamp
  nextReview: number; // ms timestamp
  consecutiveCorrect: number;
  totalAttempts: number;
  successCount: number;
}

export type SrsState = Record<string, SrsItem>;
