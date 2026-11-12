/** Игровая симуляция уровня без какой-либо отрисовки: годится и для браузера, и для автотестов. */
import type { Level } from '../levels/types';
import { Bike, type Controls } from './bike';
import { makePose, Ragdoll, riderPoseLocal } from './rider';
import { World } from './world';

export const SUB_DT = 1 / 480;
export const SUBSTEPS = 4;
/** Шаг одного тика симуляции. */
export const TICK = SUB_DT * SUBSTEPS;

export type SimEvent =
  | { type: 'checkpoint'; index: number; total: number }
  | { type: 'star'; x: number; y: number; count: number }
  | { type: 'flip'; back: boolean; count: number }
  | { type: 'wheelie'; time: number }
  | { type: 'land'; force: number; x: number; y: number }
  | { type: 'scrape'; x: number; y: number; force: number }
  | { type: 'crash'; x: number; y: number }
  | { type: 'finish'; time: number }
  | { type: 'air'; time: number };

export type SimState = 'ready' | 'run' | 'crashed' | 'finished';

export class Sim {
  readonly world: World;
  readonly bike = new Bike();
  ragdoll: Ragdoll | null = null;
  state: SimState = 'ready';
  time = 0;
  cpIndex = 0;
  crashes = 0;
  flips = 0;
  crashT = 0;
  readonly starTaken: boolean[];
  starCount = 0;
  events: SimEvent[] = [];
  /** Запись заезда: t, x, y, угол, сжатие зад/перед — по 6 чисел на кадр. */
  rec: number[] = [];
  private recT = -1;

  private airRot = 0;
  private prevA = 0;
  private wasAir = false;
  private wheelieT = 0;
  private stuckT = 0;
  private maxAir = 0;
  private starsAtCp: boolean[];
  private pose = makePose();

  constructor(readonly level: Level) {
    this.world = new World(level);
    this.starTaken = level.stars.map(() => false);
    this.starsAtCp = this.starTaken.slice();
    this.restart();
  }

  get spawnX(): number {
    return this.cpIndex > 0 ? this.level.checkpoints[this.cpIndex - 1] : this.level.spawnX;
  }

  get progress(): number {
    const l = this.level;
    return Math.max(0, Math.min(1, (this.bike.c.x - l.spawnX) / (l.finishX - l.spawnX)));
  }

  /** Полный перезапуск уровня. */
  restart(): void {
    this.cpIndex = 0;
    this.time = 0;
    this.crashes = 0;
    this.flips = 0;
    this.starTaken.fill(false);
    this.starsAtCp.fill(false);
    this.starCount = 0;
    this.rec = [];
    this.recT = -1;
    this.state = 'ready';
    this.place();
  }

  /** Возврат к последнему чекпоинту (время продолжает идти). */
  respawn(): void {
    if (this.state === 'finished') return;
    for (let i = 0; i < this.starTaken.length; i++) this.starTaken[i] = this.starsAtCp[i];
    this.starCount = this.starTaken.filter(Boolean).length;
    this.state = this.time > 0 ? 'run' : 'ready';
    this.place();
  }

  private place(): void {
    this.world.resetProps();
    this.bike.spawn(this.world, this.spawnX);
    this.ragdoll = null;
    this.crashT = 0;
    this.airRot = 0;
    this.prevA = this.bike.c.a;
    this.wasAir = false;
    this.wheelieT = 0;
    this.maxAir = 0;
    this.events.length = 0;
  }

