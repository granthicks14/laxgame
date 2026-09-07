/* Measures the AI failure modes that are easy to introduce and hard to spot:
 * standing still, ignoring loose balls, grinding against the sidelines, and
 * bunching. Run with: npm run ai-audit */
import { Match } from '../match/Match';
import { makeMatchConfig } from '../league/matchSetup';
import { getTeam } from '../data/teams';
import { FIELD } from '../data/constants';
import { DIFFICULTY_ORDER } from '../data/difficulty';

const DT = 1 / 60;

function audit(difficulty: 'rookie' | 'varsity' | 'allstate' | 'elite') {
  const pairs: [string, string][] = [
    ['highland-park', 'dallas-jesuit'],
    ['plano', 'coppell'],
    ['grapevine', 'guyer'],
  ];
  let samples = 0;
  let idle = 0;
  let onWall = 0;
  let crease = 0;
  let nearest = 0;
  let players = 0;
  const looseWaits: number[] = [];
  let looseStart = -1;

  for (let g = 0; g < pairs.length; g++) {
    const m = new Match(makeMatchConfig({
      homeTeam: getTeam(pairs[g][0]),
      awayTeam: getTeam(pairs[g][1]),
      humanSide: null,
      difficulty,
      gameLength: 'short',
      seed: 900 + g,
    }));
    let guard = 0;
    let t = 0;
    while (!m.isFinal() && guard++ < 60 * 60 * 30) {
      m.update(DT);
      t += DT;
      // How long does a loose ball sit before somebody picks it up?
      if (m.phase === 'live' && m.ball.state === 'loose') {
        if (looseStart < 0) looseStart = t;
      } else if (looseStart >= 0) {
        looseWaits.push(t - looseStart);
        looseStart = -1;
      }
      if (m.phase !== 'live' || guard % 12 !== 0) continue;
      samples++;
      for (const p of m.players) {
        if (p.slot === 'G') continue;
        players++;
        if (Math.hypot(p.vx, p.vy) < 0.4) idle++;
        if (p.x < 0.9 || p.x > FIELD.length - 0.9 || p.y < 0.9 || p.y > FIELD.width - 0.9) onWall++;
        // Anyone jammed against the crease ring is being pushed by the clamp.
        const d1 = Math.hypot(p.x - 15, p.y - 30);
        const d2 = Math.hypot(p.x - 95, p.y - 30);
        if (Math.abs(d1 - 3.5) < 0.12 || Math.abs(d2 - 3.5) < 0.12) crease++;
        let best = Infinity;
        for (const q of m.teams[p.side]) {
          if (q === p || q.slot === 'G') continue;
          best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
        }
        nearest += best;
      }
    }
  }

  const pct = (n: number) => `${((n / Math.max(1, players)) * 100).toFixed(1)}%`;
  const waits = looseWaits.filter((w) => w > 0.05).sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor(waits.length / 2)] : 0;
  const slow = waits.filter((w) => w > 3).length;
  console.log(
    `${difficulty.padEnd(9)} idle ${pct(idle)}  on the sideline ${pct(onWall)}  ` +
    `stuck on the crease ${pct(crease)}  spacing ${(nearest / Math.max(1, players)).toFixed(1)}y  ` +
    `loose-ball pickup median ${median.toFixed(2)}s (${slow}/${waits.length} over 3s)`,
  );
  void samples;
}

console.log('AI behaviour audit\n');
for (const d of DIFFICULTY_ORDER) audit(d);
