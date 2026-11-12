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
  /** Ключ, выведенный из пароля (у старых профилей — случайный код): подтверждает владение ником. */
  secret: string;
  /** У профиля есть пароль, заданный игроком. */
  pw?: boolean;
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

export const PASSWORD_MIN = 6;

/** Пароль не покидает устройство: на сервер уходит только ключ, выведенный из него (PBKDF2, соль — ник). */
async function deriveSecret(nick: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('ride:' + nickKey(nick)), iterations: 150000 }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function passwordError(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Пароль — минимум ${PASSWORD_MIN} символов`;
  if (password.length > 64) return 'Пароль слишком длинный';
  return null;
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
  async create(raw: string, password: string): Promise<string | null> {
    const nick = raw.trim();
    const err = nickError(nick) ?? passwordError(password);
    if (err) return err;
    const key = nickKey(nick);
    if (data.profiles[key]) return 'Такой ник уже есть на этом устройстве';
    let secret: string;
    try { secret = await deriveSecret(nick, password); } catch { return 'Браузер не поддерживает защиту пароля'; }
    let synced = false;
    if (onlineEnabled) {
      const r = await online.register(nick, secret);
      if (r === 'taken') return 'Этот ник уже занят';
      if (r === 'bad') return 'Сервер отклонил этот ник';
      if (r === 'offline') return 'Нет связи с сервером — проверьте интернет и попробуйте ещё раз';
      synced = true;
    }
    // прогресс гостя переезжает в новый профиль
    data.profiles[key] = { nick, secret, synced, pw: true, levels: guest };
    guest = {};
    try { localStorage.removeItem(OLD_KEY); } catch { /* ignore */ }
    data.current = key;
    flush();
    void this.pushAll();
    return null;
  },

  /** Вход в существующий профиль с другого устройства по нику и паролю. */
  async login(rawNick: string, password: string, pars: Record<string, [number, number, number]>): Promise<string | null> {
    const nick = rawNick.trim();
    if (!onlineEnabled) return 'Вход работает только с онлайн-сервером';
    if (nickError(nick) || !password) return 'Введите ник и пароль';
    let secret: string;
    try { secret = await deriveSecret(nick, password); } catch { return 'Браузер не поддерживает защиту пароля'; }
    let pw = true;
    let r = await online.register(nick, secret);
    // профили, созданные до появления паролей, входят по старому коду
    if (r === 'taken' && /^[0-9a-f]{24}$/.test(password.trim())) {
      secret = password.trim();
      pw = false;
      r = await online.register(nick, secret);
    }
    if (r === 'offline') return 'Нет связи с сервером';
    if (r !== 'ok') return 'Неверный ник или пароль';
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
    data.profiles[key] = { nick: name, secret, synced: true, pw, levels: lv };
    data.current = key;
    flush();
    return null;
  },

  /** Задаёт или меняет пароль активного профиля. */
  async setPassword(password: string): Promise<string | null> {
    const p = active();
    if (!p) return 'Сначала войдите в профиль';
    const err = passwordError(password);
    if (err) return err;
    let secret: string;
    try { secret = await deriveSecret(p.nick, password); } catch { return 'Браузер не поддерживает защиту пароля'; }
    if (onlineEnabled && p.synced) {
      const r = await online.changeSecret(p.nick, p.secret, secret);
      if (r === 'missing') return 'На сервере ещё не включена смена пароля';
      if (r === 'offline') return 'Нет связи с сервером';
      if (r !== 'ok') return 'Сервер отклонил смену пароля';
    }
    p.secret = secret;
    p.pw = true;
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
