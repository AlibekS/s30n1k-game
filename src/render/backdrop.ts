/** Небо и параллакс-слои: всё рисуется один раз во внеэкранные холсты и затем прокручивается. */
import { rng } from '../util';
import type { Biome, LayerDef } from './biomes';

interface Layer { def: LayerDef; canvas: HTMLCanvasElement; tw: number }
interface Cloud { canvas: HTMLCanvasElement; x: number; y: number; speed: number; scale: number }

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Периодический по u∈[0,1) шум из гармоник с целыми частотами. */
function ridge(seed: number, ridged: boolean): (u: number) => number {
  const r = rng(seed);
  const ks = [1, 2, 3, 5, 8, 13, 21, 34];
  const ph = ks.map(() => r());
  const am = ks.map((k) => (0.6 + r() * 0.8) / Math.pow(k, ridged ? 0.95 : 1.25));
  const norm = am.reduce((a, b) => a + b, 0);
  return (u) => {
    let v = 0;
    for (let i = 0; i < ks.length; i++) {
      const t = ks[i] * u + ph[i];
      v += am[i] * (ridged ? 1 - 2 * Math.abs(Math.sin(Math.PI * t)) : Math.sin(2 * Math.PI * t));
    }
    return v / norm;
  };
}

export class Backdrop {
  private sky: HTMLCanvasElement | null = null;
  private layers: Layer[] = [];
  private clouds: Cloud[] = [];
  private w = 0;
  private h = 0;

  constructor(private biome: Biome) {}

  resize(w: number, h: number, dpr: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const q = Math.min(dpr, 1.5);
    this.buildSky(w, h, q);
    this.layers = this.biome.layers.map((def) => this.buildLayer(def, w, h, q));
    if (!this.clouds.length) this.buildClouds();
  }

