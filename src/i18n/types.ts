/**
 * i18n type definitions for TerraLearn.
 */

export interface Dictionary {
  app: {
    title: string;
    tagline: string;
    searchPlaceholder: string;
  };
  sections: {
    modes: string;
    physical: string;
    political: string;
    tools: string;
  };
  modes: {
    all: string;
    physical: string;
    political: string;
    dayNight: string;
    learn: string;
  };
  layers: {
    borders: string;
    countriesTopN: string;
    capitals: string;
    megacities: string;
    lakes: string;
    rivers: string;
    mountains: string;
    deserts: string;
    peaks: string;
  };
  sliders: {
    topPrefix: string;
    rankByHeight: string;
    rankBySize: string;
  };
  tools: {
    sizeComparison: string;
    quizMode: string;
    greatCircle: string;
    antipodes: string;
  };
  card: {
    title: string;
    population: string;
    area: string;
    length: string;
    elevation: string;
    scaleComparison: string;
    showOnGlobe: string;
    close: string;
  };
  legend: {
    title: string;
    shortcuts: string;
  };
  quiz: {
    title: string;
    questionPrefix: string;
    errorDistance: string;
    points: string;
    next: string;
    summary: string;
    score: string;
    playAgain: string;
    reviewErrors: string;
  };
}

// Flat key path type e.g. "layers.lakes" | "sections.physical"
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type I18nKey = NestedKeyOf<Dictionary>;
