/**
 * Двенадцать авторских трасс в пяти биомах. Каждая вводит свою механику:
 * трамплины, каменные сады, брёвна, качели, грязь, пропасти, осыпающиеся мосты,
 * паромы и подъёмники, лёд, низкие своды.
 */
import { LevelBuilder } from './builder';
import type { Level } from './types';

function meadow(): Level {
  const b = new LevelBuilder({
    id: 'alps-1', name: 'Альпийский луг', biome: 'alps', tier: 1, surface: 'grass',
    blurb: 'Пологие холмы и первый трамплин. Привыкните к газу и балансу.', par: [26, 32, 45],
  });
  b.flat(10).hill(12, 1.1).flat(5).hill(16, 2.0).star(-8, 3.4).flat(6)
    .to(16, -3).flat(6).bumps(3, 6, 0.55).flat(8).cp().flat(7)
    .to(20, 4.2).flat(6).ramp(8, 1.5).star(5.5, 2.6).step(-2.2).flat(4).to(14, -2.5).flat(10)
    .hill(9, 1.3).hill(12, 2.1).flat(7).cp().flat(7)
    .to(14, 3).flat(4).to(12, -1).ramp(9, 1.9).gap(4.5, -1.2).star(-2.2, 3.2).flat(5).to(18, -4).flat(8)
    .bumps(2, 7, 0.8).to(12, 2).flat(6);
  return b.finish();
}

function rockTrail(): Level {
  const b = new LevelBuilder({
    id: 'alps-2', name: 'Каменная тропа', biome: 'alps', tier: 1, surface: 'grass',
    blurb: 'Каменные россыпи, валуны и ступени. Держите переднее колесо лёгким.', par: [24, 30, 42],
  });
  b.flat(9).surface('rock').rough(16, 0.16, 1).flat(4).boulder(1, 1.6, 0.45).flat(7)
    .stairs(3, 3.2, 0.32).flat(4).surface('grass').to(12, -2.2).star(-6, 2.2).flat(6).cp().flat(6)
    .surface('rock').rough(12, 0.22, -0.5).boulder(2, 2.2, 0.6).flat(8).boulder(0.5, 1.4, 0.4).flat(5)
    .to(10, 2.4).flat(3).gap(3.2, -0.6).flat(6).rough(14, 0.2, -1.5).flat(6).cp().flat(6)
    .surface('grass').to(16, 3.5).flat(3).surface('rock').stairs(4, 2.6, -0.4).flat(5)
    .ramp(7, 1.5).gap(5, -1).star(-2.5, 2.9).flat(6).rough(12, 0.18, 0).boulder(1.5, 2.6, 0.7).star(2.8, 2.4).flat(9)
    .surface('grass').to(12, -2).flat(6);
  return b.finish();
}

function pines(): Level {
  const b = new LevelBuilder({
    id: 'forest-1', name: 'Сосновый бор', biome: 'forest', tier: 1, surface: 'dirt',
    blurb: 'Брёвна поперёк тропы, вязкая грязь и первые качели.', par: [31, 38, 54],
  });
  b.flat(10).log(1.2, 0.26).flat(6).log(1, 0.3).flat(3).log(0.6, 0.3).flat(7).bumps(4, 4.5, 0.45).flat(5)
    .to(12, 2).star(2, 2.6).flat(5).to(10, -2).flat(5).cp().flat(6)
    .surface('mud').to(8, -0.6).flat(9).to(8, 0.6).surface('dirt').flat(6)
    .seesaw(7, 1.0).flat(8).star(-9.5, 2.9).log(1, 0.34).flat(8).to(14, 3).flat(5).cp().flat(6)
    .ramp(7, 1.3).gap(4, -0.8).flat(5).to(12, -2.6).flat(4).log(1.5, 0.3).flat(2.6).log(0.4, 0.42).flat(8)
    .surface('mud').flat(7).surface('dirt').to(10, 1.6).ramp(6, 1.2).star(4, 2.5).step(-1.6).flat(12)
    .bumps(3, 5, 0.6).flat(6);
  return b.finish();
}

