/** Игровая сессия: связывает симуляцию, камеру, эффекты, звук и отрисовку. */
import type { GameAudio } from './audio';
import type { Input } from './input';
import type { Level, Surface } from './levels/types';
import { Particles } from './render/fx';
import { Scene, type GhostPose, type View } from './render/scene';
import { WHEEL_R } from './sim/bike';
import { Sim, TICK } from './sim/sim';
import { clamp, rng } from './util';

export interface HudState {
  time: number;
  speed: number;
  stars: number;
  starsTotal: number;
  flips: number;
  progress: number;
  cp: number;
  state: Sim['state'];
}

export interface GameHooks {
  hud(s: HudState): void;
  toast(text: string, kind?: 'good' | 'info' | 'bad'): void;
  finish(result: { time: number; stars: number; crashes: number; flips: number; rec: number[] }): void;
  pauseToggle(): void;
}

const SURF_DUST: Partial<Record<Surface, string>> = {
  snow: '240,248,255', ice: '220,240,255', mud: '70,50,34', sand: '226,190,130', wood: '170,130,90', metal: '160,170,180',
};

export class Game {
  readonly sim: Sim;
  private scene: Scene;
  private particles = new Particles();
  private view: View = { x: 0, y: 0, scale: 40 };
  private raf = 0;
  private last = 0;
  private acc = 0;
  private clock = 0;
  private paused = false;
  private dead = false;
  private shake = 0;
  private slowmo = 0;
  private finishT = -1;
  private ghost: number[] | null;
  private ghostIdx = 0;
  private ghostPose: GhostPose = { x: 0, y: 0, a: 0, qr: 0, qf: 0 };
  private rand = rng(99);
  private scrapeT = 0;
  private propSeen: number[] = [];
  private fxT = 0;
  private onResize = (): void => this.scene.resize();

  constructor(
    canvas: HTMLCanvasElement, readonly level: Level,
    private input: Input, private audio: GameAudio, private hooks: GameHooks,
    ghost: number[] | null,
  ) {
    this.sim = new Sim(level);
    this.scene = new Scene(canvas, level, this.sim.world);
    this.ghost = ghost && ghost.length >= 12 ? ghost : null;
    window.addEventListener('resize', this.onResize);
    this.snapCamera();
  }

  start(): void {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.audio.engine(0, 0, 0, 0, false, false);
  }

  get isPaused(): boolean { return this.paused; }

  setPaused(p: boolean): void {
    this.paused = p;
    this.acc = 0;
    this.last = performance.now();
    if (p) this.audio.engine(0, 0, 0, 0, false, false);
  }

  restart(): void {
    this.sim.restart();
    this.afterPlace();
    this.finishT = -1;
    this.ghostIdx = 0;
  }

  respawn(): void {
    if (this.sim.state === 'finished') return;
    this.sim.respawn();
    this.afterPlace();
  }

  private afterPlace(): void {
    this.particles.clear();
    this.propSeen.length = 0;
    this.slowmo = 0;
    this.shake = 0;
    this.input.reset();
    this.snapCamera();
  }

  private snapCamera(): void {
    const c = this.sim.bike.c;
    this.view.scale = this.scene.baseScale();
    this.view.x = c.x + 2.5;
    this.view.y = c.y - 1.2;
  }

