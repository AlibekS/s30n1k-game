/** Векторная отрисовка мотоцикла и райдера. Все размеры — в метрах, в системе рамы. */
import { FORK_AXIS, GRIP, HEAD, PEG, PIVOT, WHEEL_R, type Bike } from '../sim/bike';
import { makePose, riderPoseLocal, type Pose, type Ragdoll } from '../sim/rider';

type G = CanvasRenderingContext2D;
interface P { x: number; y: number }

export interface Livery {
  plastic: string; plasticDark: string; frame: string; rim: string;
  jersey: string; jerseyDark: string; pants: string; helmet: string; helmetStripe: string;
}

export const LIVERY: Livery = {
  plastic: '#ff5b1f', plasticDark: '#c93c0c', frame: '#2b2f38', rim: '#e2b04a',
  jersey: '#2f86ea', jerseyDark: '#1b5cb0', pants: '#272b35', helmet: '#f4f6fa', helmetStripe: '#ff5b1f',
};

const pose = makePose();

function line(g: G, ax: number, ay: number, bx: number, by: number, w: number, color: string): void {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
}

function poly(g: G, pts: number[], fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}

export function drawWheel(g: G, x: number, y: number, angle: number, spin: number, rim: string): void {
  g.save();
  g.translate(x, y);
  // покрышка
  g.strokeStyle = '#15161a';
  g.lineWidth = 0.09;
  g.beginPath();
  g.arc(0, 0, WHEEL_R - 0.05, 0, Math.PI * 2);
  g.stroke();
  // грунтозацепы
  g.rotate(angle);
  g.strokeStyle = '#0b0c0e';
  g.lineWidth = 0.035;
  g.setLineDash([0.055, 0.05]);
  g.beginPath();
  g.arc(0, 0, WHEEL_R - 0.012, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  // боковина с бликом
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 0.02;
  g.beginPath();
  g.arc(0, 0, WHEEL_R - 0.075, 0, Math.PI * 2);
  g.stroke();
  // обод
  g.strokeStyle = rim;
  g.lineWidth = 0.028;
  g.beginPath();
  g.arc(0, 0, WHEEL_R - 0.105, 0, Math.PI * 2);
  g.stroke();
  // спицы: на высоких оборотах сливаются в диск
  const blur = Math.min(1, Math.abs(spin) / 38);
  g.strokeStyle = `rgba(210,216,226,${0.85 - blur * 0.6})`;
  g.lineWidth = 0.009;
  g.beginPath();
  const rr = WHEEL_R - 0.115;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, b = a + (i % 2 ? 0.5 : -0.5);
    g.moveTo(Math.cos(b) * 0.045, Math.sin(b) * 0.045);
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.stroke();
  if (blur > 0.2) {
    g.fillStyle = `rgba(200,206,216,${blur * 0.16})`;
    g.beginPath();
    g.arc(0, 0, rr, 0, Math.PI * 2);
    g.fill();
  }
  // тормозной диск и ступица
  g.strokeStyle = '#8f98a6';
  g.lineWidth = 0.018;
  g.setLineDash([0.03, 0.014]);
  g.beginPath();
  g.arc(0, 0, 0.105, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#3a3f4a';
  g.beginPath();
  g.arc(0, 0, 0.05, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = rim;
  g.beginPath();
  g.arc(0, 0, 0.022, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function spring(g: G, ax: number, ay: number, bx: number, by: number, coils: number, w: number, color: string): void {
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / l, ny = dx / l;
  g.strokeStyle = color;
  g.lineWidth = 0.022;
  g.beginPath();
  g.moveTo(ax, ay);
  for (let i = 1; i < coils * 2; i++) {
    const t = i / (coils * 2), s = i % 2 ? w : -w;
    g.lineTo(ax + dx * t + nx * s, ay + dy * t + ny * s);
  }
  g.lineTo(bx, by);
  g.stroke();
}

/** Конечность из двух сегментов с круглыми суставами. */
function limb(g: G, a: P, b: P, c: P, w1: number, w2: number, color: string): void {
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = w1;
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke();
  g.lineWidth = w2;
  g.beginPath();
  g.moveTo(b.x, b.y);
  g.lineTo(c.x, c.y);
  g.stroke();
}

function boot(g: G, knee: P, foot: P, dark: boolean): void {
  const a = Math.atan2(foot.y - knee.y, foot.x - knee.x) - Math.PI / 2;
  g.save();
  g.translate(foot.x, foot.y);
  g.rotate(a);
  g.fillStyle = dark ? '#1a1c22' : '#e9ecf2';
  g.beginPath();
  g.moveTo(-0.06, -0.2);
  g.lineTo(0.065, -0.2);
  g.lineTo(0.07, -0.02);
  g.lineTo(0.2, 0.01);
  g.quadraticCurveTo(0.23, 0.06, 0.19, 0.075);
  g.lineTo(-0.07, 0.075);
  g.closePath();
  g.fill();
  g.fillStyle = '#111317';
  g.fillRect(-0.075, 0.06, 0.28, 0.03);
  if (!dark) {
    g.fillStyle = LIVERY.plastic;
    g.fillRect(-0.055, -0.14, 0.115, 0.03);
    g.fillRect(-0.055, -0.08, 0.12, 0.025);
  }
  g.restore();
}

function helmet(g: G, head: P, shoulder: P, lv: Livery): void {
  const a = Math.atan2(head.y - shoulder.y, head.x - shoulder.x) + Math.PI / 2;
  g.save();
  g.translate(head.x, head.y);
  g.rotate(a * 0.75);
  // шея
  g.fillStyle = lv.jerseyDark;
  g.fillRect(-0.07, 0.07, 0.1, 0.1);
  // купол
  g.fillStyle = lv.helmet;
  g.beginPath();
  g.arc(0, 0, 0.135, Math.PI * 0.95, Math.PI * 2.08);
  g.lineTo(0.17, 0.085);
  g.quadraticCurveTo(0.12, 0.15, 0.03, 0.135);
  g.lineTo(-0.1, 0.1);
  g.closePath();
  g.fill();
  // полоса
  g.strokeStyle = lv.helmetStripe;
  g.lineWidth = 0.035;
  g.beginPath();
  g.arc(0, 0, 0.1, Math.PI * 1.05, Math.PI * 1.75);
  g.stroke();
  // очки
  g.fillStyle = '#16181d';
  g.beginPath();
  g.moveTo(0.045, -0.055);
  g.lineTo(0.14, -0.04);
  g.lineTo(0.145, 0.035);
  g.lineTo(0.05, 0.03);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(120,220,255,0.85)';
  g.beginPath();
  g.moveTo(0.075, -0.04);
  g.lineTo(0.135, -0.03);
  g.lineTo(0.138, 0.02);
  g.lineTo(0.08, 0.018);
  g.closePath();
  g.fill();
  // козырёк
  g.fillStyle = lv.helmetStripe;
  g.beginPath();
  g.moveTo(0.02, -0.13);
  g.lineTo(0.24, -0.1);
  g.lineTo(0.235, -0.075);
  g.lineTo(0.06, -0.085);
  g.closePath();
  g.fill();
  g.restore();
}

function torso(g: G, hip: P, shoulder: P, lv: Livery): void {
  g.lineCap = 'round';
  g.strokeStyle = lv.jersey;
  g.lineWidth = 0.21;
  g.beginPath();
  g.moveTo(hip.x * 0.75 + shoulder.x * 0.25, hip.y * 0.75 + shoulder.y * 0.25);
  g.lineTo(shoulder.x, shoulder.y);
  g.stroke();
  // защита груди
  g.strokeStyle = lv.jerseyDark;
  g.lineWidth = 0.08;
  g.beginPath();
  g.moveTo(hip.x * 0.5 + shoulder.x * 0.5, hip.y * 0.5 + shoulder.y * 0.5);
  g.lineTo(hip.x * 0.12 + shoulder.x * 0.88, hip.y * 0.12 + shoulder.y * 0.88);
  g.stroke();
  // таз в цвет штанов
  g.strokeStyle = lv.pants;
  g.lineWidth = 0.2;
  g.beginPath();
  g.moveTo(hip.x, hip.y);
  g.lineTo(hip.x * 0.8 + shoulder.x * 0.2, hip.y * 0.8 + shoulder.y * 0.2);
  g.stroke();
}

function drawFrame(g: G, bike: Bike, rw: P, fw: P, lv: Livery): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // --- маятник, цепь, амортизатор ---
  line(g, PIVOT.x + 0.06, PIVOT.y + 0.05, rw.x, rw.y + 0.045, 0.012, '#555b66');
  line(g, PIVOT.x + 0.06, PIVOT.y - 0.03, rw.x, rw.y - 0.045, 0.012, '#555b66');
  const mx = PIVOT.x + (rw.x - PIVOT.x) * 0.42, my = PIVOT.y + (rw.y - PIVOT.y) * 0.42;
  line(g, -0.2, -0.2, mx, my - 0.02, 0.03, '#30343c');
  spring(g, -0.2, -0.2, mx, my - 0.02, 6, 0.032, '#ffd23a');
  line(g, PIVOT.x, PIVOT.y, rw.x, rw.y, 0.07, '#aab2bd');
  line(g, PIVOT.x, PIVOT.y, rw.x, rw.y, 0.025, '#d5dbe3');
  // --- выхлоп ---
  g.strokeStyle = '#8b939f';
  g.lineWidth = 0.05;
  g.beginPath();
  g.moveTo(0.2, 0.0);
  g.bezierCurveTo(0.42, 0.02, 0.36, 0.24, 0.1, 0.22);
  g.bezierCurveTo(-0.1, 0.2, -0.2, 0.0, -0.36, -0.1);
  g.stroke();
  g.strokeStyle = '#c9d0d9';
  g.lineWidth = 0.085;
  g.beginPath();
  g.moveTo(-0.36, -0.1);
  g.lineTo(-0.66, -0.2);
  g.stroke();
  g.strokeStyle = '#3a3f49';
  g.lineWidth = 0.05;
  g.beginPath();
  g.moveTo(-0.66, -0.2);
  g.lineTo(-0.7, -0.213);
  g.stroke();
  // --- рама ---
  g.strokeStyle = lv.frame;
  g.lineWidth = 0.05;
  g.beginPath();
  g.moveTo(HEAD.x - 0.03, HEAD.y + 0.02);
  g.lineTo(0.24, 0.16);
  g.lineTo(-0.1, 0.22);
  g.lineTo(PIVOT.x, PIVOT.y);
  g.lineTo(-0.22, -0.24);
  g.lineTo(HEAD.x - 0.05, HEAD.y - 0.02);
  g.moveTo(-0.22, -0.24);
  g.lineTo(-0.66, -0.36);
  g.lineTo(-0.2, -0.08);
  g.stroke();
  // --- двигатель ---
  g.fillStyle = '#3d424d';
  g.beginPath();
  g.moveTo(-0.12, 0.2);
  g.lineTo(-0.14, -0.02);
  g.lineTo(-0.02, -0.1);
  g.lineTo(0.06, -0.24);
  g.lineTo(0.2, -0.22);
  g.lineTo(0.22, -0.02);
  g.lineTo(0.26, 0.12);
  g.lineTo(0.2, 0.2);
  g.closePath();
  g.fill();
  g.strokeStyle = '#5b6270';
  g.lineWidth = 0.014;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    g.moveTo(0.05 - i * 0.004, -0.2 + i * 0.045);
    g.lineTo(0.2 - i * 0.002, -0.185 + i * 0.045);
  }
  g.stroke();
  g.fillStyle = '#23262d';
  g.beginPath();
  g.arc(0.04, 0.08, 0.085, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#6a7180';
  g.beginPath();
  g.arc(0.04, 0.08, 0.05, 0, Math.PI * 2);
  g.fill();
  // защита картера
  line(g, -0.1, 0.235, 0.24, 0.2, 0.03, '#9aa2ae');
  // подножка
  line(g, PEG.x - 0.07, PEG.y + 0.065, PEG.x + 0.08, PEG.y + 0.065, 0.025, '#c4cad3');
  // --- вилка ---
  const fx = fw.x - HEAD.x, fy = fw.y - HEAD.y;
  const fl = Math.hypot(fx, fy) || 1e-6;
  const ux = fx / fl, uy = fy / fl;
  const topX = HEAD.x - ux * 0.1, topY = HEAD.y - uy * 0.1;
  line(g, topX, topY, fw.x, fw.y, 0.035, '#d9dfe7');
  line(g, topX, topY, topX + ux * 0.56, topY + uy * 0.56, 0.062, '#343944');
  line(g, fw.x - ux * 0.2, fw.y - uy * 0.2, fw.x - ux * 0.02, fw.y - uy * 0.02, 0.06, lv.plastic);
  // руль и номерная табличка
  line(g, topX, topY, GRIP.x, GRIP.y - 0.0, 0.03, '#2a2d34');
  poly(g, [topX + 0.03, topY - 0.02, topX + 0.13, topY + 0.0, topX + 0.19, topY + 0.22, topX + 0.08, topY + 0.2], '#f4f6fa');
  // переднее крыло (закреплено на нижней траверсе, не ходит с колесом)
  const bx = HEAD.x + FORK_AXIS.x * 0.22, by = HEAD.y + FORK_AXIS.y * 0.22;
  g.fillStyle = lv.plastic;
  g.beginPath();
  g.moveTo(bx - 0.2, by + 0.06);
  g.quadraticCurveTo(bx + 0.1, by - 0.1, bx + 0.52, by + 0.02);
  g.lineTo(bx + 0.5, by + 0.055);
  g.quadraticCurveTo(bx + 0.1, by - 0.03, bx - 0.19, by + 0.1);
  g.closePath();
  g.fill();
  // --- пластик: бак, обтекатели, сиденье, хвост ---
  poly(g, [-0.22, -0.34, -0.84, -0.47, -0.86, -0.43, -0.5, -0.27, -0.24, -0.2], lv.plastic);
  poly(g, [-0.2, -0.3, -0.56, -0.33, -0.44, -0.12, -0.2, -0.1], '#f4f6fa');
  g.fillStyle = '#1b1d23';
  g.beginPath();
  g.moveTo(0.1, -0.5);
  g.quadraticCurveTo(-0.2, -0.36, -0.72, -0.47);
  g.lineTo(-0.72, -0.41);
  g.quadraticCurveTo(-0.2, -0.3, 0.1, -0.42);
  g.closePath();
  g.fill();
  g.fillStyle = lv.plastic;
  g.beginPath();
  g.moveTo(0.44, -0.47);
  g.quadraticCurveTo(0.26, -0.56, 0.06, -0.5);
  g.lineTo(-0.1, -0.36);
  g.lineTo(0.0, -0.12);
  g.lineTo(0.32, -0.02);
  g.lineTo(0.42, -0.16);
  g.lineTo(0.34, -0.3);
  g.closePath();
  g.fill();
  poly(g, [0.0, -0.12, 0.32, -0.02, 0.42, -0.16, 0.3, -0.2, 0.06, -0.24], lv.plasticDark);
  poly(g, [0.1, -0.44, 0.36, -0.42, 0.3, -0.34, 0.04, -0.36], 'rgba(255,255,255,0.85)');
  void bike;
}

/** Мотоцикл с райдером (или без него после падения). Контекст — в мировых метрах. */
export function drawBike(g: G, bike: Bike, lv: Livery = LIVERY): void {
  const c = bike.c;
  const cs = Math.cos(c.a), sn = Math.sin(c.a);
  const loc = (wx: number, wy: number): P => {
    const dx = wx - c.x, dy = wy - c.y;
    return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs };
  };
  const rw = loc(bike.rw.x, bike.rw.y), fw = loc(bike.fw.x, bike.fw.y);
  g.save();
  g.translate(c.x, c.y);
  g.rotate(c.a);
  const withRider = !bike.crashed;
  if (withRider) {
    riderPoseLocal(bike, pose);
    // дальние рука и нога
    const farKnee = { x: pose.knee.x + 0.03, y: pose.knee.y + 0.015 };
    limb(g, pose.hip, farKnee, pose.foot, 0.15, 0.12, '#191c23');
    boot(g, farKnee, pose.foot, true);
    limb(g, pose.shoulder, { x: pose.elbow.x + 0.02, y: pose.elbow.y + 0.03 }, pose.hand, 0.1, 0.085, lv.jerseyDark);
  }
  drawWheel(g, rw.x, rw.y, bike.rw.a - c.a, bike.rw.w - c.w, lv.rim);
  drawWheel(g, fw.x, fw.y, bike.fw.a - c.a, bike.fw.w - c.w, lv.rim);
  drawFrame(g, bike, rw, fw, lv);
  if (withRider) drawFigure(g, pose, null, lv);
  g.restore();
}

function drawFigure(g: G, p: Pose, far: { elbow: P; hand: P; knee: P; foot: P } | null, lv: Livery): void {
  if (far) {
    limb(g, p.hip, far.knee, far.foot, 0.15, 0.12, '#191c23');
    boot(g, far.knee, far.foot, true);
    limb(g, p.shoulder, far.elbow, far.hand, 0.1, 0.085, lv.jerseyDark);
  }
  torso(g, p.hip, p.shoulder, lv);
  limb(g, p.hip, p.knee, p.foot, 0.16, 0.125, lv.pants);
  // наколенник
  g.fillStyle = '#e9ecf2';
  g.beginPath();
  g.arc(p.knee.x, p.knee.y, 0.062, 0, Math.PI * 2);
  g.fill();
  boot(g, p.knee, p.foot, false);
  helmet(g, p.head, p.shoulder, lv);
  limb(g, p.shoulder, p.elbow, p.hand, 0.105, 0.09, lv.jersey);
  g.fillStyle = '#1a1c22';
  g.beginPath();
  g.arc(p.hand.x, p.hand.y, 0.055, 0, Math.PI * 2);
  g.fill();
}

const rp = makePose();
const rfar = { elbow: { x: 0, y: 0 }, hand: { x: 0, y: 0 }, knee: { x: 0, y: 0 }, foot: { x: 0, y: 0 } };

export function drawRagdoll(g: G, r: Ragdoll, lv: Livery = LIVERY): void {
  const set = (p: P, i: number): void => { p.x = r.x[i]; p.y = r.y[i]; };
  set(rp.head, 0); set(rp.shoulder, 1); set(rp.hip, 2); set(rp.elbow, 3); set(rp.hand, 4); set(rp.knee, 5); set(rp.foot, 6);
  set(rfar.elbow, 7); set(rfar.hand, 8); set(rfar.knee, 9); set(rfar.foot, 10);
  g.save();
  drawFigure(g, rp, rfar, lv);
  g.restore();
}

/** Призрак рекордного заезда: полупрозрачный силуэт. */
export function drawGhost(g: G, x: number, y: number, a: number, qr: number, qf: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.globalAlpha = 0.36;
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineCap = 'round';
  const ang = 0.42 - qr / 0.58;
  const rx = PIVOT.x - Math.cos(ang) * 0.58, ry = PIVOT.y + Math.sin(ang) * 0.58;
  const fl = 0.88 - qf;
  const fx = HEAD.x + FORK_AXIS.x * fl, fy = HEAD.y + FORK_AXIS.y * fl;
  g.lineWidth = 0.07;
  for (const [wx, wy] of [[rx, ry], [fx, fy]]) {
    g.beginPath();
    g.arc(wx, wy, WHEEL_R - 0.04, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 0.06;
  g.beginPath();
  g.moveTo(rx, ry); g.lineTo(PIVOT.x, PIVOT.y); g.lineTo(0.24, 0.16); g.lineTo(HEAD.x, HEAD.y); g.lineTo(fx, fy);
  g.moveTo(HEAD.x, HEAD.y); g.lineTo(-0.22, -0.3); g.lineTo(-0.8, -0.44);
  g.stroke();
  g.lineWidth = 0.16;
  g.beginPath();
  g.moveTo(-0.3, -0.45); g.lineTo(-0.08, -0.8);
  g.stroke();
  g.lineWidth = 0.08;
  g.beginPath();
  g.moveTo(-0.08, -0.8); g.lineTo(GRIP.x, GRIP.y);
  g.moveTo(-0.3, -0.42); g.lineTo(0.1, -0.2); g.lineTo(PEG.x, PEG.y);
  g.stroke();
  g.beginPath();
  g.arc(0.02, -1.0, 0.14, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
