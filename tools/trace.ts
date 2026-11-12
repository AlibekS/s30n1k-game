import { LEVELS } from '../src/levels/index';
import { Sim, TICK } from '../src/sim/sim';
import { botControl, PLANS } from './bot';

const [id, cp, planIdx, from, to] = process.argv.slice(2);
const level = LEVELS.find((l) => l.id === id)!;
const s = new Sim(level);
s.cpIndex = Number(cp);
s.respawn();
const plan = PLANS[Number(planIdx)];
const mem = { stuckX: -1e9, stuckT: 0, backT: 0, chargeT: 0 };
let next = 0;
for (let t = 0; t < 60; t += TICK) {
  const ctl = botControl(s, plan, mem);
  s.tick(ctl);
  const b = s.bike;
  if (t >= next && b.c.x >= Number(from) && b.c.x <= Number(to)) {
    next = t + 0.1;
    console.log(`t=${t.toFixed(2)} x=${b.c.x.toFixed(2)} y=${b.c.y.toFixed(2)} a=${(b.c.a * 57.3).toFixed(0)} vx=${b.c.vx.toFixed(1)} vy=${b.c.vy.toFixed(1)} R${+b.rearContact}F${+b.frontContact} thr=${ctl.throttle} br=${ctl.brake} lean=${ctl.lean.toFixed(2)} gnd=${s.world.rayDown(b.c.x, b.c.y - 1).toFixed(2)} ${s.state}`);
  }
  if (s.state === 'crashed' && s.crashT > 0.3) break;
  if (b.c.x > Number(to)) break;
}
