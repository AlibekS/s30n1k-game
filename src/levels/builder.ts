/**
 * Конструктор трасс. Все высоты задаются «вверх положительно», конструктор сам
 * переводит их в экранную систему (Y вниз). Кривые дискретизируются с шагом ~0.45 м.
 */
import { rng } from '../util';
import type { BiomeId, Chain, Level, Poly, PropDef, Surface } from './types';

const STEP = 0.45;
const PLANK_T = 0.16;

export interface LevelMeta {
  id: string;
  name: string;
  biome: BiomeId;
  tier: 1 | 2 | 3;
  blurb: string;
  par: [number, number, number];
  surface?: Surface;
}

export class LevelBuilder {
  x = 0;
  y = 0;
  private surf: Surface;
  private pts: number[] = [];
  private segSurf: Surface[] = [];
  private chains: Chain[] = [];
  private polys: Poly[] = [];
  private props: PropDef[] = [];
  private cps: number[] = [];
  private stars: { x: number; y: number }[] = [];
  private finishX = 0;
  private rand: () => number;
  private seed: number;

  constructor(private meta: LevelMeta) {
    this.surf = meta.surface ?? 'dirt';
    this.seed = [...meta.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    this.rand = rng(this.seed);
    // стартовая площадка с глухой стеной слева
    this.pts.push(-13, -11, -12.4, -10.6);
    this.segSurf.push('rock');
    this.put(-11.2, 0, 'rock');
    this.put(0, 0);
  }

  private put(x: number, y: number, s: Surface = this.surf): this {
    this.pts.push(x, y);
    this.segSurf.push(s);
    this.x = x;
    this.y = y;
    return this;
  }

  private curve(dx: number, f: (t: number) => number): this {
    const n = Math.max(2, Math.ceil(Math.abs(dx) / STEP));
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.put(x0 + dx * t, y0 - f(t));
    }
    return this;
  }

  /** Поверхность для следующих участков. */
  surface(s: Surface): this { this.surf = s; return this; }

  flat(len: number): this { return this.put(this.x + len, this.y); }

  /** Прямой отрезок. */
  line(dx: number, up: number): this { return this.put(this.x + dx, this.y - up); }

  /** Плавный S-образный переход. */
  to(dx: number, up: number): this {
    return this.curve(dx, (t) => up * (0.5 - 0.5 * Math.cos(Math.PI * t)));
  }

  /** Вогнутая дуга: начинается полого, заканчивается круто (трамплин при up > 0). */
  ramp(dx: number, up: number): this { return this.curve(dx, (t) => up * t * t); }

  /** Выпуклая дуга: начинается круто, заканчивается полого. */
  crest(dx: number, up: number): this { return this.curve(dx, (t) => up * (1 - (1 - t) * (1 - t))); }

  /** Холм (или яма при up < 0). */
  hill(len: number, up: number): this {
    return this.curve(len, (t) => up * (0.5 - 0.5 * Math.cos(2 * Math.PI * t)));
  }

  /** Серия волн. */
  bumps(n: number, len: number, up: number): this {
    for (let i = 0; i < n; i++) this.hill(len, up);
    return this;
  }

