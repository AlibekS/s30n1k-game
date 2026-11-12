/**
 * Мотоцикл как система из четырёх тел: рама, заднее и переднее колесо, райдер.
 *  - заднее колесо висит на маятнике (связь постоянной длины вокруг оси маятника),
 *    переднее — на телескопической вилке (точка на прямой); у обоих пружина,
 *    раздельное демпфирование сжатия/отбоя и жёсткие ограничители хода;
 *  - колёса имеют собственную массу и момент инерции; тяга и торможение — это
 *    крутящий момент на колесе с реакцией на раму, сцепление — кулоново трение
 *    в пятне контакта (пробуксовка, юз, вилли и стоппи получаются сами);
 *  - райдер — отдельная масса на пружине: перенос веса реально смещает центр масс.
 * Решатель — последовательные импульсы с малым фиксированным шагом (480 Гц).
 */
import { SURFACES, type Contact, type World } from './world';
import type { Surface } from '../levels/types';

export const WHEEL_R = 0.34;
const G = 10.4;

// --- геометрия в системе рамы (x вперёд, y вниз), начало — центр масс рамы ---
export const PIVOT = { x: -0.14, y: 0.13 };
export const SWING_LEN = 0.58;
const SWING_EXT = 0.42; // угол маятника ниже горизонтали при полном отбое, рад
const REAR_TRAVEL = 0.27;
export const HEAD = { x: 0.5, y: -0.44 };
export const FORK_AXIS = { x: Math.sin(0.45), y: Math.cos(0.45) };
export const FORK_LEN = 0.88;
const FORK_TRAVEL = 0.28;
export const PEG = { x: -0.03, y: 0.24 };
export const GRIP = { x: 0.4, y: -0.56 };
const SEAT = { x: -0.2, y: -0.62 };
/** Окружности рамы, которыми она может лечь на грунт. */
const HULL = [
  { x: 0.1, y: 0.2, r: 0.17 },
  { x: -0.55, y: -0.26, r: 0.1 },
  { x: 0.46, y: -0.52, r: 0.09 },
];

// --- массы ---
const M_CHASSIS = 78;
const I_CHASSIS = 15;
const M_WHEEL = 11;
const I_WHEEL = 0.95;
const M_RIDER = 68;

// --- подвеска ---
const K_REAR = 10500, PRE_REAR = 200, C_REAR_IN = 900, C_REAR_OUT = 1700;
const K_FRONT = 8500, PRE_FRONT = 150, C_FRONT_IN = 750, C_FRONT_OUT = 1400;

// --- двигатель ---
const TORQUE = 430;
const W_MAX = 74; // рад/с на заднем колесе (~90 км/ч)
const BRAKE_REAR = 200;
const BRAKE_FRONT = 270;

const BETA = 0.2;

export interface Body {
  x: number; y: number; a: number;
  vx: number; vy: number; w: number;
  im: number; ii: number;
}

const body = (m: number, i: number): Body => ({ x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0, im: 1 / m, ii: 1 / i });

export interface Controls {
  throttle: number; // 0..1
  brake: number; // 0..1 (вместе с наклоном назад на месте — задний ход)
  lean: number; // -1 назад .. +1 вперёд
  crouch: boolean; // присед для прыжка
}

interface Link {
  ax: number; ay: number; // направление отбоя
  px: number; py: number; // направление жёсткой связи
  e: number; // ошибка связи
  q: number; // сжатие
  rx: number; ry: number; // колесо относительно рамы
  kp: number; ka: number; // эффективные массы
  jp: number; jlim: number;
  travel: number;
}

const link = (travel: number): Link => ({ ax: 0, ay: 1, px: 1, py: 0, e: 0, q: 0, rx: 0, ry: 0, kp: 1, ka: 1, jp: 0, jlim: 0, travel });

