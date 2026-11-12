/** Отрисовка мира: грунт, объекты, декор, разметка трассы, мотоцикл, эффекты. */
import type { Level, Poly, Surface } from '../levels/types';
import type { Sim } from '../sim/sim';
import { PLANK_T, type Prop, type World } from '../sim/world';
import { rng } from '../util';
import { Backdrop } from './backdrop';
import { drawBike, drawGhost, drawRagdoll } from './bikeart';
import { BIOMES, type Biome } from './biomes';
import { Ambient, type Particles } from './fx';

type G = CanvasRenderingContext2D;

export interface View { x: number; y: number; scale: number }
export interface GhostPose { x: number; y: number; a: number; qr: number; qf: number }

interface Run { surf: Surface; i0: number; i1: number }
interface ChainArt { pts: number[]; runs: Run[] }
interface Decor { x: number; y: number; kind: Biome['decor'][number]; s: number; v: number; flip: boolean }

const TURF_W: Partial<Record<Surface, number>> = { snow: 1.3, grass: 0.9, ice: 0.7, mud: 0.8, sand: 0.9 };

export class Scene {
  readonly biome: Biome;
  private g: G;
  private backdrop: Backdrop;
  private ambient: Ambient;
  private chains: ChainArt[] = [];
  private decor: Decor[] = [];
  /** Травинки: x, y, высота, наклон, оттенок. */
  private blades: Float32Array;
  private speck: CanvasPattern | null = null;
  private polyArt: { p: Poly; minX: number; maxX: number; minY: number; maxY: number; round: boolean; hang: boolean; seed: number }[] = [];
  w = 0;
  h = 0;
  dpr = 1;

