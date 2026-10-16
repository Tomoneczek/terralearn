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

export function getBadgeForScore(totalPoints: number): ScoreBadge {
  if (totalPoints >= 10000) {
    return {
      title: t('quiz.badgeMasterTitle'),
      description: t('quiz.badgeMasterDesc'),
    };
  }
  if (totalPoints >= 7500) {
    return {
      title: t('quiz.badgeExpertTitle'),
      description: t('quiz.badgeExpertDesc'),
    };
  }
  if (totalPoints >= 5000) {
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
