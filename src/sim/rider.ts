/** Поза райдера (обратная кинематика) и тряпичная кукла после падения. */
import { GRIP, PEG, type Bike } from './bike';
import type { Contact, World } from './world';

export interface Pose {
  hip: P; shoulder: P; head: P; elbow: P; hand: P; knee: P; foot: P;
}
interface P { x: number; y: number }
const pt = (): P => ({ x: 0, y: 0 });
export const makePose = (): Pose => ({ hip: pt(), shoulder: pt(), head: pt(), elbow: pt(), hand: pt(), knee: pt(), foot: pt() });

export const ARM = 0.33;
export const LEG = 0.45;

/** Двухзвенная ОК: сустав между a и b, изгиб в сторону side. */
function ik(a: P, b: P, l1: number, l2: number, side: number, out: P): void {
  let dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy) || 1e-6;
  const max = (l1 + l2) * 0.999;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const k = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - k * k)) * side;
  out.x = a.x + (dx * k - dy * h) / d;
  out.y = a.y + (dy * k + dx * h) / d;
}

/** Поза в системе рамы. */
export function riderPoseLocal(bike: Bike, o: Pose): void {
  const c = bike.c;
  const cs = Math.cos(c.a), sn = Math.sin(c.a);
  const dx = bike.rider.x - c.x, dy = bike.rider.y - c.y;
  const rx = dx * cs + dy * sn, ry = -dx * sn + dy * cs;
  const l = bike.leanS, cr = bike.crouchS;
  o.hip.x = rx - 0.13 - 0.05 * l; o.hip.y = ry + 0.2 + 0.03 * cr;
  o.shoulder.x = rx + 0.1 + 0.06 * l + 0.05 * cr; o.shoulder.y = ry - 0.17 + 0.07 * cr;
  o.hand.x = GRIP.x; o.hand.y = GRIP.y;
  // плечо не дальше длины руки от руля
  const sx = o.shoulder.x - GRIP.x, sy = o.shoulder.y - GRIP.y;
  const sd = Math.hypot(sx, sy), reach = ARM * 2 * 0.97;
  if (sd > reach) { o.shoulder.x = GRIP.x + (sx * reach) / sd; o.shoulder.y = GRIP.y + (sy * reach) / sd; }
  o.head.x = o.shoulder.x + 0.1 + 0.03 * l; o.head.y = o.shoulder.y - 0.19 + 0.04 * cr;
  o.foot.x = PEG.x; o.foot.y = PEG.y;
  ik(o.shoulder, o.hand, ARM, ARM, 1, o.elbow);
  ik(o.hip, o.foot, LEG, LEG, -1, o.knee);
}

const NAMES = ['head', 'shoulder', 'hip', 'elbow', 'hand', 'knee', 'foot'] as const;
const RADII = [0.13, 0.11, 0.11, 0.05, 0.05, 0.06, 0.07];
// head0 shoulder1 hip2 elbow3 hand4 knee5 foot6 + вторая рука/нога 7..10
const STICKS: [number, number][] = [
  [0, 1], [1, 2], [1, 3], [3, 4], [2, 5], [5, 6], [1, 7], [7, 8], [2, 9], [9, 10],
];
// мягкие связи, не дающие кукле складываться
const SOFT: [number, number, number][] = [[0, 2, 0.5], [1, 5, 0.25], [1, 9, 0.25], [0, 3, 0.2], [0, 7, 0.2]];

export class Ragdoll {
  readonly n = 11;
  readonly x = new Float64Array(11);
  readonly y = new Float64Array(11);
  private readonly ox = new Float64Array(11);
  private readonly oy = new Float64Array(11);
  private readonly r = new Float64Array(11);
  private readonly len: number[] = [];
  private readonly softLen: number[] = [];
  private contacts: Contact[] = [];
  /** Суммарная сила ударов за шаг (для звука). */
  thud = 0;