export class Bike {
  readonly c = body(M_CHASSIS, I_CHASSIS);
  readonly rw = body(M_WHEEL, I_WHEEL);
  readonly fw = body(M_WHEEL, I_WHEEL);
  /** Райдер: точечная масса (корпус). */
  readonly rider = { x: 0, y: 0, vx: 0, vy: 0 };
  private readonly rl = link(REAR_TRAVEL);
  private readonly fl = link(FORK_TRAVEL);

  crashed = false;
  /** Сглаженный наклон райдера -1..1 и присед 0..1 (для позы). */
  leanS = 0;
  crouchS = 0;
  private hopT = 0;
  private wasCrouch = false;
  throttleS = 0;

  // телеметрия для эффектов и звука
  rearContact = false;
  frontContact = false;
  rearSurf: Surface = 'dirt';
  frontSurf: Surface = 'dirt';
  rearNx = 0; rearNy = -1;
  /** Скорость проскальзывания задней шины по грунту, м/с (знак — направление). */
  rearSlip = 0;
  frontSlip = 0;
  /** Пиковая нагрузка за шаг в единицах веса. */
  impact = 0;
  hullHit = 0;
  hullX = 0; hullY = 0;
  rearQ = 0;
  frontQ = 0;
  airTime = 0;

  private contactsR: Contact[] = [];
  private contactsF: Contact[] = [];
  private contactsH: Contact[] = [];
  private hullIdx: number[] = [];

  get speed(): number { return Math.hypot(this.c.vx, this.c.vy); }
  get grounded(): boolean { return this.rearContact || this.frontContact; }
  /** Обороты двигателя 0..1 для звука. */
  get rpm(): number { return Math.min(1, Math.abs(this.rw.w - this.c.w) / W_MAX); }

  toWorld(lx: number, ly: number, out: { x: number; y: number }): void {
    const cs = Math.cos(this.c.a), sn = Math.sin(this.c.a);
    out.x = this.c.x + lx * cs - ly * sn;
    out.y = this.c.y + lx * sn + ly * cs;
  }

  /** Положение головы райдера в системе рамы. */
  headLocal(out: { x: number; y: number }): void {
    const cs = Math.cos(this.c.a), sn = Math.sin(this.c.a);
    const dx = this.rider.x - this.c.x, dy = this.rider.y - this.c.y;
    out.x = dx * cs + dy * sn + 0.2 + 0.05 * this.leanS;
    out.y = -dx * sn + dy * cs - 0.36 + 0.06 * this.crouchS;
  }

  /** Ставит мотоцикл колёсами на грунт в точке x и даёт подвеске осесть. */
  spawn(world: World, x: number): void {
    const c = this.c;
    const wb = 1.48;
    const yr = world.topY(x - wb / 2), yf = world.topY(x + wb / 2);
    const gr = Number.isNaN(yr) ? (Number.isNaN(yf) ? 0 : yf) : yr;
    const gf = Number.isNaN(yf) ? gr : yf;
    c.a = Math.atan2(gf - gr, wb);
    const cs = Math.cos(c.a), sn = Math.sin(c.a);
    const mx = x, my = (gr + gf) / 2;
    // центр рамы — над серединой базы, по нормали к склону
    const h = WHEEL_R + 0.36;
    c.x = mx + sn * h - cs * 0.02;
    c.y = my - cs * h;
    c.vx = c.vy = c.w = 0;
    const place = (b: Body, lx: number, ly: number): void => {
      b.x = c.x + lx * cs - ly * sn;
      b.y = c.y + lx * sn + ly * cs;
      b.vx = b.vy = b.w = 0; b.a = 0;
    };
    const ang = SWING_EXT - 0.2;
    place(this.rw, PIVOT.x - Math.cos(ang) * SWING_LEN, PIVOT.y + Math.sin(ang) * SWING_LEN);
    const fx = FORK_LEN - 0.09;
    place(this.fw, HEAD.x + FORK_AXIS.x * fx, HEAD.y + FORK_AXIS.y * fx);
    this.rider.x = c.x + SEAT.x * cs - SEAT.y * sn;
    this.rider.y = c.y + SEAT.x * sn + SEAT.y * cs;
    this.rider.vx = this.rider.vy = 0;
    this.crashed = false;
    this.leanS = this.crouchS = this.hopT = this.throttleS = 0;
    this.wasCrouch = false;
    this.airTime = 0;
    this.impact = 0;
    const hold: Controls = { throttle: 0, brake: 1, lean: 0, crouch: false };
    for (let i = 0; i < 360; i++) this.step(1 / 480, hold, world, true);
    c.vx *= 0; c.vy *= 0; c.w = 0;
    this.rw.vx = this.rw.vy = this.rw.w = 0;
    this.fw.vx = this.fw.vy = this.fw.w = 0;
    this.rider.vx = this.rider.vy = 0;
    this.crashed = false;
    this.impact = 0;
    this.airTime = 0;
  }

