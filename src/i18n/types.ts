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
    clouds: string;
    quality: string;
    qualityAuto: string;
    qualityHigh: string;
    qualityMedium: string;
    qualityLow: string;
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
    landforms: string;
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
  search: {
    noResults: string;
  };
  toolbar: {
    ariaLabel: string;
    zoomIn: string;
    zoomOut: string;
    resetView: string;
    autoRotate: string;
    fullscreen: string;
  };
  legend: {
    title: string;
    shortcuts: string;
    toggle: string;
  };
  quiz: {
    title: string;
    questionPrefix: string;
    errorDistance: string;
    points: string;
    next: string;
    summary: string;
    score: string;
    avgError: string;
    playAgain: string;
    reviewErrors: string;
    backToMap: string;
    badgeMasterTitle: string;
    badgeMasterDesc: string;
    badgeExpertTitle: string;
    badgeExpertDesc: string;
    badgeApprenticeTitle: string;
    badgeApprenticeDesc: string;
    badgeNoviceTitle: string;
    badgeNoviceDesc: string;
  };
  route: {
    title: string;
    orthodrome: string;
    rhumbLine: string;
    distance: string;
    difference: string;
    explanation: string;
    pickStart: string;
    pickEnd: string;
    clear: string;
    close: string;
    presets: string;
    presetWarsawTokyo: string;
    presetLondonSf: string;
    presetNySingapore: string;
  };
  sizeCompare: {
    title: string;
    close: string;
    presets: string;
    presetGreenlandAfrica: string;
    presetGreenlandEurope: string;
    presetBrazilEurope: string;
    presetPolandMed: string;
    presetAustraliaEurope: string;
    selectedCountry: string;
    area: string;
    ratioVsAfrica: string;
    ratioVsPoland: string;
    explanation: string;
    dragHint: string;
    resetPosition: string;
    changeCountry: string;
  };
  antipodes: {
    title: string;
    close: string;
    presets: string;
    presetWarsawPacific: string;
    presetMadridNz: string;
    presetBeijingArgentina: string;
    presetBogotaIndonesia: string;
    presetHawaiiBotswana: string;
    sourcePoint: string;
    antipodalPoint: string;
    whatIsThere: string;
    land: string;
    ocean: string;
    oceanArctic: string;
    oceanSouthern: string;
    oceanAtlantic: string;
    oceanIndian: string;
    oceanPacific: string;
    flyToAntipode: string;
    flyToSource: string;
    explanation: string;
    pickHint: string;
  };
}

// Flat key path type e.g. "layers.lakes" | "sections.physical"
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type I18nKey = NestedKeyOf<Dictionary>;