  constructor(bike: Bike, pose: Pose) {
    const c = bike.c;
    const cs = Math.cos(c.a), sn = Math.sin(c.a);
    const dt = 1 / 240;
    const set = (i: number, p: { x: number; y: number }, r: number, kick: number): void => {
      const wx = c.x + p.x * cs - p.y * sn, wy = c.y + p.x * sn + p.y * cs;
      // скорость точки рамы, смешанная со скоростью райдера
      const vx = (bike.rider.vx + c.vx - c.w * (wy - c.y)) / 2 + kick;
      const vy = (bike.rider.vy + c.vy + c.w * (wx - c.x)) / 2 - Math.abs(kick) * 0.6;
      this.x[i] = wx; this.y[i] = wy;
      this.ox[i] = wx - vx * dt; this.oy[i] = wy - vy * dt;
      this.r[i] = r;
    };
    NAMES.forEach((name, i) => set(i, pose[name], RADII[i], i === 0 ? 0.6 : 0));
    set(7, pose.elbow, RADII[3], -0.5); set(8, pose.hand, RADII[4], 0.9);
    set(9, pose.knee, RADII[5], 0.5); set(10, pose.foot, RADII[6], -0.8);
    for (const [a, b] of STICKS) this.len.push(Math.hypot(this.x[a] - this.x[b], this.y[a] - this.y[b]));
    for (const [a, b] of SOFT) this.softLen.push(Math.hypot(this.x[a] - this.x[b], this.y[a] - this.y[b]));
  }

  step(dt: number, world: World): void {
    const { x, y, ox, oy } = this;
    this.thud = 0;
    for (let i = 0; i < this.n; i++) {
      const vx = (x[i] - ox[i]) * 0.9985, vy = (y[i] - oy[i]) * 0.9985;
      ox[i] = x[i]; oy[i] = y[i];
      x[i] += vx; y[i] += vy + 10.4 * dt * dt;
    }
    for (let it = 0; it < 4; it++) {
      for (let s = 0; s < STICKS.length; s++) {
        const [a, b] = STICKS[s];
        const dx = x[b] - x[a], dy = y[b] - y[a];
        const d = Math.hypot(dx, dy) || 1e-9;
        const k = ((d - this.len[s]) / d) * 0.5;
        x[a] += dx * k; y[a] += dy * k; x[b] -= dx * k; y[b] -= dy * k;
      }
      for (let s = 0; s < SOFT.length; s++) {
        const [a, b, st] = SOFT[s];
        const dx = x[b] - x[a], dy = y[b] - y[a];
        const d = Math.hypot(dx, dy) || 1e-9;
        const rest = this.softLen[s];
        if (d > rest * 0.7 && d < rest * 1.15) continue;
        const target = d < rest ? rest * 0.7 : rest * 1.15;
        const k = ((d - target) / d) * 0.5 * st;
        x[a] += dx * k; y[a] += dy * k; x[b] -= dx * k; y[b] -= dy * k;
      }
    }
    for (let i = 0; i < this.n; i++) {
      world.beginContacts();
      this.contacts.length = 0;
      world.queryCircle(x[i], y[i], this.r[i], this.contacts);
      for (const ct of this.contacts) {
        if (ct.pen <= 0) continue;
        x[i] += ct.nx * ct.pen; y[i] += ct.ny * ct.pen;
        const vx = x[i] - ox[i], vy = y[i] - oy[i];
        const vn = vx * ct.nx + vy * ct.ny;
        const tx = -ct.ny, ty = ct.nx;
        const vt = vx * tx + vy * ty;
        if (vn < 0) this.thud += -vn / dt;
        // гасим нормальную составляющую и трение
        const nvn = vn < 0 ? -vn * 0.15 : vn;
        const nvt = vt * 0.9;
        ox[i] = x[i] - (ct.nx * nvn + tx * nvt);
        oy[i] = y[i] - (ct.ny * nvn + ty * nvt);
      }
    }
  }
}
