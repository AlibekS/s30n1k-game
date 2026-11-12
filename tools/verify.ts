import { LEVELS } from '../src/levels/index';
import { runBot } from './bot';

let bad = 0;
const only = process.argv[2];
for (const level of LEVELS) {
  if (only && !level.id.includes(only)) continue;
  const t0 = Date.now();
  const r = runBot(level);
  if (!r.ok) bad++;
  console.log(
    `${r.ok ? 'OK  ' : 'FAIL'} ${level.id.padEnd(10)} len=${level.finishX.toFixed(0).padStart(4)}м cp=[${level.checkpoints.map((c) => c.toFixed(0)).join(',')}] ` +
    `time=${r.time.toFixed(1)}с попытки=[${r.attempts.join(',')}] звёзд=${r.stars}/${level.stars.length}` +
    (r.ok ? '' : ` застрял на x=${r.failX.toFixed(1)}`) + ` (${Date.now() - t0} мс)`,
  );
}
if (bad) { console.error(`не пройдено уровней: ${bad}`); process.exit(1); }
