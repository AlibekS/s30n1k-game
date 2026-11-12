import './style.css';
import { GameAudio } from './audio';
import { Game, type HudState } from './game';
import { Input } from './input';
import { LEVELS } from './levels/index';
import type { Level } from './levels/types';
import { BIOMES } from './render/biomes';
import { Scene } from './render/scene';
import { World } from './sim/world';
import { medalFor, store, type Medal } from './storage';
import { formatTime } from './util';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const input = new Input();
const audio = new GameAudio();
audio.muted = store.muted;
input.onFirstGesture = () => audio.unlock();
window.addEventListener('pointerdown', () => audio.unlock());

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

let game: Game | null = null;
let current = 0;
let attract: { stop(): void } | null = null;

const MEDAL_LABEL: Record<string, string> = { gold: 'Золото', silver: 'Серебро', bronze: 'Бронза' };

function unlocked(i: number): boolean {
  return i < 2 || !!store.get(LEVELS[i - 1].id) || !!store.get(LEVELS[i - 2].id);
}

const stars = (n: number, total: number): string => '<b>' + '★'.repeat(n) + '</b>' + '★'.repeat(Math.max(0, total - n));

// ---------- фон меню: медленный пролёт над трассой ----------
function startAttract(level: Level): void {
  attract?.stop();
  const world = new World(level);
  const scene = new Scene(canvas, level, world);
  let raf = 0, t0 = performance.now(), stopped = false;
  const span = level.finishX - 20;
  const onResize = (): void => scene.resize();
  window.addEventListener('resize', onResize);
  const loop = (now: number): void => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    const t = (now - t0) / 1000;
    const x = 10 + ((t * 2.2) % span);
    let y = world.topY(x);
    if (Number.isNaN(y)) y = world.topY(x - 8);
    const ya = world.topY(Math.max(0, x - 6)), yb = world.topY(x + 6);
    y = ((Number.isNaN(ya) ? y : ya) + y + (Number.isNaN(yb) ? y : yb)) / 3;
    view.y += (y - 2.6 - view.y) * 0.02;
    view.x = x;
    view.scale = scene.baseScale() * 0.8;
    scene.render(view, null, null, t, null);
  };
  const view = { x: 10, y: world.topY(10) - 2.6, scale: 30 };
  raf = requestAnimationFrame(loop);
  attract = { stop: () => { stopped = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); } };
}

// ---------- меню ----------
function thumb(cv: HTMLCanvasElement, level: Level): void {
  const w = (cv.width = 460), h = (cv.height = 192);
  const g = cv.getContext('2d')!;
  const b = BIOMES[level.biome];
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, b.sky[0]); sky.addColorStop(0.6, b.sky[1]); sky.addColorStop(1, b.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  if (b.sun) {
    const sx = b.sun.x * w, sy = b.sun.y * h * 0.9;
    const gl = g.createRadialGradient(sx, sy, 0, sx, sy, 90);
    gl.addColorStop(0, b.sun.glow + '0.8)'); gl.addColorStop(1, b.sun.glow + '0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, w, h);
  }
  // дальний хребет
  g.fillStyle = b.layers[1].top;
  g.globalAlpha = 0.7;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.55 - Math.abs(Math.sin(x * 0.021 + level.seed)) * 46 - Math.sin(x * 0.05) * 9);
  g.lineTo(w, h);
  g.fill();
  g.globalAlpha = 1;
  // профиль трассы
  let minY = Infinity, maxY = -Infinity;
  for (const c of level.chains) for (let i = 1; i < c.pts.length; i += 2) {
    if (c.pts[i - 1] < -2 || c.pts[i - 1] > level.finishX + 6) continue;
    minY = Math.min(minY, c.pts[i]); maxY = Math.max(maxY, c.pts[i]);
  }
  const sx = w / (level.finishX + 8), sy = Math.min(sx * 2.4, (h * 0.5) / Math.max(4, maxY - minY));
  const oy = h * 0.42 - minY * sy;
  const soil = g.createLinearGradient(0, h * 0.3, 0, h);
  soil.addColorStop(0, b.soil[0]); soil.addColorStop(1, b.soil[1]);
  for (const c of level.chains) {
    g.beginPath();
    g.moveTo((c.pts[0] + 2) * sx, h);
    for (let i = 0; i < c.pts.length; i += 2) g.lineTo((c.pts[i] + 2) * sx, c.pts[i + 1] * sy + oy);
    g.lineTo((c.pts[c.pts.length - 2] + 2) * sx, h);
    g.closePath();
    g.fillStyle = soil;
    g.fill();
    g.beginPath();
    for (let i = 0; i < c.pts.length; i += 2) g.lineTo((c.pts[i] + 2) * sx, c.pts[i + 1] * sy + oy);
    const turf = b.turf[c.surf[Math.floor(c.surf.length / 2)]] ?? ['#888', '#bbb'];
    g.strokeStyle = turf[1];
    g.lineWidth = 3;
    g.lineJoin = 'round';
    g.stroke();
  }
  const vg = g.createLinearGradient(0, h * 0.5, 0, h);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
}

