/**
 * Статическая геометрия уровня и подвижные объекты (качели, лифты, осыпающиеся мостки).
 * Единицы — метры, ось Y направлена вниз. Сегменты ориентированы: твёрдое тело
 * находится справа по ходу сегмента, внешняя нормаль — (dy, -dx).
 */
import type { Level, PropDef, Surface } from '../levels/types';

export interface SurfaceInfo {
  /** Коэффициент трения шины. */
  mu: number;
  /** Сопротивление качению (доля от нормальной нагрузки). */
  roll: number;
  /** Вязкое сопротивление (грязь, песок), 1/с. */
  drag: number;
}

export const SURFACES: Record<Surface, SurfaceInfo> = {
  dirt: { mu: 1.25, roll: 0.012, drag: 0 },
  grass: { mu: 1.1, roll: 0.016, drag: 0 },
  rock: { mu: 1.05, roll: 0.008, drag: 0 },
  wood: { mu: 0.95, roll: 0.008, drag: 0 },
  metal: { mu: 0.8, roll: 0.006, drag: 0 },
  sand: { mu: 0.9, roll: 0.05, drag: 0.5 },
  mud: { mu: 0.7, roll: 0.07, drag: 0.9 },
  snow: { mu: 0.75, roll: 0.03, drag: 0.15 },
  ice: { mu: 0.16, roll: 0.004, drag: 0 },
};

export const SURFACE_LIST = Object.keys(SURFACES) as Surface[];

export interface Contact {
  /** Нормаль от поверхности к центру окружности. */
  nx: number;
  ny: number;
  /** Глубина проникновения. */
  pen: number;
  /** Точка контакта на поверхности. */
  px: number;
  py: number;
  surf: Surface;
  prop: Prop | null;
  // аккумулированные импульсы решателя
  jn: number;
  jt: number;
}

export const PLANK_T = 0.16;

/** Подвижная доска. Линейная масса бесконечна; качели имеют конечный момент инерции. */
export class Prop {
  x: number;
  y: number;
  a = 0;
  vx = 0;
  vy = 0;
  w = 0;
  /** Обратный момент инерции (0 — кинематическое тело). */
  ii = 0;
  readonly len: number;
  readonly surf: Surface;
  t = 0;
  /** crumble: время с момента первого касания, -1 пока не тронута. */
  touched = -1;
  gone = false;

  constructor(readonly def: PropDef) {
    this.x = def.x;
    this.y = def.y;
    this.len = def.len;
    this.surf = def.type === 'lift' ? 'metal' : 'wood';
    this.reset();
  }

  reset(): void {
    const d = this.def;
    this.x = d.x;
    this.y = d.y;
    this.vx = this.vy = this.w = 0;
    this.t = 0;
    this.touched = -1;
    this.gone = false;
    if (d.type === 'seesaw') {
      this.a = d.rest * d.tilt;
      this.ii = 1 / ((70 * d.len * d.len) / 12);
    } else {
      this.a = 0;
      this.ii = 0;
    }
    if (d.type === 'lift') this.liftPose(0);
  }

  private liftPose(dt: number): void {
    const d = this.def;
    if (d.type !== 'lift') return;
    // стоянка у края — плавный переезд — стоянка — обратно
    const u = (((this.t / d.period + d.phase) % 1) + 1) % 1 * d.period;
    const move = d.period / 2 - d.dwell;
    let k: number;
    if (u < d.dwell) k = 0;
    else if (u < d.dwell + move) k = (u - d.dwell) / move;
    else if (u < 2 * d.dwell + move) k = 1;
    else k = 1 - (u - 2 * d.dwell - move) / move;
    k = k * k * (3 - 2 * k);
    const nx = d.x + (d.x2 - d.x) * k;
    const ny = d.y + (d.y2 - d.y) * k;
    if (dt > 0) {
      this.vx = (nx - this.x) / dt;
      this.vy = (ny - this.y) / dt;
    }
    this.x = nx;
    this.y = ny;
  }