  private prepLink(l: Link, wheel: Body, rear: boolean): void {
    const c = this.c;
    const cs = Math.cos(c.a), sn = Math.sin(c.a);
    l.rx = wheel.x - c.x;
    l.ry = wheel.y - c.y;
    if (rear) {
      const wx = c.x + PIVOT.x * cs - PIVOT.y * sn, wy = c.y + PIVOT.x * sn + PIVOT.y * cs;
      const dx = wheel.x - wx, dy = wheel.y - wy;
      const d = Math.hypot(dx, dy) || 1e-9;
      l.px = dx / d; l.py = dy / d;
      l.ax = l.py; l.ay = -l.px;
      l.e = d - SWING_LEN;
      const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
      l.q = (SWING_EXT - Math.atan2(ly, -lx)) * SWING_LEN;
    } else {
      l.ax = FORK_AXIS.x * cs - FORK_AXIS.y * sn;
      l.ay = FORK_AXIS.x * sn + FORK_AXIS.y * cs;
      l.px = -l.ay; l.py = l.ax;
      const hx = c.x + HEAD.x * cs - HEAD.y * sn, hy = c.y + HEAD.x * sn + HEAD.y * cs;
      const dx = wheel.x - hx, dy = wheel.y - hy;
      l.e = dx * l.px + dy * l.py;
      l.q = FORK_LEN - (dx * l.ax + dy * l.ay);
    }
    const rp = l.rx * l.py - l.ry * l.px;
    const ra = l.rx * l.ay - l.ry * l.ax;
    l.kp = 1 / (wheel.im + c.im + c.ii * rp * rp);
    l.ka = 1 / (wheel.im + c.im + c.ii * ra * ra);
    l.jp = 0;
    l.jlim = 0;
  }

  /** Импульс j вдоль (dx,dy) на колесо и противоположный — на раму в точке колеса. */
  private pair(l: Link, wheel: Body, dx: number, dy: number, j: number): void {
    const c = this.c;
    wheel.vx += dx * j * wheel.im;
    wheel.vy += dy * j * wheel.im;
    c.vx -= dx * j * c.im;
    c.vy -= dy * j * c.im;
    c.w -= (l.rx * dy - l.ry * dx) * j * c.ii;
  }

  private relVel(l: Link, wheel: Body, dx: number, dy: number): number {
    const c = this.c;
    return (wheel.vx - (c.vx - c.w * l.ry)) * dx + (wheel.vy - (c.vy + c.w * l.rx)) * dy;
  }

  private spring(l: Link, wheel: Body, k: number, pre: number, cin: number, cout: number, dt: number): void {
    const ext = this.relVel(l, wheel, l.ax, l.ay); // >0 — отбой
    const q = Math.max(0, l.q);
    // прогрессивная характеристика ближе к концу хода
    const prog = q > l.travel * 0.7 ? (q - l.travel * 0.7) * k * 2.2 : 0;
    let f = k * q + pre + prog - (ext < 0 ? cin : cout) * ext;
    if (f < -900) f = -900;
    this.pair(l, wheel, l.ax, l.ay, f * dt);
  }

