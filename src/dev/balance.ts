/* Headless simulation harness. Runs full matches through the real Match engine
 * (no rendering) so scoring, shooting and faceoff balance can be measured.
 * Run with: npm run balance */
import { Match } from '../match/Match';
import { makeMatchConfig } from '../league/matchSetup';
import { getTeam, TEAMS } from '../data/teams';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../data/difficulty';
import { createFaceoff, stepFaceoff } from '../match/faceoff';
import { Rng } from '../core/rng';

const DT = 1 / 60;

function runGame(homeId: string, awayId: string, difficulty: 'rookie' | 'varsity' | 'allstate' | 'elite', seed: number) {
  const cfg = makeMatchConfig({
    homeTeam: getTeam(homeId),
    awayTeam: getTeam(awayId),
    humanSide: null,
    difficulty,
    gameLength: 'short',
    seed,
  });
  const m = new Match(cfg);
  let guard = 0;
  while (!m.isFinal() && guard++ < 60 * 60 * 30) m.update(DT);
  return m;
}

function pct(a: number, b: number): string {
  return b === 0 ? '—' : `${((a / b) * 100).toFixed(0)}%`;
}

const pairs: [string, string][] = [
  ['highland-park', 'jesuit-dallas'],
  ['st-marks', 'marcus'],
  ['frisco', 'highland-park'],
  ['coppell', 'esd'],
  ['wylie', 'grapevine'],
  ['prosper', 'plano'],
];

for (const diff of DIFFICULTY_ORDER) {
  let goals = 0; let shots = 0; let sog = 0; let saves = 0; let games = 0;
  let gb = 0; let to = 0; let fo = 0; let foTakes = 0;
  let homeWins = 0; let ties = 0;
  const scores: number[] = [];
  for (let i = 0; i < pairs.length; i++) {
    for (let r = 0; r < 3; r++) {
      const [h, a] = pairs[i];
      const m = runGame(h, a, diff, 1000 + i * 97 + r * 13);
      games++;
      goals += m.score.home + m.score.away;
      scores.push(m.score.home, m.score.away);
      shots += m.stats.home.shots + m.stats.away.shots;
      sog += m.stats.home.shotsOnGoal + m.stats.away.shotsOnGoal;
      saves += m.stats.home.saves + m.stats.away.saves;
      gb += m.stats.home.groundBalls + m.stats.away.groundBalls;
      to += m.stats.home.turnovers + m.stats.away.turnovers;
      fo += m.stats.home.faceoffWins;
      foTakes += m.stats.home.faceoffTakes;
      if (m.score.home > m.score.away) homeWins++;
      else if (m.score.home === m.score.away) ties++;
    }
  }
  const per = (n: number) => (n / games).toFixed(1);
  console.log(
    `${diff.padEnd(9)} goals/gm ${per(goals)}  shots/gm ${per(shots)}  SOG ${pct(sog, shots)}  ` +
    `save% ${pct(saves, saves + goals)}  GB/gm ${per(gb)}  TO/gm ${per(to)}  homeFO ${pct(fo, foTakes)}  ` +
    `home ${homeWins}/${games} ties ${ties}  max ${Math.max(...scores)}`,
  );
}

// Upset check: how often does a weak team beat a strong one?
let upsets = 0;
const N = 60;
for (let i = 0; i < N; i++) {
  const m = runGame('frisco', 'jesuit-dallas', 'varsity', 5000 + i);
  if (m.score.home > m.score.away) upsets++;
}
console.log(`\nFrisco (70 OVR) at home vs Jesuit (91 OVR): ${upsets}/${N} upsets`);

let mid = 0;
for (let i = 0; i < N; i++) {
  const m = runGame('mckinney', 'highland-park', 'varsity', 9000 + i);
  if (m.score.home > m.score.away) mid++;
}
console.log(`McKinney (74) vs Highland Park (89): home wins ${mid}/${N}`);

let even = 0;
for (let i = 0; i < N; i++) {
  const m = runGame('plano', 'coppell', 'varsity', 7000 + i);
  if (m.score.home > m.score.away) even++;
}
console.log(`Plano (78) vs Coppell (76): home wins ${even}/${N}`);
/* --- spacing: the AI should hold a shape, not chase the ball in a pack. --- */
{
  const cfg = makeMatchConfig({
    homeTeam: getTeam('highland-park'),
    awayTeam: getTeam('jesuit-dallas'),
    humanSide: null,
    difficulty: 'varsity',
    gameLength: 'short',
    seed: 777,
  });
  const g = new Match(cfg);
  let samples = 0;
  let nearestSum = 0;
  let clusterFrames = 0;
  let guard = 0;
  while (!g.isFinal() && guard++ < 60 * 60 * 30) {
    g.update(DT);
    if (g.phase !== 'live' || guard % 10 !== 0) continue;
    samples++;
    for (const side of ['home', 'away'] as const) {
      const field = g.teams[side].filter((p) => p.slot !== 'G');
      for (const a of field) {
        let best = Infinity;
        for (const b of field) {
          if (a === b) continue;
          best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y));
        }
        nearestSum += best;
      }
      const near = field.filter((p) => Math.hypot(p.x - g.ball.x, p.y - g.ball.y) < 6).length;
      if (near >= 4) clusterFrames++;
    }
  }
  const perPlayer = Math.max(1, samples * 2 * 9);
  console.log(
    `\nAI spacing: mean nearest teammate ${(nearestSum / perPlayer).toFixed(1)} yd, ` +
    `packed around the ball ${((clusterFrames / Math.max(1, samples * 2)) * 100).toFixed(1)}% of the time`,
  );
}

/* --- faceoff: timing should dominate, but the FOGO rating should be felt. --- */
console.log('\nFaceoff win rate by timing precision (human vs AI faceoff rating):');
{
  const rng = new Rng(4242);
  const trial = (humanFo: number, aiFo: number, precision: number, reps = 3000) => {
    let wins = 0;
    for (let i = 0; i < reps; i++) {
      const fo = createFaceoff(rng, humanFo, aiFo, DIFFICULTIES.varsity, true);
      const mid = (fo.zoneStart + fo.zoneEnd) / 2;
      const target = mid + rng.gauss(0, precision);
      let guard = 0;
      while (guard++ < 600) {
        const press = fo.stage === 'sweep' && !fo.humanDone && fo.marker >= target;
        if (stepFaceoff(fo, 1 / 60, press, rng, 'home', 'away')) break;
      }
      if (fo.winner === 'home') wins++;
    }
    return `${Math.round((wins / reps) * 100)}%`;
  };
  const matchups: [number, number, string][] = [
    [94, 68, 'elite FOGO vs weak'],
    [83, 90, 'good FOGO vs better'],
    [70, 90, 'weak FOGO vs elite'],
  ];
  for (const [h, a] of matchups) {
    console.log(
      `  ${String(h).padStart(2)} vs ${a}:  perfect ${trial(h, a, 0.01)}` +
      `   good ${trial(h, a, 0.05)}   sloppy ${trial(h, a, 0.12)}`,
    );
  }
}

console.log(`\nTeams loaded: ${TEAMS.length}`);