  /** Силы и кинематика до решателя контактов. */
  preStep(dt: number): void {
    const d = this.def;
    this.t += dt;
    if (d.type === 'seesaw') {
      // лёгкий перевес на сторону покоя и вязкое трение в оси
      const target = d.rest * d.tilt;
      this.w += (target - this.a) * 2.2 * dt;
      this.w *= Math.exp(-1.6 * dt);
    } else if (d.type === 'lift') {
      this.liftPose(dt);
    } else if (d.type === 'crumble') {
      if (this.touched >= 0) {
        this.touched += dt;
        if (this.touched > d.delay) {
          this.vy += 14 * dt;
          this.w += d.spin * dt;
        } else {
          // дрожь перед обрушением
          this.a = Math.sin(this.touched * 70) * 0.012 * (this.touched / d.delay);
        }
        if (this.y > d.y + 40) this.gone = true;
      }
    }
  }

  /** Интегрирование после решателя. */
  postStep(dt: number): void {
    const d = this.def;
    if (d.type === 'seesaw') {
      this.a += this.w * dt;
      this.clampLimit();
    } else if (d.type === 'crumble' && this.touched > d.delay) {
      this.y += this.vy * dt;
      this.a += this.w * dt;
    }
  }

  /** Упор качелей: в предельном положении доска не проворачивается дальше. */
  clampLimit(): void {
    const d = this.def;
    if (d.type !== 'seesaw') return;
    if (this.a >= d.tilt) {
      this.a = d.tilt;
      if (this.w > 0) this.w = 0;
    } else if (this.a <= -d.tilt) {
      this.a = -d.tilt;
      if (this.w < 0) this.w = 0;
    }
  }
}

const CELL = 2;

export class World {
  // статические сегменты
  readonly n: number;
  readonly ax: Float64Array;
  readonly ay: Float64Array;
  readonly bx: Float64Array;
  readonly by: Float64Array;
  readonly nx: Float64Array;
  readonly ny: Float64Array;
  readonly surf: Surface[];
  /** Сегмент грунта (толстое тело): допускается глубокое проникновение. */
  private readonly deep: Uint8Array;
  private readonly grid: Int32Array[];
  private readonly gx0: number;
  readonly props: Prop[];
  readonly minX: number;
  readonly maxX: number;
  readonly killY: number;

  /** Результат последнего rayDown. */
  hitNx = 0;
  hitNy = -1;
  hitSurf: Surface = 'dirt';

  private pool: Contact[] = [];
  private used = 0;

