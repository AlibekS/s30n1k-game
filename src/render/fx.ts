/** Частицы в мировых координатах и «погодные» частицы в экранных. */
import { rng } from '../util';

type G = CanvasRenderingContext2D;

const enum Kind { Dust, Chunk, Spark, Smoke, Sparkle, Confetti, Splinter }

interface Particle {
  kind: Kind;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; rot: number; vr: number;
  color: string;
}

const CONFETTI = ['#ff5b1f', '#ffd23a', '#2f86ea', '#6cc04a', '#f4f6fa', '#e84a8a'];

export class Particles {
  private list: Particle[] = [];
  private r = rng(12345);

  clear(): void { this.list.length = 0; }

  private add(kind: Kind, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string): void {
    if (this.list.length > 700) this.list.shift();
    const r = this.r;
    this.list.push({ kind, x, y, vx, vy, life, max: life, size, rot: r() * 6.28, vr: (r() - 0.5) * 12, color });
  }

  /** Мягкое облако пыли. rgb — строка "r,g,b". */
  dust(x: number, y: number, vx: number, vy: number, rgb: string, n = 1, size = 0.22): void {
    const r = this.r;
    for (let i = 0; i < n; i++) {
      this.add(Kind.Dust, x + (r() - 0.5) * 0.2, y + (r() - 0.5) * 0.1, vx + (r() - 0.5) * 1.2, vy - r() * 0.8, 0.5 + r() * 0.6, size * (0.7 + r() * 0.7), rgb);
    }
  }

  /** Комья грунта из-под колеса. */
  roost(x: number, y: number, vx: number, vy: number, rgb: string, n: number): void {
    const r = this.r;
    for (let i = 0; i < n; i++) {
      const k = 0.4 + r() * 0.9;
      this.add(Kind.Chunk, x, y, vx * k + (r() - 0.5) * 1.5, vy * k - 1 - r() * 3, 0.5 + r() * 0.6, 0.025 + r() * 0.04, rgb);
    }
  }

  sparks(x: number, y: number, vx: number, n: number): void {
    const r = this.r;
    for (let i = 0; i < n; i++) {
      this.add(Kind.Spark, x, y, vx * (0.2 + r() * 0.6) + (r() - 0.5) * 4, -1 - r() * 5, 0.2 + r() * 0.35, 0.02, '#ffd27a');
    }
  }

  smoke(x: number, y: number, vx: number, vy: number): void {
    this.add(Kind.Smoke, x, y, vx, vy, 0.5 + this.r() * 0.4, 0.08, '200,205,215');
  }

  sparkle(x: number, y: number, color: string, n = 16): void {
    const r = this.r;
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, s = 2 + r() * 5;
      this.add(Kind.Sparkle, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + r() * 0.5, 0.05 + r() * 0.06, color);
    }
  }

  confetti(x: number, y: number, n = 60): void {
    const r = this.r;
    for (let i = 0; i < n; i++) {
      this.add(Kind.Confetti, x + (r() - 0.5) * 3, y, (r() - 0.5) * 9, -4 - r() * 8, 1.6 + r() * 1.4, 0.06 + r() * 0.05, CONFETTI[Math.floor(r() * CONFETTI.length)]);
    }
  }

  splinters(x: number, y: number, n = 8): void {
    const r = this.r;
    for (let i = 0; i < n; i++) {
      this.add(Kind.Splinter, x + (r() - 0.5) * 1.6, y, (r() - 0.5) * 3, -r() * 2.5, 0.6 + r() * 0.6, 0.05 + r() * 0.08, r() > 0.5 ? '#8a6238' : '#c59a62');
    }
  }

  update(dt: number): void {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      switch (p.kind) {
        case Kind.Dust:
        case Kind.Smoke:
          p.vx *= 1 - 2.2 * dt; p.vy = p.vy * (1 - 2.2 * dt) - 0.5 * dt; p.size += dt * (p.kind === Kind.Dust ? 0.55 : 0.4);
          break;
        case Kind.Confetti:
          p.vx *= 1 - 1.5 * dt; p.vy = p.vy * (1 - 1.5 * dt) + 5 * dt; p.rot += p.vr * dt;
          break;
        case Kind.Sparkle:
          p.vx *= 1 - 4 * dt; p.vy *= 1 - 4 * dt;
          break;
        default:
          p.vy += 10.4 * dt; p.rot += p.vr * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      l[w++] = p;
    }
    l.length = w;
  }

  draw(g: G): void {
    for (const p of this.list) {
      const t = p.life / p.max;
      switch (p.kind) {
        case Kind.Dust:
          g.fillStyle = `rgba(${p.color},${0.26 * t * t})`;
          g.beginPath(); g.arc(p.x, p.y, p.size, 0, 6.2832); g.fill();
          break;
        case Kind.Smoke:
          g.fillStyle = `rgba(${p.color},${0.11 * t})`;
          g.beginPath(); g.arc(p.x, p.y, p.size, 0, 6.2832); g.fill();
          break;
        case Kind.Chunk:
          g.fillStyle = `rgba(${p.color},${Math.min(1, t * 2.5)})`;
          g.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          break;
        case Kind.Spark:
          g.strokeStyle = `rgba(255,${180 + Math.round(60 * t)},${Math.round(120 * t)},${t})`;
          g.lineWidth = 0.025;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
          break;
        case Kind.Sparkle: {
          g.globalAlpha = t;
          g.fillStyle = p.color;
          const s = p.size * (0.5 + t);
          g.beginPath();
          g.moveTo(p.x, p.y - s * 2); g.lineTo(p.x + s * 0.5, p.y - s * 0.5); g.lineTo(p.x + s * 2, p.y);
          g.lineTo(p.x + s * 0.5, p.y + s * 0.5); g.lineTo(p.x, p.y + s * 2); g.lineTo(p.x - s * 0.5, p.y + s * 0.5);
          g.lineTo(p.x - s * 2, p.y); g.lineTo(p.x - s * 0.5, p.y - s * 0.5);
          g.closePath(); g.fill();
          g.globalAlpha = 1;
          break;
        }
        default:
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.globalAlpha = Math.min(1, t * 3);
          g.fillStyle = p.color;
          if (p.kind === Kind.Confetti) g.fillRect(-p.size, -p.size * 0.5 * Math.cos(p.rot * 2), p.size * 2, p.size * Math.cos(p.rot * 2));
          else g.fillRect(-p.size * 2.5, -p.size * 0.35, p.size * 5, p.size * 0.7);
          g.restore();
      }
    }
  }
}

