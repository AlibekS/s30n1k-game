// Калибровка медалей: лучшее чистое время авто-райдера на разных скоростях.
import { LEVELS } from '../src/levels/index';
import { Sim, TICK } from '../src/sim/sim';
import { botControl } from './bot';

for (const level of LEVELS) {
  let best = Infinity, bestV = 0;
  const res: string[] = [];
  for (const speed of [9, 11, 13, 15, 17, 19, 22]) for (const airBias of [0, -0.1]) {
    const s = new Sim(level);
    const mem = { stuckX: -1e9, stuckT: 0, backT: 0, chargeT: 0 };
    for (let t = 0; t < 240 && s.state !== 'finished' && s.state !== 'crashed'; t += TICK) { s.tick(botControl(s, { speed, charge: false, airBias }, mem)); s.events.length = 0; }
    if (s.state === 'finished') { res.push(`${speed}:${s.time.toFixed(1)}`); if (s.time < best) { best = s.time; bestV = speed; } }
  }
  const lifts = level.props.filter((p) => p.type === 'lift').length;
  console.log(level.id.padEnd(10), `len=${level.finishX.toFixed(0)} lifts=${lifts} best=${best.toFixed(1)} @${bestV}  [${res.join(' ')}]`);
}