function buildMenu(): void {
  const grid = $('grid');
  grid.innerHTML = '';
  let medals = 0, starSum = 0, starMax = 0, done = 0;
  LEVELS.forEach((level, i) => {
    const rec = store.get(level.id);
    const open = unlocked(i);
    starMax += level.stars.length;
    if (rec) { done++; starSum += rec.stars; if (rec.medal) medals++; }
    const card = document.createElement('button');
    card.className = 'card' + (open ? '' : ' locked');
    card.style.setProperty('--accent', BIOMES[level.biome].accent);
    const cv = document.createElement('canvas');
    thumb(cv, level);
    card.append(cv);
    card.insertAdjacentHTML('beforeend', `
      <span class="num">${String(i + 1).padStart(2, '0')}</span>
      ${rec?.medal ? `<span class="medal-dot ${rec.medal}" title="${MEDAL_LABEL[rec.medal]}"></span>` : ''}
      <div class="body">
        <h3>${level.name}</h3>
        <div class="meta"><span>${BIOMES[level.biome].title}</span>
          <span class="tier" title="Сложность">${[1, 2, 3].map((t) => `<i class="${t <= level.tier ? 'on' : ''}"></i>`).join('')}</span></div>
        <div class="best"><span>${rec ? formatTime(rec.time) : '—:——'}</span><span class="st">${stars(rec?.stars ?? 0, level.stars.length)}</span></div>
      </div>`);
    if (open) card.addEventListener('click', () => { audio.unlock(); audio.click(); play(i); });
    else card.disabled = true;
    grid.append(card);
  });
  $('summary').innerHTML = `Пройдено <b>${done}/${LEVELS.length}</b> · медалей <b>${medals}</b> · звёзд <b>${starSum}/${starMax}</b>`;
  syncToggles();
}

function syncToggles(): void {
  const s = `Звук: ${store.muted ? 'выкл' : 'вкл'}`;
  $('btn-sound').textContent = s;
  $('p-sound').textContent = s;
  $('btn-ghost').textContent = `Призрак: ${store.ghost ? 'вкл' : 'выкл'}`;
}

function show(id: 'menu' | 'pause' | 'result' | 'help' | null): void {
  for (const s of ['menu', 'pause', 'result', 'help']) $(s).hidden = s !== id;
}

function toMenu(): void {
  game?.destroy();
  game = null;
  $('hud').hidden = true;
  $('touch').hidden = true;
  $('toasts').innerHTML = '';
  buildMenu();
  show('menu');
  startAttract(LEVELS[current]);
}

// ---------- игра ----------
const hudTime = $('hud-time'), hudSpeed = $('hud-speed'), hudBar = $('hud-bar'), hudStars = $('hud-stars'), hudReady = $('hud-ready');
let lastStars = -1, lastCp = -1, lastSpeed = -1;

function hud(s: HudState): void {
  hudTime.textContent = formatTime(s.time);
  const sp = Math.round(s.speed);
  if (sp !== lastSpeed) { hudSpeed.textContent = String(sp); lastSpeed = sp; }
  hudBar.style.width = (s.progress * 100).toFixed(1) + '%';
  if (s.stars !== lastStars) { hudStars.innerHTML = stars(s.stars, s.starsTotal); lastStars = s.stars; }
  if (s.cp !== lastCp) {
    lastCp = s.cp;
    $('hud-ticks').querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < s.cp));
  }
  hudReady.classList.toggle('off', s.state !== 'ready');
}

