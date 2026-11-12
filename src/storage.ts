/** Прогресс и настройки в localStorage (с защитой от недоступного хранилища). */
export type Medal = 'gold' | 'silver' | 'bronze' | null;

export interface LevelRecord {
  time: number;
  medal: Medal;
  stars: number;
  /** Лучший заезд без единого падения. */
  clean: boolean;
  ghost?: number[];
}

interface Save {
  v: 1;
  levels: Record<string, LevelRecord>;
  muted: boolean;
  ghost: boolean;
}

const KEY = 'ride.save.v1';
let data: Save = { v: 1, levels: {}, muted: false, ghost: true };

try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const p = JSON.parse(raw) as Partial<Save>;
    if (p && p.v === 1 && p.levels) data = { v: 1, levels: p.levels, muted: !!p.muted, ghost: p.ghost !== false };
  }
} catch { /* хранилище недоступно — играем без сохранений */ }

function flush(): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export const store = {
  get(id: string): LevelRecord | undefined { return data.levels[id]; },
  get muted(): boolean { return data.muted; },
  set muted(v: boolean) { data.muted = v; flush(); },
  get ghost(): boolean { return data.ghost; },
  set ghost(v: boolean) { data.ghost = v; flush(); },

  /** Сохраняет результат; возвращает true, если это новый рекорд времени. */
  submit(id: string, time: number, medal: Medal, stars: number, clean: boolean, ghost: number[]): boolean {
    const old = data.levels[id];
    const better = !old || time < old.time;
    data.levels[id] = {
      time: better ? time : old.time,
      medal: better ? medal : old.medal,
      stars: Math.max(stars, old?.stars ?? 0),
      clean: clean || !!old?.clean,
      ghost: better ? ghost : old.ghost,
    };
    flush();
    return better;
  },

  reset(): void { data.levels = {}; flush(); },
};

export function medalFor(time: number, par: [number, number, number]): Medal {
  return time <= par[0] ? 'gold' : time <= par[1] ? 'silver' : time <= par[2] ? 'bronze' : null;
}
