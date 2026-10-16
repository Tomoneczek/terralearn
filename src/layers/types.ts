import type { I18nKey } from '@/i18n';

export type LayerId =
  | 'borders'
  | 'countriesTopN'
  | 'capitals'
  | 'megacities'
  | 'lakes'
  | 'rivers'
  | 'mountains'
  | 'deserts'
  | 'peaks';

export type LayerGroup = 'modes' | 'physical' | 'political' | 'tools';

export type LayerKind = 'polygon' | 'path' | 'point' | 'label' | 'arc' | 'html';

export interface TopNConfig {
  min: number;
  max: number;
  default: number;
  step?: number;
  presets?: number[];
  rankBy: 'area' | 'population' | 'length' | 'elevation';
}

export interface LayerStyle {
  color?: string;
  capColor?: string;
  sideColor?: string;
  strokeColor?: string;
  altitude?: number;
  radius?: number;
  strokeWidth?: number;
}

export interface LayerDef {
  id: LayerId;
  group: LayerGroup;
  labelKey: I18nKey;
  icon: string;
  kind: LayerKind;
  source: string;
  defaultEnabled: boolean;
  topN?: TopNConfig;
  style?: LayerStyle;
}