  tick(input: Controls): void {
    const bike = this.bike, world = this.world;
    if (this.state === 'ready') {
      if (input.throttle > 0 || input.brake > 0 || input.lean !== 0 || input.crouch) this.state = 'run';
      else {
        // лифты и качели живут и до старта
        for (let i = 0; i < SUBSTEPS; i++) { world.stepPropsPre(SUB_DT); world.stepPropsPost(SUB_DT); }
        return;
      }
    }
    if (this.state === 'finished') input = { throttle: 0, brake: 0.6, lean: 0, crouch: false };

    let peak = 0, scrape = 0;
    for (let i = 0; i < SUBSTEPS; i++) {
      world.stepPropsPre(SUB_DT);
      bike.step(SUB_DT, input, world);
      world.stepPropsPost(SUB_DT);
      if (bike.impact > peak) peak = bike.impact;
      if (bike.hullHit > scrape) scrape = bike.hullHit;
    }
    // мотоцикл лежит на боку или вверх колёсами — заезд не продолжить
    const tilt = Math.abs(Math.atan2(Math.sin(bike.c.a), Math.cos(bike.c.a)));
    if (this.state === 'run' && tilt > 1.75 && bike.speed < 1.2) {
      this.stuckT += TICK;
      if (this.stuckT > 0.8) bike.crashed = true;
    } else this.stuckT = 0;
    if (bike.crashed && !this.ragdoll) {
      riderPoseLocal(bike, this.pose);
      this.ragdoll = new Ragdoll(bike, this.pose);
      if (this.state === 'run') {
        this.state = 'crashed';
        this.crashes++;
        this.crashT = 0;
      }
      this.events.push({ type: 'crash', x: bike.rider.x, y: bike.rider.y });
    }
    if (this.ragdoll) { this.ragdoll.step(TICK / 2, world); this.ragdoll.step(TICK / 2, world); }
    if (this.state === 'crashed') { this.crashT += TICK; return; }
    if (this.state === 'finished') return;

    this.time += TICK;
    const c = bike.c;

    // --- трюки ---
    const air = !bike.grounded;
    if (air) {
      this.airRot += c.a - this.prevA;
      if (bike.airTime > this.maxAir) this.maxAir = bike.airTime;
    } else {
      if (this.wasAir) {
        const flips = Math.floor(Math.abs(this.airRot) / (Math.PI * 2) + 0.22);
        if (flips > 0 && this.maxAir > 0.3) {
          this.flips += flips;
          this.events.push({ type: 'flip', back: this.airRot < 0, count: flips });
        } else if (this.maxAir > 0.9) this.events.push({ type: 'air', time: this.maxAir });
        if (this.maxAir > 0.18 && peak > 1.6) this.events.push({ type: 'land', force: peak, x: bike.rw.x, y: bike.rw.y + 0.34 });
      }
      this.airRot = 0;
      this.maxAir = 0;
    }
    this.wasAir = air;
    this.prevA = c.a;
    if (bike.rearContact && !bike.frontContact && Math.abs(c.vx) > 1.5) this.wheelieT += TICK;
    else {
      if (this.wheelieT > 1.2) this.events.push({ type: 'wheelie', time: this.wheelieT });
      this.wheelieT = 0;
    }
    if (scrape > 0.4) this.events.push({ type: 'scrape', x: bike.hullX, y: bike.hullY, force: scrape });

    // --- звёзды ---
    const stars = this.level.stars;
    for (let i = 0; i < stars.length; i++) {
      if (this.starTaken[i]) continue;
      const s = stars[i];
      const d1 = Math.hypot(s.x - c.x, s.y - (c.y - 0.2));
      const d2 = Math.hypot(s.x - bike.rider.x, s.y - bike.rider.y);
      if (Math.min(d1, d2) < 1.05) {
        this.starTaken[i] = true;
        this.starCount++;
        this.events.push({ type: 'star', x: s.x, y: s.y, count: this.starCount });
      }
    }

    // --- чекпоинты и финиш ---
    const cps = this.level.checkpoints;
    while (this.cpIndex < cps.length && c.x >= cps[this.cpIndex]) {
      this.cpIndex++;
      for (let i = 0; i < this.starTaken.length; i++) this.starsAtCp[i] = this.starTaken[i];
      this.events.push({ type: 'checkpoint', index: this.cpIndex, total: cps.length });
    }
    if (c.x >= this.level.finishX) {
      this.state = 'finished';
      this.events.push({ type: 'finish', time: this.time });
    }

    if (this.time - this.recT >= 0.049) {
      this.recT = this.time;
      const r = (v: number): number => Math.round(v * 100) / 100;
      this.rec.push(r(this.time), r(c.x), r(c.y), r(c.a), r(bike.rearQ), r(bike.frontQ));
    }
  }
}