interface Mote { x: number; y: number; z: number; ph: number }

/** Атмосферные частицы в экранном пространстве: снег, искры, пыльца, листья. */
export class Ambient {
  private motes: Mote[] = [];

  constructor(private kind: 'pollen' | 'leaves' | 'dustmotes' | 'snow' | 'embers', private color: string) {
    const r = rng(77);
    const n = kind === 'snow' ? 90 : kind === 'embers' ? 50 : kind === 'leaves' ? 16 : 36;
    for (let i = 0; i < n; i++) this.motes.push({ x: r(), y: r(), z: 0.3 + r() * 0.7, ph: r() * 6.28 });
  }

  draw(g: G, w: number, h: number, camX: number, camY: number, scale: number, time: number): void {
    g.fillStyle = this.color;
    const wrap = (v: number): number => ((v % 1) + 1) % 1;
    for (const m of this.motes) {
      const par = m.z * 0.6;
      let fx = 0, fy = 0, size = 1.5;
      switch (this.kind) {
        case 'snow': fx = Math.sin(time * 0.7 + m.ph) * 0.01 - time * 0.012; fy = time * (0.05 + m.z * 0.07); size = 1 + m.z * 2.2; break;
        case 'embers': fx = Math.sin(time * 1.3 + m.ph) * 0.012; fy = -time * (0.03 + m.z * 0.06); size = 1 + m.z * 1.8; break;
        case 'leaves': fx = time * 0.03 + Math.sin(time + m.ph) * 0.02; fy = time * 0.035 + Math.cos(time * 1.7 + m.ph) * 0.01; size = 3 + m.z * 3; break;
        default: fx = time * 0.006 + Math.sin(time * 0.5 + m.ph) * 0.01; fy = Math.cos(time * 0.4 + m.ph) * 0.012; size = 0.8 + m.z * 1.6;
      }
      const x = wrap(m.x + fx - (camX * scale * par) / w) * w;
      const y = wrap(m.y + fy - (camY * scale * par) / h) * h;
      const tw = this.kind === 'embers' ? 0.5 + 0.5 * Math.sin(time * 5 + m.ph * 3) : 1;
      g.globalAlpha = (0.35 + m.z * 0.6) * tw;
      if (this.kind === 'leaves') {
        g.save();
        g.translate(x, y);
        g.rotate(time * 2 + m.ph);
        g.beginPath();
        g.ellipse(0, 0, size, size * 0.45, 0, 0, 6.2832);
        g.fill();
        g.restore();
      } else {
        g.beginPath();
        g.arc(x, y, size, 0, 6.2832);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }
}
