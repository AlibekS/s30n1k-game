import type { BiomeId, Surface } from '../levels/types';

export interface LayerDef {
  kind: 'peaks' | 'hills' | 'mesa' | 'pines' | 'cones';
  /** Цвет у гребня и у подножия (подножие тонет в дымке). */
  top: string;
  bottom: string;
  /** Линия гребня в долях высоты экрана и размах рельефа. */
  base: number;
  amp: number;
  parallax: number;
  snow?: string;
  seed: number;
}

export interface Biome {
  title: string;
  sky: [string, string, string];
  sun: { x: number; y: number; r: number; core: string; glow: string } | null;
  stars: number;
  aurora?: [string, string];
  cloud: string;
  clouds: number;
  layers: LayerDef[];
  haze: string;
  /** Глубина пропастей: цвет свечения/тумана снизу. */
  abyss: [string, string];
  soil: [string, string];
  strata: [string, string];
  speck: string;
  /** Цвет верхней кромки по типу поверхности. */
  turf: Partial<Record<Surface, [string, string]>>;
  blades: string[] | null;
  decor: ('pine' | 'bush' | 'rock' | 'cactus' | 'deadtree' | 'icespike' | 'basalt' | 'flower')[];
  decorTint: string;
  dust: string;
  ambient: 'pollen' | 'leaves' | 'dustmotes' | 'snow' | 'embers';
  ambientColor: string;
  /** Тонирующий свет поверх сцены. */
  light: string;
  vignette: string;
  accent: string;
}

const TURF_COMMON: Partial<Record<Surface, [string, string]>> = {
  rock: ['#8d8f96', '#c9ccd2'],
  wood: ['#8a6238', '#c59a62'],
  metal: ['#6c7480', '#aeb8c4'],
  mud: ['#3d2a1c', '#5c4330'],
  sand: ['#c9a468', '#ecd09a'],
  ice: ['#8fd3ee', '#e9fbff'],
  snow: ['#dfeaf2', '#ffffff'],
  dirt: ['#7a5a3c', '#a88560'],
  grass: ['#4f9a3c', '#9bdc62'],
};