  /** Неровный каменистый участок с общим набором высоты up. */
  rough(len: number, amp: number, up = 0, grain = 0.9): this {
    const n = Math.max(2, Math.round(len / grain));
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const j = i === n ? 0 : (this.rand() - 0.5) * 2 * amp;
      this.put(x0 + len * t + (i === n ? 0 : (this.rand() - 0.5) * grain * 0.3), y0 - up * t - j);
    }
    return this;
  }

  /** Вертикальная ступень (up > 0 — вверх). */
  step(up: number, bevel = 0.55): this {
    // подъём — со скосом, чтобы колесо могло на него накатиться; спуск — отвесный
    return this.put(this.x + (up > 0 ? up * bevel : 0.03), this.y - up);
  }

  /** Лестница. */
  stairs(n: number, tread: number, rise: number): this {
    for (let i = 0; i < n; i++) this.step(rise).flat(tread);
    return this;
  }

  /** Разрыв: пропасть шириной w, дальний край выше на up. */
  gap(w: number, up = 0): this {
    this.endChain();
    this.x += w;
    this.y -= up;
    this.pts.push(this.x, this.y);
    return this;
  }

  private endChain(): void {
    if (this.pts.length >= 4) this.chains.push({ pts: this.pts, surf: this.segSurf });
    this.pts = [];
    this.segSurf = [];
  }

  cp(): this { this.cps.push(this.x); return this; }

  star(dx: number, up: number): this {
    this.stars.push({ x: this.x + dx, y: this.y - up });
    return this;
  }

  /** Качели на ровной площадке длиной len + запас; ось на высоте h. */
  seesaw(len: number, h: number, rest: 1 | -1 = -1): this {
    this.flat(0.6);
    const tilt = Math.asin(Math.min(0.9, (h - PLANK_T / 2) / (len / 2)));
    this.props.push({ type: 'seesaw', x: this.x + (len / 2) * Math.cos(tilt), y: this.y - h, len, tilt, rest });
    return this.flat(len * Math.cos(tilt) + 0.6);
  }

  /** Платформа, курсирующая через пропасть шириной w (дальний край выше на up). */
  ferry(w: number, up = 0, phase = 0, len = 3.6): this {
    this.lift(len / 2 + 0.12, 0, w - len / 2 - 0.12, up, len, phase);
    return this.gap(w, up);
  }

  /** Подъёмник перед уступом высотой h. */
  elevator(h: number, phase = 0, len = 3.6): this {
    this.lift(len / 2 + 0.1, PLANK_T, len / 2 + 0.1, h, len, phase);
    return this.flat(len + 0.25).put(this.x + 0.03, this.y - h);
  }

  /** Лифт между двумя точками относительно курсора (высоты — вверх). */
  lift(x1: number, up1: number, x2: number, up2: number, len: number, phase = 0): this {
    const dwell = 2.2;
    const dist = Math.hypot(x2 - x1, up2 - up1);
    const period = 2 * (dwell + (dist / 3.6) * 1.5);
    this.props.push({
      type: 'lift', len, period, phase, dwell,
      x: this.x + x1, y: this.y - up1 + PLANK_T / 2, x2: this.x + x2, y2: this.y - up2 + PLANK_T / 2,
    });
    return this;
  }

  /** Клин-трамплин или блок со скошенными гранями: основание w, высота h, скосы въезда/съезда. */
  block(dx: number, w: number, h: number, slopeIn: number, slopeOut = 0.05, style: Poly['style'] = 'rock'): this {
    return this.poly([[dx, -0.4], [dx, 0], [dx + slopeIn, h], [dx + w - slopeOut, h], [dx + w, 0], [dx + w, -0.4]], style);
  }

  /** Мост из n досок через пропасть; crumble — доски осыпаются после касания. */
  bridge(n: number, plank: number, crumble = true, up = 0): this {
    const x0 = this.x, y0 = this.y;
    for (let i = 0; i < n; i++) {
      const cx = x0 + plank * (i + 0.5);
      const cy = y0 - (up * (i + 0.5)) / n + PLANK_T / 2;
      if (crumble) {
        this.props.push({ type: 'crumble', x: cx, y: cy, len: plank - 0.06, delay: 0.42, spin: (this.rand() - 0.5) * 3 });
      } else {
        this.rect(cx - plank / 2 + 0.02, cy - PLANK_T / 2, plank - 0.04, PLANK_T, 'wood', 'wood');
      }
    }
    return this.gap(n * plank, up);
  }

  private rect(x: number, y: number, w: number, h: number, surf: Surface, style: Poly['style']): void {
    this.polys.push({ pts: [x, y, x + w, y, x + w, y + h, x, y + h], surf, style });
  }

  /** Прямоугольный блок: левый край на dx от курсора, низ на высоте up над курсором. */
  box(dx: number, w: number, h: number, up = 0, style: Poly['style'] = 'rock'): this {
    const surf: Surface = style === 'wood' ? 'wood' : style === 'metal' ? 'metal' : style === 'ice' ? 'ice' : 'rock';
    this.rect(this.x + dx, this.y - up - h, w, h + (up === 0 ? 0.4 : 0), surf, style);
    return this;
  }

  /** Произвольный многоугольник; точки относительно курсора, высоты — вверх. */
  poly(rel: [number, number][], style: Poly['style'] = 'rock'): this {
    const pts: number[] = [];
    for (const [dx, up] of rel) pts.push(this.x + dx, this.y - up);
    // приводим к обходу по часовой стрелке (на экране)
    let area = 0;
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
    }
    if (area < 0) {
      const rev: number[] = [];
      for (let i = n - 1; i >= 0; i--) rev.push(pts[i * 2], pts[i * 2 + 1]);
      pts.length = 0;
      pts.push(...rev);
    }
    const surf: Surface = style === 'wood' ? 'wood' : style === 'metal' ? 'metal' : style === 'ice' ? 'ice' : 'rock';
    this.polys.push({ pts, surf, style });
    return this;
  }

  /** Бревно поперёк трассы: центр на dx от курсора. */
  log(dx: number, r: number): this {
    const rel: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rel.push([dx + Math.cos(a) * r, r * 0.5 + Math.sin(a) * r]);
    }
    return this.poly(rel, 'wood');
  }

  /** Валун неправильной формы шириной w и высотой h. */
  boulder(dx: number, w: number, h: number): this {
    const rel: [number, number][] = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI - (i / (n - 1)) * Math.PI;
      const k = 0.85 + this.rand() * 0.3;
      rel.push([dx + w / 2 + (Math.cos(a) * w * k) / 2, Math.sin(a) * h * (0.8 + this.rand() * 0.3)]);
    }
    rel.push([dx + w, -0.4], [dx, -0.4]);
    return this.poly(rel, 'rock');
  }

  /** Нависающая плита: низ на высоте clearance над курсором. */
  roof(dx: number, len: number, clearance: number, thick = 1.2, style: Poly['style'] = 'rock'): this {
    return this.box(dx, len, thick, clearance, style);
  }

  /** Финиш в текущей точке; за ним — тормозная площадка со стеной. */
  finish(): Level {
    this.finishX = this.x + 2;
    this.flat(15);
    this.put(this.x + 1.2, this.y - 10.6, 'rock');
    this.put(this.x + 0.6, this.y - 0.4, 'rock');
    this.endChain();
    const m = this.meta;
    return {
      id: m.id, name: m.name, biome: m.biome, tier: m.tier, blurb: m.blurb, par: m.par,
      chains: this.chains, polys: this.polys, props: this.props,
      spawnX: -5, checkpoints: this.cps, finishX: this.finishX, stars: this.stars, seed: this.seed,
    };
  }
}
