import { LevelBuilder } from '../src/levels/builder';
import { Sim, TICK } from '../src/sim/sim';
import type { Controls } from '../src/sim/bike';

const meta = { id: 't', name: 't', biome: 'alps' as const, tier: 1 as const, blurb: '', par: [1, 2, 3] as [number, number, number] };
const flat = () => new LevelBuilder(meta).flat(400).finish();
const run = (name: string, level: ReturnType<typeof flat>, ctl: (t: number, s: Sim) => Controls, T: number, every = 0.5) => {
  const s = new Sim(level);
  console.log('---', name);
  let next = 0;
  for (let t = 0; t < T; t += TICK) {
    s.tick(ctl(t, s));
    if (t >= next) {
      next += every;
      const b = s.bike;
      console.log(`t=${t.toFixed(2)} x=${b.c.x.toFixed(2)} y=${b.c.y.toFixed(2)} a=${(b.c.a * 57.3).toFixed(1)} v=${b.c.vx.toFixed(2)} qr=${b.rearQ.toFixed(3)} qf=${b.frontQ.toFixed(3)} R${+b.rearContact}F${+b.frontContact} slip=${b.rearSlip.toFixed(2)} ${s.state}`);
    }
    if (s.state === 'crashed' && s.crashT > 0.3) break;
  }
  return s;
};
const C = (throttle = 0, brake = 0, lean = 0, crouch = false): Controls => ({ throttle, brake, lean, crouch });
run('rest', flat(), () => C(0, 0, 0.0001), 1.5);
run('full throttle', flat(), () => C(1), 8);
run('throttle + lean back', flat(), () => C(1, 0, -1), 3, 0.25);
run('brake from speed', flat(), (t) => (t < 3 ? C(1) : C(0, 1)), 6, 0.25);
run('reverse', flat(), () => C(0, 1, -1), 3);
run('hop', flat(), (t) => C(0, 0, 0.0001, t > 0.5 && t < 1.0), 2.2, 0.1);
const jump = new LevelBuilder(meta).flat(30).ramp(8, 2.2).gap(9, 0).flat(100).finish();
run('jump', jump, () => C(1), 7, 0.25);
run('jump+backflip', jump, (t, s) => C(1, 0, s.bike.grounded ? 0 : -1), 7, 0.1);
const hill = new LevelBuilder(meta).flat(10).line(30, 22).flat(50).finish();
run('climb 36deg', hill, () => C(1, 0, 0.6), 8);
const ice = new LevelBuilder(meta).flat(5).surface('ice').flat(200).finish();
run('ice', ice, () => C(1), 4);
