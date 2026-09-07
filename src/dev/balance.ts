/* Headless simulation harness. Runs full matches through the real Match engine
 * (no rendering) so scoring, shooting and faceoff balance can be measured.
 * Run with: npm run balance */
import { Match } from '../match/Match';
import { makeMatchConfig } from '../league/matchSetup';
import { getTeam, TEAMS } from '../data/teams';
import { DIFFICULTY_ORDER } from '../data/difficulty';

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
console.log(`\nTeams loaded: ${TEAMS.length}`);