function toast(text: string, kind: 'good' | 'info' | 'bad' = 'info'): void {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  box.append(el);
  while (box.children.length > 3) box.firstElementChild?.remove();
  setTimeout(() => el.remove(), 1750);
}

function play(i: number): void {
  current = i;
  const level = LEVELS[i];
  attract?.stop();
  attract = null;
  game?.destroy();
  show(null);
  $('hud').hidden = false;
  $('touch').hidden = !isTouch;
  $('hud-name').textContent = `${String(i + 1).padStart(2, '0')} · ${level.name}`;
  const span = level.finishX - level.spawnX;
  $('hud-ticks').innerHTML = level.checkpoints.map((x) => `<i style="left:${(((x - level.spawnX) / span) * 100).toFixed(1)}%"></i>`).join('');
  lastStars = lastCp = lastSpeed = -1;
  $('toasts').innerHTML = '';
  game = new Game(canvas, level, input, audio, {
    hud, toast,
    finish: (r) => finish(level, r),
    pauseToggle: () => togglePause(),
  }, store.ghost ? store.get(level.id)?.ghost ?? null : null);
  game.start();
}

function togglePause(force?: boolean): void {
  if (!game || !$('result').hidden) return;
  const p = force ?? !game.isPaused;
  game.setPaused(p);
  show(p ? 'pause' : null);
}

function finish(level: Level, r: { time: number; stars: number; crashes: number; flips: number; rec: number[] }): void {
  const medal: Medal = medalFor(r.time, level.par);
  const old = store.get(level.id);
  const record = store.submit(level.id, r.time, medal, r.stars, r.crashes === 0, r.rec);
  const m = $('r-medal');
  m.className = 'medal ' + (medal ?? 'none');
  m.textContent = medal ? { gold: '1', silver: '2', bronze: '3' }[medal] : '✓';
  $('r-title').textContent = medal ? MEDAL_LABEL[medal] : 'Финиш';
  $('r-time').textContent = formatTime(r.time);
  const note = $('r-note');
  note.className = 'note' + (record && old ? ' rec' : '');
  note.textContent = record ? (old ? `Новый рекорд! Было ${formatTime(old.time)}` : 'Первое прохождение') : `Рекорд: ${formatTime(old!.time)}`;
  $('r-stats').innerHTML = `
    <div><b>${stars(r.stars, level.stars.length).replace(/<b>/, '').replace('</b>', '<i>') + '</i>'}</b>звёзды</div>
    <div><b>${r.crashes}</b>падений</div>
    <div><b>${r.flips}</b>сальто</div>`;
  $('r-par').innerHTML = `<span class="g">${formatTime(level.par[0])}</span><span class="s">${formatTime(level.par[1])}</span><span class="b">${formatTime(level.par[2])}</span>`;
  const next = current + 1;
  $('r-next').hidden = next >= LEVELS.length;
  show('result');
}

// ---------- кнопки ----------
const on = (id: string, fn: () => void): void => $(id).addEventListener('click', () => { audio.unlock(); audio.click(); fn(); });
on('btn-pause', () => togglePause(true));
on('btn-respawn', () => game?.respawn());
on('p-resume', () => togglePause(false));
on('p-respawn', () => { togglePause(false); game?.respawn(); });
on('p-restart', () => { togglePause(false); game?.restart(); });
on('p-menu', toMenu);
on('r-next', () => play(Math.min(LEVELS.length - 1, current + 1)));
on('r-retry', () => play(current));
on('r-menu', toMenu);
on('btn-help', () => show('help'));
on('h-close', () => show('menu'));
const toggleSound = (): void => { store.muted = !store.muted; audio.setMuted(store.muted); syncToggles(); };
on('btn-sound', toggleSound);
on('p-sound', toggleSound);
on('btn-ghost', () => { store.ghost = !store.ghost; syncToggles(); });

document.querySelectorAll<HTMLElement>('.tbtn').forEach((el) => input.bindButton(el, el.dataset.act as 'gas'));
document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.isPaused) togglePause(true); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !$('result').hidden) { $('r-next').hidden ? play(current) : play(current + 1); }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// отладочный доступ для автотестов
(window as unknown as { __kryazh: unknown }).__kryazh = { play, levels: LEVELS, get game() { return game; } };

toMenu();