  private solveLink(l: Link, wheel: Body, dt: number): void {
    const v = this.relVel(l, wheel, l.px, l.py);
    const j = -(v + (BETA / dt) * l.e) * l.kp;
    l.jp += j;
    this.pair(l, wheel, l.px, l.py, j);
    if (l.q < 0) {
      const va = this.relVel(l, wheel, l.ax, l.ay);
      let j2 = -(va - (BETA / dt) * l.q) * l.ka;
      const old = l.jlim;
      l.jlim = Math.min(0, old + j2);
      j2 = l.jlim - old;
      this.pair(l, wheel, l.ax, l.ay, j2);
    } else if (l.q > l.travel) {
      const va = this.relVel(l, wheel, l.ax, l.ay);
      let j2 = -(va - (BETA / dt) * (l.q - l.travel)) * l.ka;
      const old = l.jlim;
      l.jlim = Math.max(0, old + j2);
      j2 = l.jlim - old;
      this.pair(l, wheel, l.ax, l.ay, j2);
    }
  }

  /** Контакт колеса: нормаль + трение с учётом вращения колеса. */
  private solveWheelContact(wheel: Body, ct: Contact, dt: number): void {
    const p = ct.prop;
    const nx = ct.nx, ny = ct.ny, tx = -ny, ty = nx;
    let pvx = 0, pvy = 0, prx = 0, pry = 0, kpn = 0, kpt = 0;
    if (p) {
      prx = ct.px - p.x; pry = ct.py - p.y;
      pvx = p.vx - p.w * pry; pvy = p.vy + p.w * prx;
      const rn = prx * ny - pry * nx, rt = prx * ty - pry * tx;
      kpn = p.ii * rn * rn; kpt = p.ii * rt * rt;
    }
    // нормаль
    const vn = (wheel.vx - pvx) * nx + (wheel.vy - pvy) * ny;
    const bias = ct.pen > 0.004 ? Math.min(3, (BETA / dt) * (ct.pen - 0.004)) : ct.pen < 0 ? ct.pen / dt : 0;
    let jn = -(vn - bias) / (wheel.im + kpn);
    const oldN = ct.jn;
    ct.jn = Math.max(0, oldN + jn);
    jn = ct.jn - oldN;
    wheel.vx += nx * jn * wheel.im;
    wheel.vy += ny * jn * wheel.im;
    if (p && jn !== 0) p.w -= (prx * ny - pry * nx) * jn * p.ii;
    // трение: точка контакта на колесе r = -n*R, её скорость v + w × r
    const vt = (wheel.vx + wheel.w * WHEEL_R * ny - pvx) * tx + (wheel.vy - wheel.w * WHEEL_R * nx - pvy) * ty;
    // (w × r)·t = w * (r × t)... для r = -nR: (w × r) = (w R ny, -w R nx)
    let jt = -vt / (wheel.im + wheel.ii * WHEEL_R * WHEEL_R + kpt);
    const maxT = SURFACES[ct.surf].mu * ct.jn;
    const oldT = ct.jt;
    ct.jt = Math.max(-maxT, Math.min(maxT, oldT + jt));
    jt = ct.jt - oldT;
    wheel.vx += tx * jt * wheel.im;
    wheel.vy += ty * jt * wheel.im;
    // момент: r × (t jt) = (-nR) × t * jt = -R * (n × t) * jt = -R jt
    wheel.w -= WHEEL_R * jt * wheel.ii;
    if (p && jt !== 0) p.w -= (prx * ty - pry * tx) * jt * p.ii;
  }

