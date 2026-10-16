import type { LayerId } from '@/layers/types';

export interface QuizQuestion {
  id: string;
  name_pl: string;
  name_en: string;
  kind: string;
  layerId: LayerId;
  targetLat: number;
  targetLng: number;
  hint?: string;
}

export interface QuizAnswer {
  question: QuizQuestion;
  clickLat: number;
  clickLng: number;
  distanceKm: number;
  points: number;
}

export type QuizState = 'idle' | 'question' | 'feedback' | 'finished';

export interface QuizRoundSummary {
  totalPoints: number;
  maxPoints: number;
  avgDistanceKm: number;
  answers: QuizAnswer[];
}
