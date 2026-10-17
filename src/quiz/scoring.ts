import { t } from '@/i18n';

export interface ScoreBadge {
  title: string;
  description: string;
}

export function calculatePoints(distanceKm: number): number {
  if (distanceKm <= 50) {
    return 1200; // 1000 base + 200 perfect hit bonus
  }
  return Math.max(0, Math.round(1000 - distanceKm * 0.5));
}

export function calculateReversePoints(isCorrect: boolean): number {
  return isCorrect ? 1000 : 0;
}

export function getBadgeForScore(totalPoints: number, maxPoints = 12000): ScoreBadge {
  const ratio = maxPoints > 0 ? totalPoints / maxPoints : 0;
  if (ratio >= 0.83) {
    return {
      title: t('quiz.badgeMasterTitle'),
      description: t('quiz.badgeMasterDesc'),
    };
  }
  if (ratio >= 0.62) {
    return {
      title: t('quiz.badgeExpertTitle'),
      description: t('quiz.badgeExpertDesc'),
    };
  }
  if (ratio >= 0.41) {
    return {
      title: t('quiz.badgeApprenticeTitle'),
      description: t('quiz.badgeApprenticeDesc'),
    };
  }
  return {
    title: t('quiz.badgeNoviceTitle'),
    description: t('quiz.badgeNoviceDesc'),
  };
}