  private buildSky(w: number, h: number, q: number): void {
    const b = this.biome;
    const c = makeCanvas(w * q, h * q);
    const g = c.getContext('2d')!;
    g.scale(q, q);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, b.sky[0]);
    grad.addColorStop(0.55, b.sky[1]);
    grad.addColorStop(1, b.sky[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const r = rng(991);
    for (let i = 0; i < b.stars; i++) {
      const x = r() * w, y = r() * h * 0.6, s = 0.4 + r() * 1.1;
      g.globalAlpha = (0.25 + r() * 0.75) * (1 - y / (h * 0.62));
      g.fillStyle = r() > 0.85 ? '#ffe9c4' : '#ffffff';
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    if (b.aurora) {
      g.save();
      g.filter = 'blur(14px)';
      g.globalCompositeOperation = 'screen';
      b.aurora.forEach((col, k) => {
        const y0 = h * (0.12 + k * 0.1);
        const gr = g.createLinearGradient(0, y0 - h * 0.1, 0, y0 + h * 0.26);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(0.35, col);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0, y0);
        for (let x = 0; x <= w; x += 24) g.lineTo(x, y0 + Math.sin(x * 0.006 + k * 2) * h * 0.06 + Math.sin(x * 0.017 + k) * h * 0.02);
        for (let x = w; x >= 0; x -= 24) g.lineTo(x, y0 + h * 0.2 + Math.sin(x * 0.008 + k * 3) * h * 0.07);
        g.closePath();
        g.fill();
      });
      g.restore();
    }
    if (b.sun) {
      const sx = b.sun.x * w, sy = b.sun.y * h, sr = b.sun.r * Math.min(w, h * 1.6);
      g.globalCompositeOperation = 'screen';
      const halo = g.createRadialGradient(sx, sy, 0, sx, sy, sr * 7);
      halo.addColorStop(0, b.sun.glow + '0.55)');
      halo.addColorStop(0.25, b.sun.glow + '0.22)');
      halo.addColorStop(1, b.sun.glow + '0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
      const core = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
      core.addColorStop(0, b.sun.core);
      core.addColorStop(0.8, b.sun.core);
      core.addColorStop(1, b.sun.glow + '0)');
      g.fillStyle = core;
      g.beginPath();
      g.arc(sx, sy, sr, 0, Math.PI * 2);
      g.fill();
    }
    this.sky = c;
  }

  private buildLayer(def: LayerDef, w: number, h: number, q: number): Layer {
    const tw = Math.max(1500, Math.ceil(w * 1.2));
    const c = makeCanvas(tw * q, h * q);
    const g = c.getContext('2d')!;
    g.scale(q, q);
    const f = ridge(def.seed, def.kind === 'peaks');
    const f2 = ridge(def.seed + 100, false);
    const r = rng(def.seed * 7 + 1);
    const baseY = def.base * h, amp = def.amp * h;
    let cones: { x: number; hgt: number; half: number }[] = [];
    if (def.kind === 'cones') {
      cones = [
        { x: tw * 0.3, hgt: amp * 1.25, half: amp * 2.1 },
        { x: tw * 0.72, hgt: amp * 0.8, half: amp * 1.5 },
      ];
    }
    const yAt = (x: number): number => {
      const u = ((x % tw) + tw) % tw / tw;
      let v = f(u);
      if (def.kind === 'mesa') {
        const s = f2(u) * 0.5 + 0.5;
        const steps = 4;
        const qv = Math.round(s * steps) / steps;
        v = (qv * 0.85 + s * 0.15) * 2 - 1 + f(u) * 0.06;
      } else if (def.kind === 'hills' || def.kind === 'pines') {
        v = f2(u);
      }
      let y = baseY - v * amp * 0.5;
      for (const cn of cones) {
        let dx = Math.abs(x - cn.x);
        dx = Math.min(dx, tw - dx);
        const top = baseY - cn.hgt;
        const cy = Math.max(top + cn.hgt * 0.08, baseY - cn.hgt * (1 - dx / cn.half) * 1.05);
        y = Math.min(y, cy + f(u) * amp * 0.03);
      }
      return y;
    };
    const path = (): void => {
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= tw; x += 3) g.lineTo(x, yAt(x));
      g.lineTo(tw, h);
      g.closePath();
    };
    // свечение кратеров рисуем под силуэтом
    for (const cn of cones) {
      const top = baseY - cn.hgt;
      for (const ox of [-tw, 0, tw]) {
        const gl = g.createRadialGradient(cn.x + ox, top, 0, cn.x + ox, top, cn.hgt * 1.1);
        gl.addColorStop(0, 'rgba(255,170,70,0.85)');
        gl.addColorStop(0.3, 'rgba(255,90,30,0.35)');
        gl.addColorStop(1, 'rgba(255,60,20,0)');
        g.fillStyle = gl;
        g.fillRect(cn.x + ox - cn.hgt * 1.2, top - cn.hgt * 1.2, cn.hgt * 2.4, cn.hgt * 2.4);
      }
    }
    const grad = g.createLinearGradient(0, baseY - amp * 0.6, 0, Math.min(h, baseY + amp * 1.3 + h * 0.12));
    grad.addColorStop(0, def.top);
    grad.addColorStop(1, def.bottom);
    if (def.kind === 'pines') {
      // зубчатая кромка леса: ёлки разной высоты вдоль линии холмов
      g.fillStyle = grad;
      path();
      g.fill();
      const scale = 0.5 + def.parallax * 3.2;
      let x = 0;
      while (x < tw) {
        const th = (22 + r() * 34) * scale, half = th * (0.2 + r() * 0.06);
        for (const ox of [-tw, 0, tw]) {
          const bx = x + ox, by = yAt(x) + 3;
          g.beginPath();
          const tiers = 4;
          g.moveTo(bx, by - th);
          for (let t = 1; t <= tiers; t++) {
            const ty = by - th + (th * t) / tiers;
            g.lineTo(bx + half * (t / tiers) * 1.15, ty);
            g.lineTo(bx + half * (t / tiers) * 0.55, ty - th * 0.03);
          }
          for (let t = tiers; t >= 1; t--) {
            const ty = by - th + (th * t) / tiers;
            g.lineTo(bx - half * (t / tiers) * 0.55, ty - th * 0.03);
            g.lineTo(bx - half * (t / tiers) * 1.15, ty);
          }
          g.closePath();
          g.fill();
        }
        x += (7 + r() * 16) * scale;
      }
    } else {
      g.fillStyle = grad;
      path();
      g.fill();
      g.save();
      path();
      g.clip();
      if (def.kind === 'peaks' || def.kind === 'cones') {
        // теневые грани от каждой вершины
        let prev = yAt(-6), cur = yAt(0);
        for (let x = 0; x < tw; x += 6) {
          const next = yAt(x + 6);
          if (cur < prev && cur <= next && baseY - cur > amp * 0.05) {
            const hgt = (h - cur) * 0.9;
            const sh = g.createLinearGradient(x, cur, x + hgt * 0.4, cur + hgt * 0.7);
            sh.addColorStop(0, 'rgba(0,10,40,0.3)');
            sh.addColorStop(1, 'rgba(0,10,40,0)');
            g.fillStyle = sh;
            g.beginPath();
            g.moveTo(x, cur);
            g.lineTo(x + hgt * 0.75, cur + hgt);
            g.lineTo(x - hgt * 0.08, cur + hgt);
            g.closePath();
            g.fill();
          }
          prev = cur;
          cur = next;
        }
      }
      if (def.kind === 'mesa') {
        // горизонтальные пласты песчаника
        for (let i = 0; i < 9; i++) {
          g.fillStyle = i % 2 ? 'rgba(255,220,170,0.07)' : 'rgba(60,10,10,0.09)';
          const y = baseY - amp * 0.5 + (i / 9) * amp * 1.4 + r() * 6;
          g.fillRect(0, y, tw, 3 + r() * 9);
        }
      }
      if (def.snow) {
        const snowY = baseY - amp * 0.02;
        g.fillStyle = def.snow;
        g.beginPath();
        g.moveTo(0, 0);
        for (let x = 0; x <= tw; x += 7) {
          const u = x / tw;
          g.lineTo(x, snowY - amp * 0.13 + f2(u * 1) * amp * 0.1 + ((x / 7) % 2 ? amp * 0.07 : 0) + Math.abs(f(u)) * amp * 0.1);
        }
        g.lineTo(tw, 0);
        g.closePath();
        g.globalAlpha = 0.92;
        g.fill();
        g.globalAlpha = 1;
      }
      g.restore();
    }
    return { def, canvas: c, tw };
  }

  private buildClouds(): void {
    const r = rng(404);
    for (let i = 0; i < this.biome.clouds; i++) {
      const cw = 360, chh = 130;
      const c = makeCanvas(cw, chh);
      const g = c.getContext('2d')!;
      const n = 7 + Math.floor(r() * 6);
      for (let k = 0; k < n; k++) {
        const x = cw * (0.18 + r() * 0.64), y = chh * (0.45 + r() * 0.25), rad = 26 + r() * 40;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, this.biome.cloud);
        gr.addColorStop(1, this.biome.cloud.replace(/[\d.]+\)$/, '0)'));
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      this.clouds.push({ canvas: c, x: r(), y: 0.05 + r() * 0.34, speed: 4 + r() * 9, scale: 0.7 + r() * 1.1 });
    }
  }

