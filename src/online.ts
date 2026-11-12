/** Клиент онлайн-сервера: регистрация ника, отправка результатов, таблица лидеров. */
import { ONLINE } from './online.config';

export interface ScoreRow { nick: string; level: string; time_ms: number; stars: number }
export type RegisterResult = 'ok' | 'taken' | 'bad' | 'offline';

export const onlineEnabled = !!(ONLINE.url && ONLINE.anonKey);

async function call<T>(path: string, body?: unknown): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`${ONLINE.url.replace(/\/$/, '')}/rest/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: ONLINE.anonKey, Authorization: `Bearer ${ONLINE.anonKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const online = {
  /** Занимает ник (или подтверждает владение им, если код совпал). */
  async register(nick: string, secret: string): Promise<RegisterResult> {
    if (!onlineEnabled) return 'offline';
    try {
      const r = await call<string>('rpc/ride_register', { p_nick: nick, p_secret: secret });
      return r === 'ok' || r === 'taken' || r === 'bad' ? r : 'offline';
    } catch {
      return 'offline';
    }
  },

  async submit(nick: string, secret: string, level: string, time: number, stars: number): Promise<boolean> {
    if (!onlineEnabled) return false;
    try {
      return (await call<string>('rpc/ride_submit', { p_nick: nick, p_secret: secret, p_level: level, p_time_ms: Math.round(time * 1000), p_stars: stars })) === 'ok';
    } catch {
      return false;
    }
  },

  /** Все результаты (лучшее время каждого игрока на каждой трассе); null — сервер недоступен. */
  async scores(): Promise<ScoreRow[] | null> {
    if (!onlineEnabled) return null;
    try {
      return await call<ScoreRow[]>('ride_scores?select=nick,level,time_ms,stars&order=time_ms.asc&limit=5000');
    } catch {
      return null;
    }
  },
};
