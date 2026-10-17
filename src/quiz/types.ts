import type { LayerId } from '@/layers/types';

export type QuizMode = 'classic' | 'reverse';

export type ContinentId =
  'all' | 'europe' | 'asia' | 'africa' | 'north-america' | 'south-america' | 'oceania';

export type QuizCategory =
  | 'all'
  | 'countries'
  | 'capitals'
  | 'rivers'
  | 'lakes'
  | 'mountains'
  | 'peaks'
  | 'deserts'
  | 'marine'
  | 'landforms';

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface QuizConfig {
  mode: QuizMode;
  category: QuizCategory;
  continent: ContinentId;
  difficulty: QuizDifficulty;
  questionCount: number;
}

export interface QuizQuestion {
  id: string;
  name_pl: string;
  name_en: string;
  kind: string;
  layerId: LayerId;
  targetLat: number;
  targetLng: number;
  continent?: ContinentId;
  rank?: number;
  category?: QuizCategory;
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
  config?: QuizConfig;
  totalPoints: number;
  maxPoints: number;
  avgDistanceKm?: number;
  correctCount?: number;
  totalQuestions: number;
  answers: QuizAnswer[];
}