  constructor(readonly level: Level) {
    const segs: { ax: number; ay: number; bx: number; by: number; s: Surface; deep: boolean }[] = [];
    let deep = true;
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    const add = (ax: number, ay: number, bx: number, by: number, s: Surface): void => {
      if (Math.hypot(bx - ax, by - ay) < 1e-6) return;
      segs.push({ ax, ay, bx, by, s, deep });
      minX = Math.min(minX, ax, bx);
      maxX = Math.max(maxX, ax, bx);
    };
    for (const c of level.chains) {
      const p = c.pts;
      const m = p.length / 2;
      for (let i = 0; i < m; i++) maxY = Math.max(maxY, p[i * 2 + 1]);
    }
    const bottom = maxY + 30;
    for (const c of level.chains) {
      const p = c.pts;
      const m = p.length / 2;
      add(p[0], bottom, p[0], p[1], c.surf[0]);
      for (let i = 0; i < m - 1; i++) add(p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3], c.surf[i]);
      add(p[m * 2 - 2], p[m * 2 - 1], p[m * 2 - 2], bottom, c.surf[m - 2]);
    }
    deep = false;
    for (const poly of level.polys) {
      const p = poly.pts;
      const m = p.length / 2;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        add(p[i * 2], p[i * 2 + 1], p[j * 2], p[j * 2 + 1], poly.surf);
      }
    }
    this.n = segs.length;
    this.ax = new Float64Array(this.n);
    this.ay = new Float64Array(this.n);
    this.bx = new Float64Array(this.n);
    this.by = new Float64Array(this.n);
    this.nx = new Float64Array(this.n);
    this.ny = new Float64Array(this.n);
    this.surf = [];
    this.deep = new Uint8Array(this.n);
    this.minX = minX;
    this.maxX = maxX;
    this.killY = maxY + 14;
    this.gx0 = minX - CELL;
    const cells = Math.ceil((maxX - minX) / CELL) + 3;
    const buckets: number[][] = Array.from({ length: cells }, () => []);
    segs.forEach((s, i) => {
      this.ax[i] = s.ax; this.ay[i] = s.ay; this.bx[i] = s.bx; this.by[i] = s.by;
      const dx = s.bx - s.ax, dy = s.by - s.ay, l = Math.hypot(dx, dy);
      this.nx[i] = dy / l;
      this.ny[i] = -dx / l;
      this.surf.push(s.s);
      this.deep[i] = s.deep ? 1 : 0;
      const c0 = Math.floor((Math.min(s.ax, s.bx) - this.gx0) / CELL);
      const c1 = Math.floor((Math.max(s.ax, s.bx) - this.gx0) / CELL);
      for (let c = c0; c <= c1; c++) buckets[c].push(i);
    });
    this.grid = buckets.map((b) => Int32Array.from(b));
    this.props = level.props.map((d) => new Prop(d));
  }

  resetProps(): void {
    for (const p of this.props) p.reset();
  }

  beginContacts(): void {
    this.used = 0;
  }

  private alloc(): Contact {
    if (this.used === this.pool.length) {
      this.pool.push({ nx: 0, ny: 0, pen: 0, px: 0, py: 0, surf: 'dirt', prop: null, jn: 0, jt: 0 });
    }
    const c = this.pool[this.used++];
    c.jn = 0;
    c.jt = 0;
    return c;
  }

  /**
   * Контакты окружности со всей геометрией. margin — запас, с которым контакт
   * создаётся заранее (pen может быть отрицательным).
   */
  queryCircle(cx: number, cy: number, r: number, out: Contact[], margin = 0): void {
    const rr = r + margin;
    const c0 = Math.max(0, Math.floor((cx - rr - this.gx0) / CELL));
    const c1 = Math.min(this.grid.length - 1, Math.floor((cx + rr - this.gx0) / CELL));
    for (let c = c0; c <= c1; c++) {
      const cell = this.grid[c];
      for (let k = 0; k < cell.length; k++) {
        const i = cell[k];
        // сегмент, попавший в несколько ячеек, обрабатываем один раз
        if (c > c0) {
          const first = Math.floor((Math.min(this.ax[i], this.bx[i]) - this.gx0) / CELL);
          if (first < c) continue;
        }
        this.testSeg(cx, cy, rr, r, this.ax[i], this.ay[i], this.bx[i], this.by[i], this.nx[i], this.ny[i], this.surf[i], null, out, this.deep[i] ? -0.3 : 0);
      }
    }
    for (const p of this.props) {
      if (p.gone) continue;
      const dx = cx - p.x, dy = cy - p.y;
      const reach = p.len / 2 + rr + PLANK_T;
      if (dx * dx + dy * dy > reach * reach) continue;
      const cs = Math.cos(p.a), sn = Math.sin(p.a);
      const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
      const h = p.len / 2, t = PLANK_T / 2;
      const before = out.length;
      this.testSeg(lx, ly, rr, r, -h, -t, h, -t, 0, -1, p.surf, p, out);
      this.testSeg(lx, ly, rr, r, h, -t, h, t, 1, 0, p.surf, p, out);
      this.testSeg(lx, ly, rr, r, h, t, -h, t, 0, 1, p.surf, p, out);
      this.testSeg(lx, ly, rr, r, -h, t, -h, -t, -1, 0, p.surf, p, out);
      for (let k = before; k < out.length; k++) {
        const ct = out[k];
        const nx = ct.nx * cs - ct.ny * sn, ny = ct.nx * sn + ct.ny * cs;
        const px = ct.px * cs - ct.py * sn + p.x, py = ct.px * sn + ct.py * cs + p.y;
        ct.nx = nx; ct.ny = ny; ct.px = px; ct.py = py;
      }
    }
  }

  private testSeg(
    cx: number, cy: number, rr: number, r: number,
    ax: number, ay: number, bx: number, by: number, nx: number, ny: number,
    surf: Surface, prop: Prop | null, out: Contact[], back = 0,
  ): void {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = ((cx - ax) * dx + (cy - ay) * dy) / l2;
    if (t > 0 && t < 1) {
      const sd = (cx - ax) * nx + (cy - ay) * ny;
      if (sd >= rr || sd < back) return;
      const c = this.alloc();
      c.nx = nx; c.ny = ny; c.pen = r - sd;
      c.px = cx - nx * sd; c.py = cy - ny * sd;
      c.surf = surf; c.prop = prop;
      out.push(c);
    } else {
      const vx = t <= 0 ? ax : bx, vy = t <= 0 ? ay : by;
      const ox = cx - vx, oy = cy - vy;
      const d2 = ox * ox + oy * oy;
      if (d2 >= rr * rr || d2 < 1e-12) return;
      if (ox * nx + oy * ny <= 0) return;
      const d = Math.sqrt(d2);
      const c = this.alloc();
      c.nx = ox / d; c.ny = oy / d; c.pen = r - d;
      c.px = vx; c.py = vy;
      c.surf = surf; c.prop = prop;
      out.push(c);
    }
  }

  /** Есть ли пересечение окружности с геометрией. */
  private tmp: Contact[] = [];
  overlaps(cx: number, cy: number, r: number): boolean {
    const save = this.used;
    this.tmp.length = 0;
    this.queryCircle(cx, cy, r, this.tmp);
    let hit = false;
    for (const c of this.tmp) if (c.pen > 0) { hit = true; break; }
    this.used = save;
    return hit;
  }

  /** Луч вертикально вниз из (x, y). Возвращает y поверхности или NaN. */
  rayDown(x: number, y: number, withProps = true): number {
    let best = NaN;
    const c = Math.floor((x - this.gx0) / CELL);
    if (c >= 0 && c < this.grid.length) {
      const cell = this.grid[c];
      for (let k = 0; k < cell.length; k++) {
        const i = cell[k];
        const ax = this.ax[i], bx = this.bx[i];
        if (ax === bx || x < Math.min(ax, bx) || x > Math.max(ax, bx)) continue;
        if (this.ny[i] >= 0) continue;
        const yy = this.ay[i] + ((this.by[i] - this.ay[i]) * (x - ax)) / (bx - ax);
        if (yy >= y - 1e-6 && !(yy >= best)) {
          best = yy;
          this.hitNx = this.nx[i]; this.hitNy = this.ny[i]; this.hitSurf = this.surf[i];
        }
      }
    }
    if (withProps) {
      for (const p of this.props) {
        if (p.gone) continue;
        const cs = Math.cos(p.a), sn = Math.sin(p.a);
        const hx = (p.len / 2) * cs;
        if (Math.abs(x - p.x) > Math.abs(hx) || Math.abs(cs) < 0.2) continue;
        const yy = p.y + ((x - p.x) / cs) * sn - PLANK_T / 2 / cs;
        if (yy >= y - 1e-6 && !(yy >= best)) {
          best = yy;
          this.hitNx = sn; this.hitNy = -cs; this.hitSurf = p.surf;
        }
      }
    }
    return best;
  }

  /** Высота самой верхней поверхности в точке x (для расстановки объектов). */
  topY(x: number): number {
    return this.rayDown(x, -1e4, false);
  }

  stepPropsPre(dt: number): void {
    for (const p of this.props) p.preStep(dt);
  }

  stepPropsPost(dt: number): void {
    for (const p of this.props) p.postStep(dt);
  }
}
