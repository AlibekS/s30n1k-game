export type Surface = 'dirt' | 'grass' | 'rock' | 'wood' | 'metal' | 'sand' | 'mud' | 'snow' | 'ice';

export type BiomeId = 'alps' | 'forest' | 'canyon' | 'glacier' | 'volcano';

/** Незамкнутая полоса грунта слева направо; твёрдое — всё, что ниже. */
export interface Chain {
  /** x0, y0, x1, y1, ... */
  pts: number[];
  /** Поверхность каждого сегмента (pts.length / 2 - 1 значений). */
  surf: Surface[];
}

/** Замкнутый многоугольник (по часовой стрелке на экране). */
export interface Poly {
  pts: number[];
  surf: Surface;
  style: 'rock' | 'wood' | 'metal' | 'ice';
}

export type PropDef =
  | {
      type: 'seesaw';
      x: number; y: number; len: number;
      /** Предельный угол наклона, рад. */
      tilt: number;
      /** Сторона покоя: +1 — правый конец внизу, -1 — левый. */
      rest: 1 | -1;
    }
  | {
      type: 'lift';
      x: number; y: number; x2: number; y2: number; len: number;
      /** Полный цикл туда-обратно и стоянка у каждого края, с. */
      period: number; phase: number; dwell: number;
    }
  | {
      type: 'crumble';
      x: number; y: number; len: number;
      delay: number; spin: number;
    };

export interface Level {
  id: string;
  name: string;
  biome: BiomeId;
  /** 1 — лёгкий, 2 — средний, 3 — сложный. */
  tier: 1 | 2 | 3;
  blurb: string;
  chains: Chain[];
  polys: Poly[];
  props: PropDef[];
  spawnX: number;
  checkpoints: number[];
  finishX: number;
  stars: { x: number; y: number }[];
  /** Время на золото, серебро, бронзу (с). */
  par: [number, number, number];
  /** Зерно для процедурного декора. */
  seed: number;
}