function windfall(): Level {
  const b = new LevelBuilder({
    id: 'forest-2', name: 'Бурелом', biome: 'forest', tier: 2, surface: 'dirt',
    blurb: 'Завалы из стволов, шаткие качели и дощатые настилы над оврагами.', par: [29, 36, 52],
  });
  b.flat(9).log(1, 0.36).flat(2.2).log(0.4, 0.36).log(1.15, 0.36).flat(9)
    .seesaw(8, 1.2).flat(6).bridge(5, 2.2, false).flat(6).cp().flat(6)
    .to(10, 2.2).flat(3).ramp(6, 1.3).gap(6, -1.6).star(-3, 3).flat(4).to(10, -1.8).flat(4)
    .surface('mud').flat(8).surface('dirt').log(1, 0.4).flat(6).block(0.5, 4.2, 0.6, 1.3, 0.05, 'wood').flat(6).block(0, 5.2, 1.1, 2.2, 0.05, 'wood').star(5.6, 2.4).flat(5)
    .flat(8).cp().flat(6)
    .seesaw(7, 1.15).flat(1).seesaw(7, 1.15).flat(7).to(12, 3.2).flat(4).bridge(6, 2, true).flat(8).cp().flat(6)
    .to(14, -3.5).ramp(8, 2.0).gap(7.5, -0.5).star(-3.7, 3.6).flat(6).log(2, 0.34).flat(4).bumps(3, 4.5, 0.6).flat(6);
  return b.finish();
}

function serpentine(): Level {
  const b = new LevelBuilder({
    id: 'alps-3', name: 'Серпантин', biome: 'alps', tier: 2, surface: 'grass',
    blurb: 'Крутые подъёмы, уступы и затяжной прыжок с перевала.', par: [30, 38, 55],
  });
  b.flat(9).to(14, 5).flat(4).surface('rock').step(0.4).flat(3).step(0.45).flat(3).step(0.5).flat(5)
    .surface('grass').line(12, 6.5).star(-4, 4.4).crest(5, 0.9).flat(6).cp().flat(6)
    .to(10, -3).ramp(8, 2.2).gap(6, 1.2).flat(5).surface('rock').rough(12, 0.2, 2).flat(3)
    .line(9, 6).crest(4, 0.6).flat(6).cp().flat(5)
    .surface('grass').to(8, -1.2).line(16, -8).ramp(10, 2.6).gap(11, -3.5).star(-5.5, 3.6).crest(8, -2.2).flat(8)
    .bumps(2, 6, 0.9).flat(5).cp().flat(6)
    .surface('rock').step(0.55).flat(2.6).step(0.55).flat(2.6).step(-0.5).flat(4).boulder(0.6, 2.4, 0.75).flat(8)
    .surface('grass').to(14, 4).flat(3).to(18, -6).star(-9, 2.6).flat(8);
  return b.finish();
}

function redCanyon(): Level {
  const b = new LevelBuilder({
    id: 'canyon-1', name: 'Красный каньон', biome: 'canyon', tier: 2, surface: 'rock',
    blurb: 'Пропасти между останцами. Разгон — это всё.', par: [28, 35, 50],
  });
  b.flat(12).ramp(7, 1.4).gap(5.5, 0).star(-2.7, 2.9).flat(8).surface('sand').to(10, -1).flat(8).to(8, 1).surface('rock')
    .flat(6).ramp(8, 1.9).gap(8, -0.8).flat(10).cp().flat(6)
    .to(14, -4).flat(5).ramp(9, 2.4).gap(10, 0.6).star(-5, 4.2).flat(6).rough(10, 0.15, 0).flat(4)
    .to(8, 2).flat(3).ramp(3, 0.4).gap(3, -0.6).flat(3.6).gap(3, -0.5).flat(3.6).gap(3.2, -0.5).flat(9).cp().flat(6)
    .surface('sand').bumps(3, 6, 0.7).surface('rock').flat(5).line(10, 4.5).crest(4, 0.6).flat(4)
    .line(14, -6.5).ramp(10, 2.8).gap(13, -2).star(-6.5, 4.4).crest(6, -1.2).flat(12).to(12, 2).flat(6);
  return b.finish();
}