  draw(g: CanvasRenderingContext2D, camX: number, camY: number, scale: number, time: number): void {
    const w = this.w, h = this.h;
    if (this.sky) g.drawImage(this.sky, 0, 0, w, h);
    for (const c of this.clouds) {
      const cw = 360 * c.scale, span = w + cw * 2;
      const x = ((((c.x * span + time * c.speed - camX * scale * 0.02) % span) + span) % span) - cw;
      g.drawImage(c.canvas, x, c.y * h, cw, 130 * c.scale);
    }
    for (const l of this.layers) {
      const off = (((camX * scale * l.def.parallax) % l.tw) + l.tw) % l.tw;
      const dy = Math.max(-h * 0.08, Math.min(h * 0.12, -camY * scale * l.def.parallax * 0.35));
      for (let x = -off; x < w; x += l.tw) g.drawImage(l.canvas, x, dy, l.tw, h);
      // всё, что ниже сдвинутого слоя, заливаем его нижним цветом
      if (dy < 0) {
        g.fillStyle = l.def.bottom;
        g.fillRect(0, h + dy - 1, w, -dy + 2);
      }
    }
    // дымка у горизонта
    const hz = g.createLinearGradient(0, h * 0.45, 0, h);
    hz.addColorStop(0, this.biome.haze + '0)');
    hz.addColorStop(1, this.biome.haze + '0.32)');
    g.fillStyle = hz;
    g.fillRect(0, h * 0.45, w, h * 0.55);
  }
}