  private solveHullContact(ct: Contact, dt: number): void {
    const c = this.c;
    const p = ct.prop;
    const nx = ct.nx, ny = ct.ny, tx = -ny, ty = nx;
    const rx = ct.px - c.x, ry = ct.py - c.y;
    let pvx = 0, pvy = 0;
    if (p) { pvx = p.vx - p.w * (ct.py - p.y); pvy = p.vy + p.w * (ct.px - p.x); }
    const rn = rx * ny - ry * nx, rt = rx * ty - ry * tx;
    const vn = (c.vx - c.w * ry - pvx) * nx + (c.vy + c.w * rx - pvy) * ny;
    const bias = ct.pen > 0.004 ? Math.min(3, (BETA / dt) * (ct.pen - 0.004)) : ct.pen < 0 ? ct.pen / dt : 0;
    let jn = -(vn - bias) / (c.im + c.ii * rn * rn);
    const oldN = ct.jn;
    ct.jn = Math.max(0, oldN + jn);
    jn = ct.jn - oldN;
    c.vx += nx * jn * c.im; c.vy += ny * jn * c.im; c.w += rn * jn * c.ii;
    const vt = (c.vx - c.w * ry - pvx) * tx + (c.vy + c.w * rx - pvy) * ty;
    let jt = -vt / (c.im + c.ii * rt * rt);
    const maxT = 0.45 * ct.jn;
    const oldT = ct.jt;
    ct.jt = Math.max(-maxT, Math.min(maxT, oldT + jt));
    jt = ct.jt - oldT;
    c.vx += tx * jt * c.im; c.vy += ty * jt * c.im; c.w += rt * jt * c.ii;
  }