function ropeBridge(): Level {
  const b = new LevelBuilder({
    id: 'canyon-2', name: 'Старый рудник', biome: 'canyon', tier: 2, surface: 'rock',
    blurb: 'Гнилые мостки рушатся под колёсами, а через провалы ходят вагонетки.', par: [46, 58, 80],
  });
  b.flat(10).bridge(6, 2, true).flat(8).to(10, 2).flat(4).bridge(8, 2, true, -1.5).star(-8, 2.4).flat(8).cp().flat(7)
    .ferry(13, 0).flat(8).surface('sand').to(10, -1.5).flat(6).surface('rock').to(8, 1).flat(6)
    .elevator(3.6).flat(8).star(-13.5, 5.4).cp().flat(6)
    .ramp(7, 1.5).gap(5, -1).flat(4).bridge(5, 2, true).flat(3).bridge(5, 2, true, 1).flat(7)
    .to(10, -2.4).flat(6).cp().flat(7)
    .ferry(15, 2.5).flat(8).seesaw(8, 1.2).flat(4).ramp(8, 1.9).gap(8, -1.4).star(-4, 3.2).flat(12);
  return b.finish();
}

function arches(): Level {
  const b = new LevelBuilder({
    id: 'canyon-3', name: 'Арки', biome: 'canyon', tier: 3, surface: 'rock',
    blurb: 'Низкие каменные своды: прыгнешь слишком высоко — ударишься головой.', par: [32, 40, 58],
  });
  b.flat(10).roof(4, 10, 2.5, 1.6).flat(18).to(10, 2.5).roof(-2, 9, 3.2, 1.4).flat(6)
    .ramp(6, 0.9).gap(5, -0.6).roof(-9, 12, 3.6, 1.5).flat(8).star(-5.5, 1.5).cp().flat(6)
    .line(10, 5.5).crest(4, 0.6).flat(3).step(-0.6).flat(5).step(-0.7).flat(5).step(-0.8).flat(7)
    .roof(1, 8, 2.35, 1.4).bumps(2, 5, 0.35).flat(5).ramp(8, 2.1).gap(9, 0).star(-4.5, 3.9).flat(8).cp().flat(6)
    .surface('sand').to(12, -2).flat(6).surface('rock').boulder(1, 2.4, 0.7).flat(6).step(0.5).flat(2.4).step(0.55).flat(2.4).step(0.6).flat(6)
    .roof(2, 14, 2.6, 1.8).flat(6).hill(8, 0.6).flat(6).cp().flat(6)
    .line(12, -5).ramp(9, 2.5).gap(12, -1).roof(-11, 8, 6.4, 1.2).star(-6, 3.4).crest(6, -1).flat(8)
    .seesaw(8, 1.25).flat(6).ramp(7, 1.6).gap(6.5, 0.8).flat(10);
  return b.finish();
}

function glacier(): Level {
  const b = new LevelBuilder({
    id: 'glacier-1', name: 'Ледник', biome: 'glacier', tier: 2, surface: 'snow',
    blurb: 'На голом льду шина почти не держит: плавный газ и ранний тормоз.', par: [25, 31, 44],
  });
  b.flat(10).hill(10, 1.2).flat(5).surface('ice').flat(14).to(10, -1.6).flat(6).surface('snow').flat(5)
    .to(10, 2.6).star(-5, 2.6).flat(5).cp().flat(6)
    .surface('ice').to(16, -4).flat(8).surface('snow').ramp(8, 1.7).gap(6, -0.6).star(-3, 3).flat(8)
    .surface('ice').bumps(3, 6, 0.5).surface('snow').flat(6).cp().flat(6)
    .to(10, 2).surface('ice').flat(6).to(10, 2.4).surface('snow').flat(5).block(1, 4, 0.5, 1.2, 1.2, 'ice').flat(8)
    .block(0.5, 5, 0.95, 2, 0.05, 'ice').star(6.2, 2.3).flat(9).to(14, -4).surface('ice').flat(10).surface('snow')
    .ramp(8, 1.9).gap(7, -1).flat(12);
  return b.finish();
}