export const BIOMES: Record<BiomeId, Biome> = {
  alps: {
    title: 'Альпы',
    sky: ['#2f6fc0', '#7fb7e6', '#dcefd8'],
    sun: { x: 0.74, y: 0.2, r: 0.05, core: '#fffbe6', glow: 'rgba(255,240,190,' },
    stars: 0,
    cloud: 'rgba(255,255,255,0.9)',
    clouds: 7,
    layers: [
      { kind: 'peaks', top: '#8ea9cc', bottom: '#c3d8e8', base: 0.42, amp: 0.3, parallax: 0.04, snow: '#ffffff', seed: 11 },
      { kind: 'peaks', top: '#5f84ad', bottom: '#a9c6da', base: 0.55, amp: 0.2, parallax: 0.08, snow: '#eef6ff', seed: 23 },
      { kind: 'hills', top: '#4c8a5c', bottom: '#8fbf8e', base: 0.68, amp: 0.1, parallax: 0.15, seed: 31 },
      { kind: 'pines', top: '#2f6646', bottom: '#4f8a60', base: 0.78, amp: 0.06, parallax: 0.26, seed: 47 },
    ],
    haze: 'rgba(222,238,228,',
    abyss: ['rgba(60,90,110,0)', 'rgba(170,200,215,0.85)'],
    soil: ['#6b4d33', '#2e2119'],
    strata: ['rgba(40,26,16,0.28)', 'rgba(120,88,58,0.5)'],
    speck: 'rgba(30,18,10,0.5)',
    turf: { ...TURF_COMMON },
    blades: ['#3f8a32', '#6cbf46', '#a6e36a'],
    decor: ['pine', 'bush', 'rock', 'flower', 'flower', 'pine'],
    decorTint: '#2c5a3a',
    dust: '168,140,104',
    ambient: 'pollen',
    ambientColor: 'rgba(255,255,230,0.75)',
    light: 'rgba(255,236,190,0.1)',
    vignette: 'rgba(10,25,50,0.42)',
    accent: '#6cc04a',
  },
  forest: {
    title: 'Лес',
    sky: ['#3d6f8f', '#9cc3b4', '#f4e2b0'],
    sun: { x: 0.26, y: 0.3, r: 0.045, core: '#fff3cf', glow: 'rgba(255,224,150,' },
    stars: 0,
    cloud: 'rgba(255,246,225,0.7)',
    clouds: 4,
    layers: [
      { kind: 'hills', top: '#7fa69b', bottom: '#cfdcbe', base: 0.48, amp: 0.16, parallax: 0.04, seed: 5 },
      { kind: 'pines', top: '#5d8d7c', bottom: '#b4cfae', base: 0.58, amp: 0.1, parallax: 0.09, seed: 13 },
      { kind: 'pines', top: '#3a6b58', bottom: '#86ae8c', base: 0.69, amp: 0.08, parallax: 0.17, seed: 29 },
      { kind: 'pines', top: '#1f4a3c', bottom: '#44755a', base: 0.82, amp: 0.07, parallax: 0.3, seed: 61 },
    ],
    haze: 'rgba(240,232,196,',
    abyss: ['rgba(40,70,60,0)', 'rgba(190,210,170,0.8)'],
    soil: ['#59412b', '#241a12'],
    strata: ['rgba(30,20,10,0.3)', 'rgba(110,84,52,0.5)'],
    speck: 'rgba(24,14,6,0.55)',
    turf: { ...TURF_COMMON, dirt: ['#7b5a36', '#c09a66'] },
    blades: ['#2f6b34', '#4f9440', '#86bf58'],
    decor: ['pine', 'pine', 'bush', 'deadtree', 'rock', 'pine', 'flower'],
    decorTint: '#1d4534',
    dust: '150,122,88',
    ambient: 'leaves',
    ambientColor: 'rgba(230,170,70,0.85)',
    light: 'rgba(255,214,130,0.13)',
    vignette: 'rgba(8,30,24,0.5)',
    accent: '#e0a23c',
  },
  canyon: {
    title: 'Каньон',
    sky: ['#3a2a5e', '#d46a4c', '#ffd08a'],
    sun: { x: 0.68, y: 0.52, r: 0.07, core: '#fff1c4', glow: 'rgba(255,170,90,' },
    stars: 40,
    cloud: 'rgba(255,190,150,0.55)',
    clouds: 4,
    layers: [
      { kind: 'mesa', top: '#b0605a', bottom: '#f0a878', base: 0.5, amp: 0.2, parallax: 0.04, seed: 3 },
      { kind: 'mesa', top: '#96463f', bottom: '#dc8a5e', base: 0.6, amp: 0.17, parallax: 0.09, seed: 17 },
      { kind: 'mesa', top: '#73302e', bottom: '#b6603f', base: 0.72, amp: 0.13, parallax: 0.17, seed: 37 },
      { kind: 'hills', top: '#4f1f24', bottom: '#873f30', base: 0.84, amp: 0.06, parallax: 0.3, seed: 53 },
    ],
    haze: 'rgba(255,196,130,',
    abyss: ['rgba(90,30,40,0)', 'rgba(60,20,50,0.9)'],
    soil: ['#a14f33', '#3d1a1c'],
    strata: ['rgba(70,20,16,0.3)', 'rgba(222,140,84,0.45)'],
    speck: 'rgba(60,16,10,0.45)',
    turf: { ...TURF_COMMON, rock: ['#c7694a', '#f2a878'], sand: ['#d9a55f', '#f7d596'] },
    blades: null,
    decor: ['cactus', 'rock', 'deadtree', 'rock', 'bush', 'cactus'],
    decorTint: '#5a2420',
    dust: '214,150,100',
    ambient: 'dustmotes',
    ambientColor: 'rgba(255,214,160,0.6)',
    light: 'rgba(255,150,80,0.14)',
    vignette: 'rgba(40,10,30,0.5)',
    accent: '#ff9a4a',
  },
  glacier: {
    title: 'Ледник',
    sky: ['#0d1a3a', '#274b7a', '#8fc0d8'],
    sun: { x: 0.2, y: 0.22, r: 0.035, core: '#f4fbff', glow: 'rgba(190,225,255,' },
    stars: 160,
    aurora: ['rgba(90,255,190,0.34)', 'rgba(120,150,255,0.26)'],
    cloud: 'rgba(200,225,245,0.35)',
    clouds: 3,
    layers: [
      { kind: 'peaks', top: '#5f7fae', bottom: '#a7c8de', base: 0.44, amp: 0.3, parallax: 0.04, snow: '#eaf6ff', seed: 7 },
      { kind: 'peaks', top: '#48679a', bottom: '#93b9d6', base: 0.57, amp: 0.22, parallax: 0.09, snow: '#f4fbff', seed: 19 },
      { kind: 'hills', top: '#b9d6e8', bottom: '#dcecf5', base: 0.7, amp: 0.09, parallax: 0.17, seed: 41 },
      { kind: 'hills', top: '#e4f1f8', bottom: '#f7fcff', base: 0.83, amp: 0.06, parallax: 0.3, seed: 59 },
    ],
    haze: 'rgba(190,224,240,',
    abyss: ['rgba(20,60,110,0)', 'rgba(20,70,130,0.9)'],
    soil: ['#7fb4d2', '#1d3f66'],
    strata: ['rgba(20,60,110,0.25)', 'rgba(210,240,255,0.5)'],
    speck: 'rgba(255,255,255,0.4)',
    turf: { ...TURF_COMMON, rock: ['#7f93a8', '#c5d5e2'] },
    blades: null,
    decor: ['icespike', 'rock', 'icespike', 'deadtree', 'pine'],
    decorTint: '#5f8fb4',
    dust: '235,245,255',
    ambient: 'snow',
    ambientColor: 'rgba(255,255,255,0.9)',
    light: 'rgba(150,200,255,0.1)',
    vignette: 'rgba(4,14,40,0.55)',
    accent: '#7fe0ff',
  },
  volcano: {
    title: 'Вулкан',
    sky: ['#0c0a14', '#3a1420', '#a23a1e'],
    sun: { x: 0.5, y: 0.78, r: 0.16, core: 'rgba(255,170,80,0.5)', glow: 'rgba(255,90,30,' },
    stars: 60,
    cloud: 'rgba(70,50,60,0.6)',
    clouds: 6,
    layers: [
      { kind: 'cones', top: '#3a1c26', bottom: '#8a3424', base: 0.46, amp: 0.3, parallax: 0.04, seed: 9 },
      { kind: 'peaks', top: '#2a1620', bottom: '#6a2a22', base: 0.6, amp: 0.2, parallax: 0.09, seed: 27 },
      { kind: 'hills', top: '#1d1018', bottom: '#4a1e1c', base: 0.73, amp: 0.1, parallax: 0.17, seed: 43 },
      { kind: 'hills', top: '#120a10', bottom: '#2c1214', base: 0.85, amp: 0.06, parallax: 0.3, seed: 67 },
    ],
    haze: 'rgba(255,110,50,',
    abyss: ['rgba(255,90,20,0)', 'rgba(255,150,40,0.95)'],
    soil: ['#3a2a30', '#120c10'],
    strata: ['rgba(0,0,0,0.35)', 'rgba(255,110,50,0.22)'],
    speck: 'rgba(255,120,60,0.3)',
    turf: { ...TURF_COMMON, rock: ['#4a3c44', '#8a747c'] },
    blades: null,
    decor: ['basalt', 'rock', 'deadtree', 'basalt', 'rock'],
    decorTint: '#1c1218',
    dust: '120,100,104',
    ambient: 'embers',
    ambientColor: 'rgba(255,170,70,0.95)',
    light: 'rgba(255,90,30,0.12)',
    vignette: 'rgba(0,0,0,0.62)',
    accent: '#ff6a2a',
  },
};