  private frame = (now: number): void => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.handleKeys();
    if (!this.paused) {
      this.clock += dt;
      const scale = this.slowmo > 0 ? 0.3 : 1;
      this.slowmo = Math.max(0, this.slowmo - dt);
      this.acc += dt * scale;
      const controls = this.input.sample();
      let n = 0;
      while (this.acc >= TICK && n < 8) {
        this.sim.tick(controls);
        this.acc -= TICK;
        n++;
        this.handleEvents();
      }
      if (n === 8) this.acc = 0;
      this.emitFx(dt * scale);
      this.particles.update(dt * scale);
      this.updateCamera(dt);
      const sim = this.sim, b = sim.bike;
      if (sim.state === 'crashed' && sim.crashT > 1.7) this.respawn();
      if (this.finishT >= 0) {
        this.finishT += dt;
        if (this.finishT > 1.3) {
          this.finishT = -1;
          this.hooks.finish({ time: sim.time, stars: sim.starCount, crashes: sim.crashes, flips: sim.flips, rec: sim.rec });
        }
      }
      const live = sim.state === 'run' || sim.state === 'ready';
      const loose = b.rearSurf === 'sand' || b.rearSurf === 'snow' || b.rearSurf === 'mud' || b.rearSurf === 'grass' || b.rearSurf === 'dirt';
      this.audio.engine(b.rpm, live ? controls.throttle : 0, clamp(Math.abs(b.rearSlip) / 9, 0, 1), b.speed, sim.state !== 'finished' || this.finishT >= 0, loose);
      this.hooks.hud({
        time: sim.time, speed: b.speed * 3.6, stars: sim.starCount, starsTotal: this.level.stars.length,
        flips: sim.flips, progress: sim.progress, cp: sim.cpIndex, state: sim.state,
      });
    }
    const sh = this.shake;
    const view = sh > 0.001
      ? { x: this.view.x + (this.rand() - 0.5) * sh, y: this.view.y + (this.rand() - 0.5) * sh, scale: this.view.scale }
      : this.view;
    this.scene.render(view, this.sim, this.particles, this.clock, this.currentGhost());
    this.input.endFrame();
  };

  private handleKeys(): void {
    const i = this.input;
    if (i.consume('Escape') || i.consume('KeyP')) { this.hooks.pauseToggle(); return; }
    if (this.paused) return;
    if (i.consume('KeyR') || i.consume('Enter')) {
      if (this.sim.state !== 'crashed' || this.sim.crashT > 0.3) this.respawn();
    }
    if (i.consume('Backspace') || i.consume('KeyT')) this.restart();
  }

  private handleEvents(): void {
    const sim = this.sim, ev = sim.events;
    if (!ev.length) return;
    for (const e of ev) {
      switch (e.type) {
        case 'checkpoint':
          this.hooks.toast(`Чекпоинт ${e.index}/${e.total}`, 'info');
          this.audio.checkpoint();
          break;
        case 'star':
          this.particles.sparkle(e.x, e.y, '#ffe27a', 22);
          this.audio.star(e.count);
          break;
        case 'flip':
          this.hooks.toast(`${e.back ? 'Бэкфлип' : 'Фронтфлип'}${e.count > 1 ? ' ×' + e.count : ''}!`, 'good');
          this.audio.flip();
          break;
        case 'air':
          this.hooks.toast(`Полёт ${e.time.toFixed(1)} с`, 'info');
          break;
        case 'wheelie':
          this.hooks.toast(`Вилли ${e.time.toFixed(1)} с`, 'good');
          break;
        case 'land':
          this.particles.dust(e.x, e.y, 0, -0.5, this.dustColor(sim.bike.rearSurf), Math.min(14, Math.round(e.force * 2.2)), 0.3);
          this.audio.land(e.force);
          this.shake = Math.min(0.35, this.shake + e.force * 0.035);
          break;
        case 'scrape':
          if (this.clock - this.scrapeT > 0.05) {
            this.scrapeT = this.clock;
            this.particles.sparks(e.x, e.y, sim.bike.c.vx, 3);
            this.audio.scrape();
          }
          break;
        case 'crash':
          this.audio.crash();
          this.shake = 0.5;
          this.slowmo = 0.45;
          this.particles.dust(e.x, e.y, 0, -1, this.dustColor(sim.bike.rearSurf), 10, 0.35);
          break;
        case 'finish':
          this.audio.finish();
          this.particles.confetti(this.level.finishX, sim.bike.c.y - 2.5, 90);
          this.finishT = 0;
          break;
      }
    }
    ev.length = 0;
  }

  private dustColor(s: Surface): string {
    return SURF_DUST[s] ?? this.scene.biome.dust;
  }

  private emitFx(dt: number): void {
    const sim = this.sim, b = sim.bike;
    // осыпающиеся доски
    sim.world.props.forEach((p, i) => {
      if (p.def.type !== 'crumble') return;
      const seen = this.propSeen[i] ?? 0;
      if (p.touched >= 0 && seen === 0) { this.propSeen[i] = 1; this.audio.crack(); }
      if (p.touched > p.def.delay && seen < 2) { this.propSeen[i] = 2; this.particles.splinters(p.x, p.y, 7); }
    });
    if (sim.ragdoll && sim.ragdoll.thud > 900 && this.clock - this.scrapeT > 0.12) {
      this.scrapeT = this.clock;
      this.audio.thud();
      this.particles.dust(sim.ragdoll.x[2], sim.ragdoll.y[2] + 0.1, 0, -0.4, this.dustColor(b.rearSurf), 3, 0.2);
    }
    this.fxT += dt;
    if (this.fxT < 1 / 60) return;
    this.fxT = 0;
    if (b.rearContact) {
      const slip = b.rearSlip, as = Math.abs(slip);
      const cx = b.rw.x - b.rearNx * WHEEL_R, cy = b.rw.y - b.rearNy * WHEEL_R;
      const tx = -b.rearNy, ty = b.rearNx;
      const col = this.dustColor(b.rearSurf);
      const hard = b.rearSurf === 'rock' || b.rearSurf === 'metal' || b.rearSurf === 'wood' || b.rearSurf === 'ice';
      if (as > 1.2) {
        const k = 0.5;
        if (!hard) this.particles.roost(cx, cy, tx * slip * k + b.rearNx * 1.5, ty * slip * k + b.rearNy * 1.5, col, Math.min(4, Math.ceil(as * 0.35)));
        this.particles.dust(cx, cy, tx * slip * 0.25, ty * slip * 0.25 - 0.4, col, 1, hard ? 0.12 : 0.2);
      } else if (b.speed > 7 && !hard && this.rand() < 0.35) {
        this.particles.dust(cx, cy, -b.c.vx * 0.12, -0.3, col, 1, 0.14);
      }
    }
    if (b.frontContact && Math.abs(b.frontSlip) > 3 && this.rand() < 0.5) {
      this.particles.dust(b.fw.x, b.fw.y + WHEEL_R, 0, -0.3, this.dustColor(b.frontSurf), 1, 0.16);
    }
    if (!b.crashed && b.throttleS > 0.3 && this.rand() < 0.5) {
      const cs = Math.cos(b.c.a), sn = Math.sin(b.c.a);
      const ex = b.c.x + -0.72 * cs - -0.21 * sn, ey = b.c.y + -0.72 * sn + -0.21 * cs;
      this.particles.smoke(ex, ey, b.c.vx - cs * 2.5, b.c.vy - sn * 2.5 - 0.3);
    }
  }

  private updateCamera(dt: number): void {
    const sim = this.sim, b = sim.bike, v = this.view;
    let tx: number, ty: number;
    const base = this.scene.baseScale();
    let zoom = base * (1 - 0.22 * clamp((b.speed - 4) / 24, 0, 1));
    if (sim.ragdoll && sim.state === 'crashed') {
      tx = sim.ragdoll.x[2];
      ty = sim.ragdoll.y[2] - 0.6;
      zoom = base * 1.08;
    } else {
      tx = b.c.x + 2.4 + clamp(b.c.vx * 0.42, -5, 7.5);
      ty = b.c.y - 1.1 + clamp(b.c.vy * 0.16, -1.2, 2.6);
    }
    v.x += (tx - v.x) * (1 - Math.exp(-dt * 3.6));
    v.y += (ty - v.y) * (1 - Math.exp(-dt * 3.2));
    v.scale += (zoom - v.scale) * (1 - Math.exp(-dt * 1.8));
    this.shake *= Math.exp(-dt * 7);
  }

  private currentGhost(): GhostPose | null {
    const g = this.ghost, sim = this.sim;
    if (!g || sim.state === 'ready' || sim.state === 'finished') return null;
    const t = sim.time, n = g.length / 6;
    if (t > g[(n - 1) * 6]) return null;
    while (this.ghostIdx < n - 2 && g[(this.ghostIdx + 1) * 6] < t) this.ghostIdx++;
    while (this.ghostIdx > 0 && g[this.ghostIdx * 6] > t) this.ghostIdx--;
    const i = this.ghostIdx * 6;
    const t0 = g[i], t1 = g[i + 6];
    const k = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 0;
    const p = this.ghostPose;
    p.x = g[i + 1] + (g[i + 7] - g[i + 1]) * k;
    p.y = g[i + 2] + (g[i + 8] - g[i + 2]) * k;
    p.a = g[i + 3] + (g[i + 9] - g[i + 3]) * k;
    p.qr = g[i + 4];
    p.qf = g[i + 5];
    // не рисуем призрака вплотную к игроку
    if (Math.hypot(p.x - sim.bike.c.x, p.y - sim.bike.c.y) < 0.6) return null;
    return p;
  }
}
