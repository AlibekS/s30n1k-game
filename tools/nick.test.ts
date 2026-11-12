import { nickError } from '../src/nick';

const bad = ['nigger', 'N1gg3r', 'BlackRider', 'bl4ck', 'fuck', 'FuuuCK_you', 'f-u-c-k', 'блядь', 'Еблан', 'ЕБЛАН228', 'xyй', 'хуй', 'pizdec', 'blyad', 'suka_1', 'пидор', 'ab', 'a'.repeat(17), 'ник с пробелом', '12345', 'Гость', 'admin1', 'sh1t', 'b1tch', 'нигер'];
const good = ['Alibek', 'Rider_77', 'Алибек', 'мото-кот', 'Speedy', 'Gonzo', 'ВетерВГорах', 'trial_pro', 'Max'];
let fail = 0;
for (const n of bad) if (nickError(n) === null) { console.error('должен быть отклонён:', n); fail++; }
for (const n of good) { const e = nickError(n); if (e !== null) { console.error('должен пройти:', n, '—', e); fail++; } }
console.log(fail ? `ники: ошибок ${fail}` : `ники: ${bad.length} отклонено, ${good.length} принято — OK`);
if (fail) process.exit(1);
