/**
 * Профили, прогресс и настройки. Гость играет без сохранения (прогресс живёт,
 * пока открыта вкладка); у профиля прогресс хранится в localStorage и, если
 * подключён сервер, результаты уходят в общую таблицу лидеров.
 */
import { nickError, nickKey } from './nick';
import { online, onlineEnabled, type ScoreRow } from './online';

export type Medal = 'gold' | 'silver' | 'bronze' | null;

export interface LevelRecord {
  time: number;
  medal: Medal;
  stars: number;
  /** Лучший заезд без единого падения. */
  clean: boolean;
  ghost?: number[];
}

export interface Profile {
  nick: string;
  /** Случайный код профиля: подтверждает владение ником на сервере. */
  secret: string;
  /** Ник подтверждён сервером. */
  synced: boolean;
  levels: Record<string, LevelRecord>;
}

interface Save {
  v: 2;
  current: string | null;
  profiles: Record<string, Profile>;
  muted: boolean;
  ghost: boolean;
}

const KEY = 'ride.save.v2';
const OLD_KEY = 'ride.save.v1';
let data: Save = { v: 2, current: null, profiles: {}, muted: false, ghost: true };
/** Прогресс гостя — только в памяти. */
let guest: Record<string, LevelRecord> = {};

try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const p = JSON.parse(raw) as Partial<Save>;
    if (p && p.v === 2 && p.profiles) data = { v: 2, current: p.current ?? null, profiles: p.profiles, muted: !!p.muted, ghost: p.ghost !== false };
  } else {
    // прогресс из версии без профилей достаётся гостю и переедет в первый созданный профиль
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const p = JSON.parse(old) as { levels?: Record<string, LevelRecord>; muted?: boolean; ghost?: boolean };
      guest = p.levels ?? {};
      data.muted = !!p.muted;
      data.ghost = p.ghost !== false;
    }
  }
  if (data.current && !data.profiles[data.current]) data.current = null;
} catch { /* хранилище недоступно — играем без сохранений */ }

function flush(): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

function randomSecret(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const active = (): Profile | null => (data.current ? data.profiles[data.current] ?? null : null);
const levels = (): Record<string, LevelRecord> => active()?.levels ?? guest;

export function medalFor(time: number, par: [number, number, number]): Medal {
  return time <= par[0] ? 'gold' : time <= par[1] ? 'silver' : time <= par[2] ? 'bronze' : null;
}

export const store = {
  get(id: string): LevelRecord | undefined { return levels()[id]; },
  get muted(): boolean { return data.muted; },
  set muted(v: boolean) { data.muted = v; flush(); },
  get ghost(): boolean { return data.ghost; },
  set ghost(v: boolean) { data.ghost = v; flush(); },

  get profile(): Profile | null { return active(); },
  get profiles(): Profile[] { return Object.values(data.profiles); },

  /** Сохраняет результат; возвращает true, если это новый рекорд времени. */
  submit(id: string, time: number, medal: Medal, stars: number, clean: boolean, ghost: number[]): boolean {
    const l = levels();
    const old = l[id];
    const better = !old || time < old.time;
    l[id] = {
      time: better ? time : old.time,
      medal: better ? medal : old.medal,
      stars: Math.max(stars, old?.stars ?? 0),
      clean: clean || !!old?.clean,
      ghost: better ? ghost : old.ghost,
    };
    const p = active();
    if (p) {
      flush();
      if (p.synced) void online.submit(p.nick, p.secret, id, l[id].time, l[id].stars);
    }
    return better;
  },

  /**
   * Создаёт профиль. Возвращает текст ошибки или null.
   * Ник проверяется по правилам, на уникальность — на устройстве и на сервере.
   */
  async create(raw: string): Promise<string | null> {
    const nick = raw.trim();
    const err = nickError(nick);
    if (err) return err;
    const key = nickKey(nick);
    if (data.profiles[key]) return 'Такой ник уже есть на этом устройстве';
    const secret = randomSecret();
    let synced = false;
    if (onlineEnabled) {
      const r = await online.register(nick, secret);
      if (r === 'taken') return 'Этот ник уже занят';
      if (r === 'bad') return 'Сервер отклонил этот ник';
      if (r === 'offline') return 'Нет связи с сервером — проверьте интернет и попробуйте ещё раз';
      synced = true;
    }
    // прогресс гостя переезжает в новый профиль
    data.profiles[key] = { nick, secret, synced, levels: guest };
    guest = {};
    try { localStorage.removeItem(OLD_KEY); } catch { /* ignore */ }
    data.current = key;
    flush();
    void this.pushAll();
    return null;
  },

  /** Вход в существующий профиль с другого устройства по нику и коду. */
  async login(rawNick: string, rawSecret: string, pars: Record<string, [number, number, number]>): Promise<string | null> {
    const nick = rawNick.trim(), secret = rawSecret.trim();
    if (!onlineEnabled) return 'Вход по коду работает только с онлайн-сервером';
    if (nickError(nick) || secret.length < 16) return 'Проверьте ник и код';
    const r = await online.register(nick, secret);
    if (r === 'offline') return 'Нет связи с сервером';
    if (r !== 'ok') return 'Ник или код не подходят';
    const rows = (await online.scores()) ?? [];
    const key = nickKey(nick);
    const lv: Record<string, LevelRecord> = data.profiles[key]?.levels ?? {};
    let name = nick;
    for (const row of rows) {
      if (nickKey(row.nick) !== key) continue;
      name = row.nick;
      const t = row.time_ms / 1000, old = lv[row.level];
      if (!old || t < old.time) lv[row.level] = { time: t, medal: pars[row.level] ? medalFor(t, pars[row.level]) : null, stars: Math.max(row.stars, old?.stars ?? 0), clean: !!old?.clean };
    }
    data.profiles[key] = { nick: name, secret, synced: true, levels: lv };
    data.current = key;
    flush();
    return null;
  },

  use(nick: string | null): void {
    data.current = nick === null ? null : nickKey(nick);
    if (data.current && !data.profiles[data.current]) data.current = null;
    flush();
  },

  remove(nick: string): void {
    const key = nickKey(nick);
    delete data.profiles[key];
    if (data.current === key) data.current = null;
    flush();
  },

  /** Досылает на сервер все локальные рекорды активного профиля. */
  async pushAll(): Promise<void> {
    const p = active();
    if (!p || !onlineEnabled) return;
    if (!p.synced) {
      if ((await online.register(p.nick, p.secret)) !== 'ok') return;
      p.synced = true;
      flush();
    }
    await Promise.all(Object.entries(p.levels).map(([id, r]) => online.submit(p.nick, p.secret, id, r.time, r.stars)));
  },

  /** Результаты всех профилей этого устройства в формате таблицы лидеров. */
  localScores(): ScoreRow[] {
    const rows: ScoreRow[] = [];
    for (const p of Object.values(data.profiles)) {
      for (const [level, r] of Object.entries(p.levels)) rows.push({ nick: p.nick, level, time_ms: Math.round(r.time * 1000), stars: r.stars });
    }
    return rows;
  },
};