  step(dt: number, input: Controls, world: World, settling = false): void {
    const c = this.c, rw = this.rw, fw = this.fw, rider = this.rider;
    const alive = !this.crashed;
    const throttle = alive ? input.throttle : 0;
    const brakeIn = alive ? input.brake : 0;
    const lean = alive ? input.lean : 0;

    // --- сглаживание органов управления ---
    this.throttleS += (throttle - this.throttleS) * Math.min(1, dt * 14);
    this.leanS += (lean - this.leanS) * Math.min(1, dt * 11);
    const crouch = alive && input.crouch;
    if (this.wasCrouch && !crouch) this.hopT = 0.2;
    this.wasCrouch = crouch;
    this.hopT = Math.max(0, this.hopT - dt);
    this.crouchS += ((crouch ? 1 : 0) - this.crouchS) * Math.min(1, dt * 12);

    const cs = Math.cos(c.a), sn = Math.sin(c.a);

    // --- внешние силы ---
    c.vy += G * dt; rw.vy += G * dt; fw.vy += G * dt;
    const sp = Math.hypot(c.vx, c.vy);
    const aero = 0.0042 * sp * dt;
    c.vx -= c.vx * aero; c.vy -= c.vy * aero;

    this.prepLink(this.rl, rw, true);
    this.prepLink(this.fl, fw, false);
    this.rearQ = this.rl.q;
    this.frontQ = this.fl.q;
    this.spring(this.rl, rw, K_REAR, PRE_REAR, C_REAR_IN, C_REAR_OUT, dt);
    this.spring(this.fl, fw, K_FRONT, PRE_FRONT, C_FRONT_IN, C_FRONT_OUT, dt);

    // --- райдер на пружине ---
    if (alive) {
      rider.vy += G * dt;
      const hop = this.hopT > 0 ? 1 : 0;
      const lx = SEAT.x + (this.leanS < 0 ? 0.24 : 0.26) * this.leanS;
      const ly = SEAT.y + 0.05 * Math.abs(this.leanS) + 0.22 * this.crouchS - 0.3 * hop;
      const ax = c.x + lx * cs - ly * sn, ay = c.y + lx * sn + ly * cs;
      const arx = ax - c.x, ary = ay - c.y;
      const avx = c.vx - c.w * ary, avy = c.vy + c.w * arx;
      const k = hop ? 90000 : 30000, d = hop ? 500 : 2600;
      let fx = k * (ax - rider.x) + d * (avx - rider.vx);
      let fy = k * (ay - rider.y) + d * (avy - rider.vy);
      const fm = Math.hypot(fx, fy), cap = hop ? 14000 : 6500;
      if (fm > cap) { fx *= cap / fm; fy *= cap / fm; }
      rider.vx += (fx * dt) / M_RIDER; rider.vy += (fy * dt) / M_RIDER;
      c.vx -= fx * dt * c.im; c.vy -= fy * dt * c.im;
      c.w -= (arx * fy - ary * fx) * dt * c.ii;
      // работа корпусом: дополнительный момент (в воздухе — основной способ вращения)
      const air = !this.rearContact && !this.frontContact;
      const same = lean * c.w > 0 ? Math.max(0, 1 - Math.abs(c.w) / 7) : 1;
      c.w += lean * (air ? 560 * same : 70) * dt * c.ii;
      if (air && lean === 0) c.w *= Math.exp(-1.1 * dt);
    }

    // --- двигатель и тормоза ---
    const wRel = rw.w - c.w;
    let torque = 0;
    let brakeR = 0, brakeF = 0;
    if (throttle > 0) {
      const curve = Math.max(0, 1 - Math.max(0, wRel) / W_MAX);
      torque = this.throttleS * TORQUE * (0.35 + 0.65 * curve) * (wRel < W_MAX ? 1 : 0);
    } else {
      torque = -Math.max(-25, Math.min(25, wRel * 3));
    }
    if (brakeIn > 0) {
      const fwd = c.vx * cs + c.vy * sn;
      // задний ход: тормоз + наклон назад на малой скорости
      if (fwd < 1.2 && lean < -0.5 && throttle === 0 && !settling) {
        // задний ход
        torque = wRel > -11 ? -TORQUE * 0.42 * brakeIn : 0;
      } else {
        brakeR = BRAKE_REAR * brakeIn;
        brakeF = BRAKE_FRONT * brakeIn;
      }
    }
    rw.w += torque * dt * rw.ii;
    c.w -= torque * dt * c.ii;

    // --- контакты ---
    world.beginContacts();
    const cr = this.contactsR, cf = this.contactsF, ch = this.contactsH;
    cr.length = cf.length = ch.length = 0;
    this.hullIdx.length = 0;
    world.queryCircle(rw.x, rw.y, WHEEL_R, cr, 0.01);
    world.queryCircle(fw.x, fw.y, WHEEL_R, cf, 0.01);
    for (let i = 0; i < HULL.length; i++) {
      const h = HULL[i];
      const before = ch.length;
      const hx = c.x + h.x * cs - h.y * sn, hy = c.y + h.x * sn + h.y * cs;
      world.queryCircle(hx, hy, h.r, ch, 0.01);
      for (let k = before; k < ch.length; k++) this.hullIdx.push(i);
    }

    // --- решатель ---
    let jbr = 0, jbf = 0;
    const kb = 1 / (rw.ii + c.ii);
    for (let it = 0; it < 8; it++) {
      this.solveLink(this.rl, rw, dt);
      this.solveLink(this.fl, fw, dt);
      if (brakeR > 0) {
        let j = -(rw.w - c.w) * kb;
        const o = jbr; jbr = Math.max(-brakeR * dt, Math.min(brakeR * dt, o + j)); j = jbr - o;
        rw.w += j * rw.ii; c.w -= j * c.ii;
        j = -(fw.w - c.w) * kb;
        const o2 = jbf; jbf = Math.max(-brakeF * dt, Math.min(brakeF * dt, o2 + j)); j = jbf - o2;
        fw.w += j * fw.ii; c.w -= j * c.ii;
      }
      for (let i = 0; i < cr.length; i++) this.solveWheelContact(rw, cr[i], dt);
      for (let i = 0; i < cf.length; i++) this.solveWheelContact(fw, cf[i], dt);
      for (let i = 0; i < ch.length; i++) this.solveHullContact(ch[i], dt);
      for (const p of world.props) p.clampLimit();
    }

    // --- телеметрия ---
    let load = 0;
    this.rearContact = false;
    this.frontContact = false;
    let drag = 0;
    for (let i = 0; i < cr.length; i++) {
      const ct = cr[i];
      if (ct.jn <= 0) continue;
      load += ct.jn;
      this.rearContact = true;
      this.rearSurf = ct.surf; this.rearNx = ct.nx; this.rearNy = ct.ny;
      const s = SURFACES[ct.surf];
      drag = Math.max(drag, s.drag);
      // сопротивление качению
      const rr = s.roll * ct.jn * WHEEL_R * rw.ii;
      rw.w = Math.abs(rw.w) < rr ? 0 : rw.w - Math.sign(rw.w) * rr;
      if (ct.prop && ct.prop.touched < 0) ct.prop.touched = 0;
    }
    for (let i = 0; i < cf.length; i++) {
      const ct = cf[i];
      if (ct.jn <= 0) continue;
      load += ct.jn;
      this.frontContact = true;
      this.frontSurf = ct.surf;
      const s = SURFACES[ct.surf];
      drag = Math.max(drag, s.drag);
      const rr = s.roll * ct.jn * WHEEL_R * fw.ii;
      fw.w = Math.abs(fw.w) < rr ? 0 : fw.w - Math.sign(fw.w) * rr;
      if (ct.prop && ct.prop.touched < 0) ct.prop.touched = 0;
    }
    this.hullHit = 0;
    for (let i = 0; i < ch.length; i++) {
      const ct = ch[i];
      if (ct.jn <= 0) continue;
      load += ct.jn;
      if (ct.jn > this.hullHit) { this.hullHit = ct.jn; this.hullX = ct.px; this.hullY = ct.py; }
      if (ct.prop && ct.prop.touched < 0) ct.prop.touched = 0;
    }
    load += Math.abs(this.rl.jlim) + Math.abs(this.fl.jlim);
    this.impact = load / dt / ((M_CHASSIS + M_RIDER + 2 * M_WHEEL) * G);
    if (drag > 0) {
      const k = Math.exp(-drag * dt);
      rw.vx *= k; fw.vx *= k; c.vx *= k;
    }
    if (this.rearContact) {
      this.rearSlip = (rw.vx + rw.w * WHEEL_R * this.rearNy) * -this.rearNy + (rw.vy - rw.w * WHEEL_R * this.rearNx) * this.rearNx;
    } else this.rearSlip = 0;
    this.frontSlip = this.frontContact ? fw.vx - fw.w * WHEEL_R : 0;
    this.airTime = this.grounded ? 0 : this.airTime + dt;

    // --- интегрирование ---
    c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.w * dt;
    rw.x += rw.vx * dt; rw.y += rw.vy * dt; rw.a += rw.w * dt;
    fw.x += fw.vx * dt; fw.y += fw.vy * dt; fw.a += fw.w * dt;
    if (alive) {
      rider.x += rider.vx * dt; rider.y += rider.vy * dt;
      if (!settling) this.checkCrash(world);
    }
  }

  private tmp = { x: 0, y: 0 };
  private checkCrash(world: World): void {
    const t = this.tmp;
    this.headLocal(t);
    this.toWorld(t.x, t.y, t);
    if (world.overlaps(t.x, t.y, 0.13) || world.overlaps(this.rider.x, this.rider.y, 0.15)) this.crashed = true;
    if (this.c.y > world.killY) this.crashed = true;
    // райдера сорвало с мотоцикла
    this.toWorld(SEAT.x, SEAT.y, t);
    if (Math.hypot(this.rider.x - t.x, this.rider.y - t.y) > 0.75) this.crashed = true;
  }
}
