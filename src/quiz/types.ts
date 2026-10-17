import type { LayerId } from '@/layers/types';

export type QuizMode = 'classic' | 'reverse';

export interface QuizQuestion {
  id: string;
  name_pl: string;
  name_en: string;
  kind: string;
  layerId: LayerId;
  targetLat: number;
  targetLng: number;
  hint?: string;
  options?: string[];
  options_en?: string[];
  altitude?: number;
}

export interface QuizAnswer {
  question: QuizQuestion;
  mode?: QuizMode;
  clickLat?: number;
  clickLng?: number;
  distanceKm?: number;
  selectedAnswer?: string;
  isCorrect?: boolean;
  points: number;
}

export type QuizState = 'idle' | 'question' | 'feedback' | 'finished';

export interface QuizRoundSummary {
  mode: QuizMode;
  totalPoints: number;
  maxPoints: number;
  avgDistanceKm?: number;
  correctCount?: number;
  totalQuestions: number;
  answers: QuizAnswer[];
}
