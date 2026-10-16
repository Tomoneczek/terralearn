import type { Dictionary } from './types';

export const en: Dictionary = {
  app: {
    title: 'TerraLearn',
    tagline: 'Interactive 3D Earth Globe',
    searchPlaceholder: 'Search places, countries...',
  },
  sections: {
    modes: 'MAP MODES',
    physical: 'PHYSICAL GEOGRAPHY',
    political: 'POLITICAL GEOGRAPHY',
    tools: 'TOOLS & QUIZ',
  },
  modes: {
    physical: 'Physical',
    political: 'Political',
    dayNight: 'Night view (Day/Night)',
    learn: 'Study mode (hide labels)',
  },
  layers: {
    borders: 'Country borders',
    countriesTopN: 'Countries (Top 10 / 50 / 100)',
    capitals: 'Capitals',
    megacities: 'Megacities (>10M)',
    lakes: 'Largest lakes',
    rivers: 'Major rivers',
    mountains: 'Mountain ranges',
    deserts: 'Deserts',
    peaks: 'Highest peaks',
  },
  sliders: {
    topPrefix: 'Top',
    rankByHeight: 'height',
    rankBySize: 'size',
  },
  tools: {
    sizeComparison: 'Size comparator',
    quizMode: 'Quiz mode (Blind map)',
    greatCircle: 'Shortest route (Great circle)',
    antipodes: 'Antipodes simulator',
  },
  card: {
    title: 'Object card',
    population: 'Population',
    area: 'Area',
    length: 'Length',
    elevation: 'Elevation',
    scaleComparison: 'Scale comparison',
    showOnGlobe: 'Show on globe',
    close: 'Close',
  },
  legend: {
    title: 'Legend',
    shortcuts: 'Keyboard shortcuts',
  },
  quiz: {
    title: 'Blind map',
    questionPrefix: 'Locate:',
    errorDistance: 'Error',
    points: 'pts',
    next: 'Next',
    summary: 'Final score',
    score: 'Points earned',
    playAgain: 'Play again',
    reviewErrors: 'Review mistakes',
  },
};