function icefall(): Level {
  const b = new LevelBuilder({
    id: 'glacier-2', name: 'Ледопад', biome: 'glacier', tier: 3, surface: 'snow',
    blurb: 'Ледяные ступени, трещины и скользкие подъёмы. Ошибок лёд не прощает.', par: [40, 50, 70],
  });
  b.flat(10).surface('ice').stairs(4, 3.4, -0.6).flat(5).surface('snow').to(8, 1.5).flat(4)
    .ramp(4, 0.5).gap(3.4, -0.7).flat(5).surface('ice').ramp(3, 0.35).gap(3.6, -0.7).flat(6).ramp(3, 0.35).gap(3.8, -0.7).surface('snow').flat(8).star(-10.5, 2.4).cp().flat(6)
    .line(12, 5).surface('ice').line(6, 2.5).surface('snow').crest(4, 0.6).flat(6)
    .surface('ice').to(18, -7).ramp(9, 2.4).gap(11, -1).star(-5.5, 4).surface('snow').crest(6, -1.2).flat(9).cp().flat(6)
    .block(0.6, 4, 0.6, 1.3, 1.3, 'ice').flat(7).block(0, 5.4, 1.3, 2.6, 0.05, 'ice').star(6.2, 2.9).flat(10)
    .surface('ice').seesaw(8, 1.2).flat(7).surface('snow').cp().flat(6)
    .ferry(12, 0).surface('ice').flat(6).to(12, -3).bumps(3, 5.5, 0.7).surface('snow').flat(12)
    .ramp(8, 1.9).gap(7.5, -0.5).flat(12);
  return b.finish();
}

function caldera(): Level {
  const b = new LevelBuilder({
    id: 'volcano-1', name: 'Кальдера', biome: 'volcano', tier: 3, surface: 'rock',
    blurb: 'Над лавой — только хлипкие плиты и подъёмники. Не задерживайтесь.', par: [44, 56, 80],
  });
  b.flat(10).rough(12, 0.2, 1).flat(4).bridge(7, 2, true).flat(5).ramp(7, 1.5).gap(6, 0.6).star(-3, 2.8).flat(8).cp().flat(7)
    .elevator(4.2).flat(6).line(8, -3.2).ramp(8, 2).gap(9, -1).flat(4).bridge(4, 2, true).flat(3.5).bridge(4, 2, true)
    .flat(8).star(-22, 2.2).cp().flat(7)
    .ferry(16, -2).flat(6).boulder(1, 2.6, 0.8).flat(6).step(0.55).flat(2.5).step(0.6).flat(2.5).step(0.6).flat(6).cp().flat(6)
    .line(12, -6).ramp(10, 3).gap(14, -1.5).star(-7, 4.8).crest(6, -1.4).flat(8).roof(0, 9, 2.5, 1.5).flat(12)
    .seesaw(8, 1.2).flat(2).bridge(6, 2, true, 1.2).flat(12);
  return b.finish();
}

function crater(): Level {
  const b = new LevelBuilder({
    id: 'volcano-2', name: 'Жерло', biome: 'volcano', tier: 3, surface: 'rock',
    blurb: 'Финальный экзамен: всё, чему научили предыдущие трассы, без передышки.', par: [64, 80, 115],
  });
  b.flat(10).ramp(7, 1.6).gap(7, 0).flat(5).rough(10, 0.24, 1.5).flat(3).boulder(0.5, 2.4, 0.8).flat(7)
    .seesaw(8, 1.25).flat(1.5).seesaw(8, 1.25).flat(8).star(-18, 3).cp().flat(7)
    .bridge(5, 2, true).flat(3).bridge(6, 2, true, -1.2).flat(3).bridge(5, 2, true, 1.2).flat(8).cp().flat(7)
    .elevator(4.5).flat(5).roof(2, 10, 2.45, 1.6).flat(14).line(12, -6).ramp(10, 2.6).gap(11, -1.6).star(-5.5, 4.2)
    .crest(6, -1.2).flat(9).cp().flat(7)
    .ferry(14, 2).flat(5).ferry(14, -2, 0.5).flat(8).cp().flat(6)
    .step(0.55).flat(2.4).step(0.6).flat(2.4).step(0.65).flat(4).line(10, 5.5).crest(4, 0.6).flat(10)
    .ramp(3, 0.4).gap(3.2, -0.6).flat(4.6).gap(3.2, -0.5).flat(4.6).gap(3.4, -0.5).flat(8).star(-12, 2.4).cp().flat(6)
    .line(16, -8).ramp(11, 3.2).gap(16, -2).crest(7, -1.6).flat(8).bumps(3, 5, 0.7).flat(4).ramp(7, 1.7).gap(7, 1).flat(12);
  return b.finish();
}

export const LEVELS: Level[] = [
  meadow(), rockTrail(), pines(), windfall(), serpentine(), redCanyon(),
  ropeBridge(), arches(), glacier(), icefall(), caldera(), crater(),
];