  constructor(private canvas: HTMLCanvasElement, private level: Level, private world: World) {
    this.g = canvas.getContext('2d', { alpha: false })!;
    this.biome = BIOMES[level.biome];
    this.backdrop = new Backdrop(this.biome);
    this.ambient = new Ambient(this.biome.ambient, this.biome.ambientColor);
    const r = rng(level.seed);
    const blades: number[] = [];
    for (const c of level.chains) {
      const runs: Run[] = [];
      for (let i = 0; i < c.surf.length; i++) {
        const last = runs[runs.length - 1];
        if (last && last.surf === c.surf[i]) last.i1 = i + 1;
        else runs.push({ surf: c.surf[i], i0: i, i1: i + 1 });
      }
      this.chains.push({ pts: c.pts, runs });
      // декор и трава вдоль полосы
      let next = c.pts[0] + 2 + r() * 4;
      for (let i = 0; i < c.surf.length; i++) {
        const ax = c.pts[i * 2], ay = c.pts[i * 2 + 1], bx = c.pts[i * 2 + 2], by = c.pts[i * 2 + 3];
        const dx = bx - ax;
        if (dx < 0.05) continue;
        const slope = Math.abs((by - ay) / dx);
        const s = c.surf[i];
        if (this.biome.blades && (s === 'grass' || s === 'dirt') && slope < 1.2) {
          for (let x = ax + r() * 0.3; x < bx; x += s === 'grass' ? 0.16 + r() * 0.3 : 0.5 + r() * 1.6) {
            const t = (x - ax) / dx;
            blades.push(x, ay + (by - ay) * t, 0.1 + r() * 0.2, (r() - 0.5) * 0.16, Math.floor(r() * 3));
          }
        }
        while (next < bx) {
          if (next >= ax && slope < 0.55 && s !== 'ice' && s !== 'wood' && s !== 'metal' && s !== 'mud') {
            const t = (next - ax) / dx;
            const kind = this.biome.decor[Math.floor(r() * this.biome.decor.length)];
            this.decor.push({ x: next, y: ay + (by - ay) * t, kind, s: 0.75 + r() * 0.7, v: r(), flip: r() > 0.5 });
          }
          next += 2.5 + r() * 7;
        }
      }
    }
    this.blades = Float32Array.from(blades);
    level.polys.forEach((p, idx) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < p.pts.length; i += 2) {
        minX = Math.min(minX, p.pts[i]); maxX = Math.max(maxX, p.pts[i]);
        minY = Math.min(minY, p.pts[i + 1]); maxY = Math.max(maxY, p.pts[i + 1]);
      }
      const ground = world.rayDown((minX + maxX) / 2, maxY + 0.05, false);
      this.polyArt.push({
        p, minX, maxX, minY, maxY, seed: idx * 17 + 3,
        round: p.pts.length === 24 && p.style === 'wood',
        hang: p.style === 'rock' && p.pts.length === 8 && ground - maxY > 1.5,
      });
    });
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.backdrop.resize(w, h, dpr);
    // крапчатая текстура грунта
    const t = document.createElement('canvas');
    t.width = t.height = 128;
    const tg = t.getContext('2d')!;
    const r = rng(5);
    tg.fillStyle = this.biome.speck;
    for (let i = 0; i < 150; i++) {
      tg.globalAlpha = 0.15 + r() * 0.5;
      const s = 1 + r() * 3.2;
      tg.fillRect(r() * 128, r() * 128, s, s * (0.5 + r() * 0.6));
    }
    this.speck = this.g.createPattern(t, 'repeat');
    this.speck?.setTransform(new DOMMatrix().scale(5 / 128));
  }

  /** Масштаб, при котором в кадр помещается привычный участок трассы. */
  baseScale(): number {
    return Math.max(24, Math.min(this.w / 21, this.h / 10.5));
  }

  render(view: View, sim: Sim | null, particles: Particles | null, time: number, ghost: GhostPose | null): void {
    const g = this.g, w = this.w, h = this.h, s = view.scale;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.backdrop.draw(g, view.x, view.y, s, time);

    const left = view.x - w / 2 / s - 2, right = view.x + w / 2 / s + 2;
    const top = view.y - h / 2 / s - 2, bottom = view.y + h / 2 / s + 2;
    g.save();
    g.translate(w / 2 - view.x * s, h / 2 - view.y * s);
    g.scale(s, s);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    this.drawAbyss(g, left, right, bottom, time);
    this.drawDecor(g, left, right);
    for (const pa of this.polyArt) if (pa.hang && pa.maxX > left && pa.minX < right) this.drawHang(g, pa, top);
    for (const p of this.world.props) if (p.def.type === 'lift' && p.x + p.len > left && p.x - p.len < right) this.drawLiftBody(g, p, time);
    for (const c of this.chains) this.drawChain(g, c, left, right, top, bottom);
    for (const pa of this.polyArt) if (pa.maxX > left && pa.minX < right) this.drawPoly(g, pa);
    for (const p of this.world.props) if (!p.gone && p.x + p.len > left && p.x - p.len < right) this.drawProp(g, p, time);
    this.drawMarkers(g, sim, left, right, time);
    this.drawStars(g, sim, left, right, time);
    if (ghost) drawGhost(g, ghost.x, ghost.y, ghost.a, ghost.qr, ghost.qf);
    if (sim) {
      this.drawShadows(g, sim);
      drawBike(g, sim.bike);
      if (sim.ragdoll) drawRagdoll(g, sim.ragdoll);
    }
    particles?.draw(g);
    this.drawBlades(g, left, right, time);
    g.restore();

    this.ambient.draw(g, w, h, view.x, view.y, s, time);
    // свет и виньетка
    g.fillStyle = this.biome.light;
    g.fillRect(0, 0, w, h);
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, this.biome.vignette);
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }

  private drawAbyss(g: G, left: number, right: number, bottom: number, time: number): void {
    const ky = this.world.killY;
    if (bottom < ky - 20) return;
    const gr = g.createLinearGradient(0, ky - 20, 0, ky - 3);
    gr.addColorStop(0, this.biome.abyss[0]);
    gr.addColorStop(1, this.biome.abyss[1]);
    g.fillStyle = gr;
    g.fillRect(left, ky - 20, right - left, bottom - ky + 22);
    if (this.level.biome === 'volcano') {
      // поверхность лавы
      g.fillStyle = '#ffb347';
      g.beginPath();
      g.moveTo(left, bottom);
      for (let x = Math.floor(left); x <= right + 1; x += 0.5) g.lineTo(x, ky - 5 + Math.sin(x * 0.9 + time * 1.4) * 0.12 + Math.sin(x * 0.37 - time * 0.8) * 0.2);
      g.lineTo(right, bottom);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,240,170,0.5)';
      for (let x = Math.floor(left / 3) * 3; x < right; x += 3) {
        const ph = (x * 0.731 + time * 0.25) % 1;
        g.beginPath();
        g.arc(x + Math.sin(x) * 1.2, ky - 4.6 + ph * 0.4, 0.12 + (1 - ph) * 0.16, 0, 6.2832);
        g.fill();
      }
    }
  }

  private lower(arr: ArrayLike<number>, stride: number, x: number): number {
    let lo = 0, hi = arr.length / stride;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid * stride] < x) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  private drawChain(g: G, c: ChainArt, left: number, right: number, top: number, bottom: number): void {
    const p = c.pts, n = p.length / 2;
    if (p[0] > right || p[n * 2 - 2] < left) return;
    const i0 = Math.max(0, this.lower(p, 2, left) - 1);
    const i1 = Math.min(n - 1, this.lower(p, 2, right));
    if (i1 <= i0) return;
    const b = this.biome;
    g.save();
    g.beginPath();
    g.moveTo(p[i0 * 2], bottom);
    for (let i = i0; i <= i1; i++) g.lineTo(p[i * 2], p[i * 2 + 1]);
    g.lineTo(p[i1 * 2], bottom);
    g.closePath();
    const soil = g.createLinearGradient(0, top + 2, 0, bottom);
    soil.addColorStop(0, b.soil[0]);
    soil.addColorStop(1, b.soil[1]);
    g.fillStyle = soil;
    g.fill();
    g.clip();
    const strokeRange = (a: number, z: number, width: number, style: string | CanvasGradient): void => {
      g.beginPath();
      g.moveTo(p[a * 2], p[a * 2 + 1]);
      for (let i = a + 1; i <= z; i++) g.lineTo(p[i * 2], p[i * 2 + 1]);
      g.lineWidth = width;
      g.strokeStyle = style;
      g.stroke();
    };
    // пласты: широкая полоса, затем «стираем» её середину цветом грунта
    strokeRange(i0, i1, 7.4, b.strata[0]);
    strokeRange(i0, i1, 6.6, soil);
    strokeRange(i0, i1, 4.2, b.strata[1]);
    strokeRange(i0, i1, 3.5, soil);
    if (this.speck) {
      g.fillStyle = this.speck;
      g.fillRect(left, top, right - left, bottom - top);
    }
    strokeRange(i0, i1, 1.9, 'rgba(0,0,0,0.2)');
    for (const run of c.runs) {
      const a = Math.max(run.i0, i0), z = Math.min(run.i1, i1);
      if (z <= a) continue;
      const col = b.turf[run.surf] ?? ['#777', '#aaa'];
      g.lineCap = 'butt';
      strokeRange(a, z, TURF_W[run.surf] ?? 0.62, col[0]);
      strokeRange(a, z, 0.2, col[1]);
      if (run.surf === 'ice') strokeRange(a, z, 0.07, 'rgba(255,255,255,0.95)');
      g.lineCap = 'round';
    }
    g.restore();
  }

  private drawHang(g: G, pa: Scene['polyArt'][number], top: number): void {
    // свод: массив скалы уходит вверх за кадр
    const col = this.biome.turf.rock ?? ['#777', '#aaa'];
    const gr = g.createLinearGradient(0, pa.minY - 14, 0, pa.minY);
    gr.addColorStop(0, this.biome.soil[1]);
    gr.addColorStop(1, col[0]);
    g.fillStyle = gr;
    const y0 = Math.min(top, pa.minY - 30);
    g.beginPath();
    g.moveTo(pa.minX + 0.2, pa.minY + 0.1);
    g.lineTo(pa.minX - 2.6, y0);
    g.lineTo(pa.maxX + 2.6, y0);
    g.lineTo(pa.maxX - 0.2, pa.minY + 0.1);
    g.closePath();
    g.fill();
  }

  private drawPoly(g: G, pa: Scene['polyArt'][number]): void {
    const p = pa.p.pts, b = this.biome;
    const r = rng(pa.seed);
    const cx = (pa.minX + pa.maxX) / 2, cy = (pa.minY + pa.maxY) / 2;
    if (pa.round) {
      // торец бревна
      const rad = (pa.maxX - pa.minX) / 2;
      g.fillStyle = '#5b3d22';
      g.beginPath(); g.arc(cx, cy, rad, 0, 6.2832); g.fill();
      g.fillStyle = '#c99a5e';
      g.beginPath(); g.arc(cx, cy, rad * 0.84, 0, 6.2832); g.fill();
      g.strokeStyle = 'rgba(120,80,40,0.55)';
      g.lineWidth = 0.018;
      for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(cx + 0.01 * k, cy, rad * 0.2 * k, 0, 6.2832); g.stroke(); }
      g.strokeStyle = 'rgba(70,40,20,0.6)';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + rad * 0.7, cy - rad * 0.3); g.stroke();
      return;
    }
    const path = (): void => {
      g.beginPath();
      g.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
      g.closePath();
    };
    const gr = g.createLinearGradient(0, pa.minY, 0, pa.maxY);
    let edge = 'rgba(0,0,0,0.4)';
    switch (pa.p.style) {
      case 'wood': gr.addColorStop(0, '#b98950'); gr.addColorStop(1, '#6f4a28'); edge = '#4a2f18'; break;
      case 'metal': gr.addColorStop(0, '#8d97a5'); gr.addColorStop(1, '#474e59'); edge = '#2b3038'; break;
      case 'ice': gr.addColorStop(0, 'rgba(214,244,255,0.95)'); gr.addColorStop(1, 'rgba(96,170,214,0.9)'); edge = 'rgba(40,100,150,0.7)'; break;
      default: {
        const col = b.turf.rock ?? ['#777', '#aaa'];
        gr.addColorStop(0, col[1]); gr.addColorStop(0.35, col[0]); gr.addColorStop(1, b.soil[1]);
      }
    }
    path();
    g.fillStyle = gr;
    g.fill();
    g.save();
    path();
    g.clip();
    if (pa.p.style === 'wood') {
      g.strokeStyle = 'rgba(60,36,16,0.35)';
      g.lineWidth = 0.02;
      for (let y = pa.minY + 0.07; y < pa.maxY; y += 0.11 + r() * 0.05) {
        g.beginPath(); g.moveTo(pa.minX, y); g.lineTo(pa.maxX, y + (r() - 0.5) * 0.05); g.stroke();
      }
    } else if (pa.p.style === 'ice') {
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 0.03;
      for (let k = 0; k < 4; k++) {
        const x = pa.minX + r() * (pa.maxX - pa.minX);
        g.beginPath(); g.moveTo(x, pa.minY); g.lineTo(x + (r() - 0.5) * 0.8, pa.maxY); g.stroke();
      }
    } else if (pa.p.style === 'rock') {
      g.strokeStyle = 'rgba(0,0,0,0.16)';
      g.lineWidth = 0.035;
      const n = Math.max(2, Math.round((pa.maxX - pa.minX) / 1.4));
      for (let k = 0; k < n; k++) {
        const x = pa.minX + r() * (pa.maxX - pa.minX), y = pa.minY + r() * (pa.maxY - pa.minY) * 0.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 0.7, y + 0.2 + r() * 0.5); g.lineTo(x + (r() - 0.5) * 0.9, y + 0.5 + r() * 0.6); g.stroke();
      }
      if (this.speck) { g.fillStyle = this.speck; g.fillRect(pa.minX, pa.minY, pa.maxX - pa.minX, pa.maxY - pa.minY); }
    }
    g.restore();
    path();
    g.strokeStyle = edge;
    g.lineWidth = 0.05;
    g.stroke();
    // блик по верхним рёбрам
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 0.04;
    g.beginPath();
    const m = p.length / 2;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      if (p[j * 2] - p[i * 2] > 0.05) { g.moveTo(p[i * 2], p[i * 2 + 1] + 0.03); g.lineTo(p[j * 2], p[j * 2 + 1] + 0.03); }
    }
    g.stroke();
  }

  private drawProp(g: G, p: Prop, time: number): void {
    const d = p.def, h = p.len / 2, t = PLANK_T / 2;
    if (d.type === 'seesaw') {
      const gy = this.world.topY(d.x);
      g.fillStyle = '#3d424d';
      g.beginPath();
      g.moveTo(d.x, d.y - 0.06); g.lineTo(d.x + 0.42, gy + 0.05); g.lineTo(d.x - 0.42, gy + 0.05);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath(); g.moveTo(d.x, d.y - 0.06); g.lineTo(d.x + 0.1, gy + 0.05); g.lineTo(d.x - 0.42, gy + 0.05); g.closePath(); g.fill();
    } else if (d.type === 'lift') {
      // направляющая и опорные башмаки
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = 0.05;
      g.setLineDash([0.3, 0.3]);
      g.beginPath(); g.moveTo(d.x, d.y + 0.2); g.lineTo(d.x2, d.y2 + 0.2); g.stroke();
      g.setLineDash([]);
    }
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.a);
    if (d.type === 'lift') {
      g.fillStyle = '#737d8b';
      g.fillRect(-h, -t, p.len, PLANK_T);
      // предупреждающая разметка
      g.save();
      g.beginPath(); g.rect(-h, -t, p.len, PLANK_T); g.clip();
      g.fillStyle = '#ffd23a';
      for (let x = -h - 0.2; x < h; x += 0.5) {
        g.beginPath(); g.moveTo(x, t); g.lineTo(x + 0.25, t); g.lineTo(x + 0.41, -t); g.lineTo(x + 0.16, -t); g.closePath(); g.fill();
      }
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-h, -t, p.len, 0.03);
    } else {
      const crumble = d.type === 'crumble';
      const gr = g.createLinearGradient(0, -t, 0, t);
      gr.addColorStop(0, crumble ? '#a98458' : '#c79a5c');
      gr.addColorStop(1, crumble ? '#5d4126' : '#7a5530');
      g.fillStyle = gr;
      g.fillRect(-h, -t, p.len, PLANK_T);
      g.strokeStyle = 'rgba(50,30,14,0.55)';
      g.lineWidth = 0.02;
      g.beginPath(); g.moveTo(-h, 0.01); g.lineTo(h, -0.01); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(-h, -t, p.len, 0.025);
      g.fillStyle = '#2b2f36';
      for (const x of [-h + 0.12, h - 0.12]) { g.beginPath(); g.arc(x, 0, 0.03, 0, 6.2832); g.fill(); }
      if (crumble) {
        // трещины
        g.strokeStyle = 'rgba(30,16,6,0.7)';
        g.lineWidth = 0.022;
        g.beginPath();
        g.moveTo(-h * 0.3, -t); g.lineTo(-h * 0.22, 0); g.lineTo(-h * 0.34, t);
        g.moveTo(h * 0.45, -t); g.lineTo(h * 0.38, -0.01); g.lineTo(h * 0.5, t);
        g.stroke();
      } else {
        // цветные концы качелей
        g.fillStyle = '#e8483a';
        g.fillRect(-h, -t, 0.3, PLANK_T);
        g.fillRect(h - 0.3, -t, 0.3, PLANK_T);
        g.fillStyle = '#2b2f36';
        g.beginPath(); g.arc(0, 0.02, 0.07, 0, 6.2832); g.fill();
      }
    }
    g.restore();
  }

  private drawLiftBody(g: G, p: Prop, time: number): void {
    const h = p.len / 2, t = PLANK_T / 2;
    g.save();
    g.translate(p.x, p.y);
      g.fillStyle = '#2b3038';
      g.fillRect(-h + 0.2, t, p.len - 0.4, 0.26);
      // сопла-огни
      const glow = 0.55 + 0.45 * Math.sin(time * 9);
      g.fillStyle = `rgba(120,220,255,${0.5 + glow * 0.4})`;
      g.fillRect(-h + 0.5, t + 0.26, 0.5, 0.08);
      g.fillRect(h - 1.0, t + 0.26, 0.5, 0.08);
      g.fillStyle = `rgba(120,220,255,${0.12 * glow})`;
      g.beginPath(); g.moveTo(-h + 0.5, t + 0.34); g.lineTo(-h + 1, t + 0.34); g.lineTo(-h + 0.75, t + 1.2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(h - 1, t + 0.34); g.lineTo(h - 0.5, t + 0.34); g.lineTo(h - 0.75, t + 1.2); g.closePath(); g.fill();
    g.restore();
  }

  private flag(g: G, x: number, y: number, hgt: number, color: string, time: number, checkered: boolean): void {
    g.strokeStyle = '#d9dee6';
    g.lineWidth = 0.07;
    g.beginPath(); g.moveTo(x, y + 0.1); g.lineTo(x, y - hgt); g.stroke();
    g.fillStyle = '#2b2f36';
    g.fillRect(x - 0.16, y - 0.05, 0.32, 0.12);
    const fw = checkered ? 1.5 : 1.0, fh = checkered ? 0.9 : 0.6;
    const cols = checkered ? 6 : 5, rows = checkered ? 4 : 1;
    const wave = (u: number): number => Math.sin(u * 5 - time * 6) * 0.07 * u;
    for (let c = 0; c < cols; c++) {
      for (let rw = 0; rw < rows; rw++) {
        const u0 = c / cols, u1 = (c + 1) / cols, v0 = rw / rows, v1 = (rw + 1) / rows;
        g.fillStyle = checkered ? ((c + rw) % 2 ? '#15171b' : '#f4f6fa') : color;
        const taper = checkered ? 0 : 0.5;
        g.beginPath();
        g.moveTo(x + u0 * fw, y - hgt + v0 * fh + wave(u0) + (taper * fh * u0) / 2);
        g.lineTo(x + u1 * fw + 0.01, y - hgt + v0 * fh + wave(u1) + (taper * fh * u1) / 2);
        g.lineTo(x + u1 * fw + 0.01, y - hgt + v1 * fh + wave(u1) - (taper * fh * u1) / 2);
        g.lineTo(x + u0 * fw, y - hgt + v1 * fh + wave(u0) - (taper * fh * u0) / 2);
        g.closePath();
        g.fill();
      }
    }
  }

  private drawMarkers(g: G, sim: Sim | null, left: number, right: number, time: number): void {
    const l = this.level;
    l.checkpoints.forEach((x, i) => {
      if (x < left || x > right) return;
      const reached = sim ? sim.cpIndex > i : false;
      this.flag(g, x, this.world.topY(x), 2.5, reached ? this.biome.accent : 'rgba(235,240,248,0.75)', time + i, false);
    });
    if (l.finishX > left && l.finishX < right) this.flag(g, l.finishX, this.world.topY(l.finishX), 3.2, '#fff', time, true);
  }

  private drawStars(g: G, sim: Sim | null, left: number, right: number, time: number): void {
    this.level.stars.forEach((st, i) => {
      if (st.x < left || st.x > right || (sim && sim.starTaken[i])) return;
      const y = st.y + Math.sin(time * 2.2 + i * 1.7) * 0.12;
      const glow = g.createRadialGradient(st.x, y, 0, st.x, y, 1.1);
      glow.addColorStop(0, 'rgba(255,225,120,0.55)');
      glow.addColorStop(1, 'rgba(255,225,120,0)');
      g.fillStyle = glow;
      g.fillRect(st.x - 1.1, y - 1.1, 2.2, 2.2);
      g.save();
      g.translate(st.x, y);
      g.rotate(Math.sin(time * 1.3 + i) * 0.25);
      g.scale(Math.cos(time * 2 + i) * 0.25 + 0.85, 1);
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 ? 0.17 : 0.4;
        g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      g.closePath();
      g.fillStyle = '#ffd23a';
      g.fill();
      g.strokeStyle = '#fff6c8';
      g.lineWidth = 0.05;
      g.stroke();
      g.restore();
    });
  }

  private drawShadows(g: G, sim: Sim): void {
    const b = sim.bike, w = this.world;
    const one = (x: number, y: number, size: number): void => {
      const gy = w.rayDown(x, y - 0.2);
      if (Number.isNaN(gy)) return;
      const hgt = gy - y;
      const k = Math.max(0, 1 - hgt / 7);
      if (k <= 0) return;
      g.save();
      g.translate(x, gy);
      g.rotate(Math.atan2(w.hitNx, -w.hitNy));
      g.fillStyle = `rgba(0,0,0,${0.3 * k})`;
      g.beginPath();
      g.ellipse(0, 0.02, size * (0.6 + 0.4 * k), 0.07, 0, 0, 6.2832);
      g.fill();
      g.restore();
    };
    one(b.rw.x, b.rw.y, 0.42);
    one(b.fw.x, b.fw.y, 0.42);
    one(b.c.x, b.c.y, 0.6);
  }

  private drawDecor(g: G, left: number, right: number): void {
    const tint = this.biome.decorTint;
    for (const d of this.decor) {
      if (d.x < left - 4 || d.x > right + 4) continue;
      g.save();
      g.translate(d.x, d.y + 0.12);
      g.scale(d.flip ? -d.s : d.s, d.s);
      switch (d.kind) {
        case 'pine': {
          const hgt = 3.2 + d.v * 2.6;
          g.fillStyle = '#4a3423';
          g.fillRect(-0.09, -hgt * 0.3, 0.18, hgt * 0.3 + 0.1);
          for (let k = 0; k < 5; k++) {
            const y0 = -hgt + (k * hgt * 0.78) / 5, wd = 0.35 + k * 0.24;
            g.fillStyle = k % 2 ? tint : this.shade(tint, 18);
            g.beginPath();
            g.moveTo(0, y0 - hgt * 0.06); g.lineTo(wd, y0 + hgt * 0.25); g.lineTo(wd * 0.35, y0 + hgt * 0.2);
            g.lineTo(-wd * 0.35, y0 + hgt * 0.2); g.lineTo(-wd, y0 + hgt * 0.25);
            g.closePath(); g.fill();
          }
          if (this.level.biome === 'glacier') {
            g.fillStyle = 'rgba(255,255,255,0.8)';
            g.beginPath(); g.moveTo(0, -hgt - hgt * 0.06); g.lineTo(0.3, -hgt + hgt * 0.16); g.lineTo(-0.3, -hgt + hgt * 0.16); g.closePath(); g.fill();
          }
          break;
        }
        case 'bush':
          g.fillStyle = tint;
          for (const [bx, by, br] of [[-0.35, -0.25, 0.38], [0.1, -0.4, 0.46], [0.5, -0.22, 0.34]]) { g.beginPath(); g.arc(bx, by, br, 0, 6.2832); g.fill(); }
          g.fillStyle = this.shade(tint, 26);
          g.beginPath(); g.arc(0.02, -0.5, 0.26, 0, 6.2832); g.fill();
          break;
        case 'rock': {
          const col = this.biome.turf.rock ?? ['#777', '#aaa'];
          g.fillStyle = this.shade(col[0], -30);
          g.beginPath();
          g.moveTo(-0.6, 0.1); g.lineTo(-0.45, -0.35 - d.v * 0.3); g.lineTo(0.05, -0.55 - d.v * 0.4); g.lineTo(0.5, -0.3); g.lineTo(0.66, 0.1);
          g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.14)';
          g.beginPath(); g.moveTo(-0.45, -0.35 - d.v * 0.3); g.lineTo(0.05, -0.55 - d.v * 0.4); g.lineTo(-0.1, -0.1); g.closePath(); g.fill();
          break;
        }
        case 'cactus': {
          const hgt = 1.5 + d.v * 1.3;
          g.strokeStyle = '#3f6f4a';
          g.lineWidth = 0.3;
          g.beginPath();
          g.moveTo(0, 0); g.lineTo(0, -hgt);
          g.moveTo(0, -hgt * 0.45); g.lineTo(-0.45, -hgt * 0.45); g.lineTo(-0.45, -hgt * 0.8);
          g.moveTo(0, -hgt * 0.6); g.lineTo(0.42, -hgt * 0.6); g.lineTo(0.42, -hgt * 0.95);
          g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.14)';
          g.lineWidth = 0.05;
          g.beginPath(); g.moveTo(-0.06, 0); g.lineTo(-0.06, -hgt); g.stroke();
          break;
        }
        case 'deadtree': {
          const hgt = 2.2 + d.v * 1.6;
          g.strokeStyle = this.shade(tint, -8);
          g.lineWidth = 0.16;
          g.beginPath();
          g.moveTo(0, 0.1); g.lineTo(0.05, -hgt * 0.55); g.lineTo(-0.1, -hgt);
          g.stroke();
          g.lineWidth = 0.08;
          g.beginPath();
          g.moveTo(0.04, -hgt * 0.5); g.lineTo(0.6, -hgt * 0.85);
          g.moveTo(0.02, -hgt * 0.35); g.lineTo(-0.55, -hgt * 0.62);
          g.moveTo(0.3, -hgt * 0.68); g.lineTo(0.35, -hgt * 0.95);
          g.stroke();
          break;
        }
        case 'icespike': {
          const hgt = 1 + d.v * 1.8;
          const gr = g.createLinearGradient(0, -hgt, 0, 0);
          gr.addColorStop(0, 'rgba(235,250,255,0.95)');
          gr.addColorStop(1, 'rgba(110,180,220,0.9)');
          g.fillStyle = gr;
          g.beginPath();
          g.moveTo(-0.45, 0.1); g.lineTo(-0.15, -hgt); g.lineTo(0.12, -hgt * 0.4); g.lineTo(0.3, -hgt * 0.75); g.lineTo(0.6, 0.1);
          g.closePath(); g.fill();
          break;
        }
        case 'basalt': {
          for (let k = 0; k < 4; k++) {
            const hh = 0.8 + ((d.v * 7 + k * 0.37) % 1) * 1.6;
            g.fillStyle = k % 2 ? '#2a2026' : '#362a32';
            g.fillRect(-0.7 + k * 0.36, -hh, 0.34, hh + 0.1);
            g.fillStyle = 'rgba(255,120,60,0.16)';
            g.fillRect(-0.7 + k * 0.36, -hh, 0.34, 0.06);
          }
          break;
        }
        case 'flower': {
          g.strokeStyle = '#3f8a32';
          g.lineWidth = 0.03;
          const cols = ['#ffffff', '#ffd23a', '#e86fa8', '#8fb3ff'];
          for (let k = 0; k < 3; k++) {
            const fx = -0.25 + k * 0.25, fh = 0.28 + ((d.v * 5 + k * 0.3) % 1) * 0.25;
            g.beginPath(); g.moveTo(fx, 0); g.lineTo(fx + 0.03, -fh); g.stroke();
            g.fillStyle = cols[Math.floor(d.v * 97 + k) % cols.length];
            g.beginPath(); g.arc(fx + 0.03, -fh, 0.065, 0, 6.2832); g.fill();
          }
          break;
        }
      }
      g.restore();
    }
  }

  private drawBlades(g: G, left: number, right: number, time: number): void {
    const b = this.blades, cols = this.biome.blades;
    if (!cols || !b.length) return;
    const i0 = this.lower(b, 5, left), i1 = this.lower(b, 5, right);
    for (let c = 0; c < 3; c++) {
      g.fillStyle = cols[c];
      g.beginPath();
      for (let i = i0; i < i1; i++) {
        if (b[i * 5 + 4] !== c) continue;
        const x = b[i * 5], y = b[i * 5 + 1], hgt = b[i * 5 + 2];
        const sway = b[i * 5 + 3] + Math.sin(time * 1.8 + x * 0.7) * 0.035;
        g.moveTo(x - 0.035, y + 0.03);
        g.lineTo(x + sway, y - hgt);
        g.lineTo(x + 0.035, y + 0.03);
      }
      g.fill();
    }
  }

  private shadeCache = new Map<string, string>();
  private shade(hex: string, d: number): string {
    const key = hex + d;
    let v = this.shadeCache.get(key);
    if (!v) {
      const n = parseInt(hex.slice(1), 16);
      const f = (c: number): number => Math.max(0, Math.min(255, c + d));
      v = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
      this.shadeCache.set(key, v);
    }
    return v;
  }
}
