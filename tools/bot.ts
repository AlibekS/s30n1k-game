/** Авто-райдер: проверяет, что трассу можно проехать. */
import type { Level } from '../src/levels/types';
import type { Controls } from '../src/sim/bike';
import { Sim, TICK } from '../src/sim/sim';

export interface Plan { speed: number; charge: boolean; airBias: number }

export const PLANS: Plan[] = [];
for (const speed of [10, 13, 8, 16, 6.5, 19, 23, 5, 27]) for (const airBias of [0, -0.12, 0.12]) PLANS.push({ speed, charge: false, airBias });

export function botControl(s: Sim, plan: Plan, mem: { stuckX: number; stuckT: number; backT: number; chargeT: number }): Controls {
  const b = s.bike, c = b.c, w = s.world;
  const out: Controls = { throttle: 0, brake: 0, lean: 0, crouch: false };
  const g = (x: number): number => w.rayDown(x, c.y - 1.2);
  // --- лифты ---
  for (const p of w.props) {
    const d = p.def;
    if (d.type !== 'lift') continue;
    const h = d.len / 2;
    const x0 = Math.min(d.x, d.x2) - h, x1 = Math.max(d.x, d.x2) + h;
    if (c.x < x0 - 7 || c.x > x1 + 0.5) continue;
    const home = Math.hypot(p.x - d.x, p.y - d.y) < 0.12;
    const away = Math.hypot(p.x - d.x2, p.y - d.y2) < 0.12;
    const on = Math.abs(c.x - p.x) < h - 0.4 && c.y < p.y && c.y > p.y - 2;
    const pitch = c.a;
    out.lean = Math.max(-1, Math.min(1, -pitch * 3 - c.w * 0.5));
    if (on) {
      const target = away ? 7 : 0;
      const off = c.x - p.x;
      if (away) { out.throttle = 1; return out; }
      // держимся в центре платформы на тормозе
      const rel = c.vx - p.vx;
      if (off < -0.45 && rel < 1) out.throttle = 0.45; else out.brake = 1;
      out.lean = Math.max(-0.4, out.lean);
      void target;
      return out;
    }
    if (c.x < d.x - h + 0.2) {
      // подъезжаем к краю и ждём платформу
      const edge = d.x - h - 1.5;
      const dist = edge - c.x;
      const u = (((p.t / d.period + d.phase) % 1 + 1) % 1) * d.period;
      if (home && u < d.dwell * 0.4 && dist < 2.5) { out.throttle = 1; return out; }
      const want = Math.max(0, Math.min(6, dist * 1.5));
      if (dist < 0.15) { out.brake = c.vx > 0.05 ? 1 : 0; return out; }
      if (c.vx < want - 0.3) out.throttle = 0.6; else if (c.vx > want) out.brake = 1;
      return out;
    }
  }
  // --- обычная езда ---
  if (c.x > mem.stuckX + 1.2) { mem.stuckX = c.x; mem.stuckT = 0; } else mem.stuckT += TICK;
  if (mem.stuckT > 2.5 && mem.backT <= 0 && mem.chargeT <= 0) { mem.backT = 1.6; mem.stuckT = 0; }
  if (b.grounded) {
    const g0 = g(c.x - 0.7), g1 = g(c.x + 0.9);
    const slope = Number.isNaN(g0) || Number.isNaN(g1) ? 0 : Math.atan2(g1 - g0, 1.6);
    const err = c.a - slope;
    out.lean = Math.max(-1, Math.min(1, -err * 3.5 - c.w * 0.45));
    if (mem.backT > 0) {
      mem.backT -= TICK;
      out.brake = 1; out.lean = -1;
      if (mem.backT <= 0) mem.chargeT = 3.5;
      return out;
    }
    const target = mem.chargeT > 0 ? 40 : plan.speed;
    if (mem.chargeT > 0) mem.chargeT -= TICK;
    const sp = Math.hypot(c.vx, c.vy) * Math.sign(c.vx || 1);
    if (sp < target && err > -0.4) out.throttle = 1;
    else if (sp > target + 2.5 && b.frontContact && b.rearContact) out.brake = 0.7;
  } else {
    const lx = c.x + c.vx * 0.45;
    const g0 = g(lx - 0.8), g1 = g(lx + 0.8);
    const slope = Number.isNaN(g0) || Number.isNaN(g1) ? 0 : Math.max(-0.6, Math.min(0.6, Math.atan2(g1 - g0, 1.6)));
    const err = c.a - (slope - 0.06 + plan.airBias);
    out.lean = Math.max(-1, Math.min(1, -err * 5 - c.w * 0.75));
    if (mem.chargeT > 0) mem.chargeT -= TICK;
  }
  return out;
}

export interface BotResult { ok: boolean; time: number; attempts: number[]; failX: number; stars: number; plans: Plan[] }

export function runBot(level: Level, maxAttempts = PLANS.length): BotResult {
  const s = new Sim(level);
  const segs = level.checkpoints.length + 1;
  const attempts = new Array<number>(segs).fill(0);
  const used: Plan[] = [];
  let mem = { stuckX: -1e9, stuckT: 0, backT: 0, chargeT: 0 };
  let segT = 0;
  let failX = 0;
  for (let i = 0; i < 900 / TICK; i++) {
    const seg = s.cpIndex;
    const plan = PLANS[Math.max(0, attempts[seg] - 1) % PLANS.length];
    used[seg] = plan;
    s.tick(botControl(s, plan, mem));
    s.events.length = 0;
    segT += TICK;
    if (s.cpIndex !== seg) segT = 0;
    if (s.state === 'finished') return { ok: true, time: s.time, attempts, failX: 0, stars: s.starCount, plans: used };
    if ((s.state === 'crashed' && s.crashT > 0.4) || segT > 100) {
      failX = Math.max(failX, s.bike.c.x);
      attempts[seg]++;
      if (attempts[seg] >= maxAttempts) return { ok: false, time: s.time, attempts, failX: s.bike.c.x, stars: s.starCount, plans: used };
      if (s.state !== 'crashed') { s.bike.crashed = true; }
      s.respawn();
      if (s.state === 'ready') s.tick({ throttle: 0, brake: 0, lean: 0.0001, crouch: false });
      mem = { stuckX: -1e9, stuckT: 0, backT: 0, chargeT: 0 };
      segT = 0;
    }
  }
  return { ok: false, time: s.time, attempts, failX: s.bike.c.x, stars: s.starCount, plans: used };
}
