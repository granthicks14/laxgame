/**
 * HOW BIG IS A STAR, AND WHAT DOES THE DEFENCE TAKE BACK?
 *
 * A tuning instrument, not a test. It plays the same fixture repeatedly with
 * one attacker lifted by a given amount and reports what he produces, so the
 * star marking in ai.ts can be set against measurements instead of taste.
 *
 *   LIFTS=0,8,16,26 GAMES=80 npm run stars
 */
import { Match } from '../match/Match';
import { makeMatchConfig } from '../league/matchSetup';
import { getTeam } from '../data/teams';
import { refreshOverall, starTier, type PlayerData } from '../data/players';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const GAMES = Number(env.GAMES ?? 80);
const LIFTS = (env.LIFTS ?? '0,8,16,26').split(',').map(Number);

function run(lift: number) {
  let points = 0; let goals = 0; let shots = 0; let wins = 0; let gf = 0; let ga = 0;
  let rating = 0;
  for (let i = 0; i < GAMES; i++) {
    const cfg = makeMatchConfig({
      homeTeam: getTeam('highland-park'),
      awayTeam: getTeam('dallas-jesuit'),
      difficulty: 'varsity',
      gameLength: 'standard',
      humanSide: null,
      seed: 5000 + i * 37,
      replays: false,
    });
    const target = [...cfg.home.roster]
      .filter((p) => p.pos === 'A')
      .sort((a, b) => b.overall - a.overall)[0];
    if (lift > 0 && target) {
      for (const k of Object.keys(target.attrs) as (keyof PlayerData['attrs'])[]) {
        target.attrs[k] = Math.min(99, target.attrs[k] + lift);
      }
      refreshOverall(target);
    }
    rating += target?.overall ?? 0;
    const m = new Match(cfg);
    let guard = 0;
    while (m.phase !== 'final' && guard++ < 40) m.simulateQuarter();
    const s = m.playerStats().get(target?.id ?? '');
    if (s) { points += s.goals + s.assists; goals += s.goals; shots += s.shots; }
    if (m.score.home > m.score.away) wins++;
    gf += m.score.home; ga += m.score.away;
  }
  return {
    lift,
    ovr: rating / GAMES,
    points: points / GAMES,
    goals: goals / GAMES,
    shots: shots / GAMES,
    wins: wins / GAMES,
    gf: gf / GAMES,
    ga: ga / GAMES,
  };
}

console.log(`${GAMES} games per arm, same fixtures, one attacker lifted\n`);
console.log('lift   his OVR   star    pts/g   g/g    sh/g   team GF   team GA   win%');
for (const lift of LIFTS) {
  const r = run(lift);
  const tier = starTier(Math.round(r.ovr), 'hs');
  console.log(
    `${String(lift).padStart(4)}${r.ovr.toFixed(1).padStart(10)}`
    + `${(tier === 2 ? 'ELITE' : tier === 1 ? 'STAR' : '—').padStart(8)}`
    + `${r.points.toFixed(2).padStart(9)}${r.goals.toFixed(2).padStart(7)}${r.shots.toFixed(2).padStart(7)}`
    + `${r.gf.toFixed(2).padStart(10)}${r.ga.toFixed(2).padStart(10)}`
    + `${`${(r.wins * 100).toFixed(0)}%`.padStart(7)}`,
  );
}
