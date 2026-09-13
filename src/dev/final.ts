/**
 * THE FINAL SWEEP
 *
 * The systems that no other harness owns, driven hard and checked against what
 * they claim to do:
 *
 *   SUPERSTARS   a star has to be worth having and possible to beat. Both
 *                halves are measured on the field, in real matches, by making
 *                one player elite and playing the same fixture without him.
 *   STATISTICS   a season's numbers have to be internally consistent: nobody
 *                scores more goals than he took shots, nobody plays more games
 *                than were played, career totals never fall behind a season.
 *   SAVES        every mode has to survive being written to storage and read
 *                back, with the career intact.
 *
 *   npm run final
 */
import { Match } from '../match/Match';
import { makeMatchConfig } from '../league/matchSetup';
import { getTeam } from '../data/teams';
import { Rng } from '../core/rng';
import { refreshOverall, type PlayerData } from '../data/players';
import {
  advancePhase, createCareer, nextUserGame, runOffseason, simulateUserGame,
  startChallenge, validateRecords,
} from '../league/career';
import type { Career, CareerMode } from '../league/types';
import {
  planMovement, promotionSpots, relegationSpots, type DivisionResult,
} from '../league/promotion';

const env = (globalThis as {
  process?: { exit(n: number): void; env?: Record<string, string | undefined> };
}).process;
/** GAMES / LIFT override the superstar experiment, for tuning runs. */
const GAMES = Number(env?.env?.GAMES ?? 60);
const LIFT = Number(env?.env?.LIFT ?? 16);
const problems: string[] = [];
let checks = 0;
function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
}

/* ------------------------------------------------------------- superstars */

interface StarRun {
  /** Points per game by the player in the star's slot. */
  points: number;
  /** How often his side won. */
  winRate: number;
  goalsFor: number;
  goalsAgainst: number;
}

/**
 * Plays the same fixture `games` times. `lift` is added to one home attacker's
 * attributes, so the only difference between the two runs is that one squad has
 * a genuine star in it.
 */
function starRun(games: number, lift: number): StarRun {
  let points = 0;
  let wins = 0;
  let gf = 0;
  let ga = 0;
  let starId = '';
  for (let i = 0; i < games; i++) {
    const cfg = makeMatchConfig({
      homeTeam: getTeam('highland-park'),
      awayTeam: getTeam('dallas-jesuit'),
      difficulty: 'varsity',
      gameLength: 'standard',
      humanSide: null,
      seed: 5000 + i * 37,
      replays: false,
    });
    // The best attacker on the home roster is the one who gets the lift.
    const roster = cfg.home.roster;
    const target = [...roster]
      .filter((p) => p.pos === 'A')
      .sort((a, b) => b.overall - a.overall)[0];
    if (lift > 0 && target) {
      for (const k of Object.keys(target.attrs) as (keyof PlayerData['attrs'])[]) {
        target.attrs[k] = Math.min(99, target.attrs[k] + lift);
      }
      refreshOverall(target);
    }
    starId = target?.id ?? '';

    const m = new Match(cfg);
    let guard = 0;
    while (m.phase !== 'final' && guard++ < 40) m.simulateQuarter();
    const stats = m.playerStats().get(starId);
    if (stats) points += stats.goals + stats.assists;
    if (m.score.home > m.score.away) wins++;
    gf += m.score.home;
    ga += m.score.away;
  }
  return { points: points / games, winRate: wins / games, goalsFor: gf / games, goalsAgainst: ga / games };
}

{
  const plain = starRun(GAMES, 0);
  const star = starRun(GAMES, LIFT);
  // A win rate over a handful of games is mostly noise: sixty is where the two
  // arms separate cleanly. A smaller GAMES is for quick tuning passes, so the
  // sample-sensitive assertions stand down rather than report a false failure.
  const enough = GAMES >= 40;
  if (!enough) {
    console.log(`  (GAMES=${GAMES} — indicative only; the rate checks need 40+)\n`);
  }

  console.log('SUPERSTARS');
  console.log(`  ordinary squad   ${plain.points.toFixed(2)} pts/game from the slot, `
    + `${(plain.winRate * 100).toFixed(0)}% wins, ${plain.goalsFor.toFixed(1)}-${plain.goalsAgainst.toFixed(1)}`);
  console.log(`  with a star      ${star.points.toFixed(2)} pts/game from the slot, `
    + `${(star.winRate * 100).toFixed(0)}% wins, ${star.goalsFor.toFixed(1)}-${star.goalsAgainst.toFixed(1)}\n`);

  // Measured with `npm run stars`: lifting the slot by 16 takes it from about
  // 5.0 points a game to 6.7, and the side from 42% to 60%. The bar sits well
  // under both so ordinary variance cannot fail the run, and well over nothing
  // so a star that stops mattering does.
  if (enough) {
    check('a star is worth having', star.points > plain.points * 1.2,
      `${plain.points.toFixed(2)} -> ${star.points.toFixed(2)} points a game`);
  }
  check('a star lifts the scoreboard, not just his own line',
    star.goalsFor > plain.goalsFor,
    `${plain.goalsFor.toFixed(1)} -> ${star.goalsFor.toFixed(1)} goals a game`);
  if (enough) {
    check('a star lifts the side that has him', star.winRate > plain.winRate,
      `${(plain.winRate * 100).toFixed(0)}% -> ${(star.winRate * 100).toFixed(0)}%`);
  }
  check('a star is not a cheat code', star.winRate <= 0.9,
    `${(star.winRate * 100).toFixed(0)}% wins over ${GAMES} games`);
  check('the other side can still score', star.goalsAgainst > 2,
    `${star.goalsAgainst.toFixed(1)} conceded a game`);
  // How rare a star is across a whole league is measured where the whole league
  // is in scope — `npm run ratings` samples every level and fails if the mark
  // dies out or becomes common. Two of the district's best programmes are not
  // that population, so it is not asked here.
}

/* ------------------------------------------------------------- statistics */

function seasonOf(mode: CareerMode): Career {
  const career = mode === 'challenge'
    ? startChallenge({ difficulty: 'varsity', gameLength: 'short', seed: 8123 })
    : createCareer({
      mode, teamId: 'highland-park', difficulty: 'varsity',
      gameLength: 'short', seed: 8123,
    });
  let guard = 0;
  while (guard++ < 600) {
    const g = nextUserGame(career);
    if (!g) break;
    simulateUserGame(career, g);
  }
  advancePhase(career);
  return career;
}

{
  console.log('\nSTATISTICS');
  const career = seasonOf('dynasty');
  const played = career.schedule.filter((g) => g.played && g.featured).length;
  const bad: string[] = [];
  for (const p of career.roster) {
    const s = p.season;
    const c = p.career;
    if (s.goals > s.shots) bad.push(`${p.last}: ${s.goals} goals off ${s.shots} shots`);
    if (s.gamesPlayed > played) bad.push(`${p.last}: ${s.gamesPlayed} games of ${played}`);
    if (c.goals < s.goals || c.assists < s.assists || c.gamesPlayed < s.gamesPlayed) {
      bad.push(`${p.last}: career behind the season`);
    }
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'number' && (v < 0 || !Number.isFinite(v))) bad.push(`${p.last}: ${k}=${v}`);
    }
    if (p.pos !== 'G' && s.saves > 0) bad.push(`${p.last} is a ${p.pos} with ${s.saves} saves`);
  }
  check('every season line is internally consistent', bad.length === 0, bad.slice(0, 3).join('; '));
  check('the squad actually played', career.roster.some((p) => p.season.gamesPlayed > 0),
    `${played} games on the schedule`);
  const issues = validateRecords(career);
  check('the record matches the schedule', issues.length === 0, issues.slice(0, 2).join('; '));

  // And again after an offseason, which rewrites the roster.
  runOffseason(career);
  const carried = career.roster.filter((p) => p.career.gamesPlayed > 0).length;
  check('career totals survive the offseason', carried > 0, `${carried} players with a history`);
  check('season totals are cleared for the new year',
    career.roster.every((p) => p.season.gamesPlayed === 0));
}

/* ------------------------------------------------------------------ saves */

{
  console.log('\nSAVES');
  // A real localStorage stand-in, so the save path under test is the app's own.
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  // Imported here: the module reads localStorage when it loads.
  const saves = await import('../state/saves');

  for (const mode of ['season', 'dynasty', 'challenge', 'superchallenge'] as CareerMode[]) {
    const career = mode === 'challenge' || mode === 'superchallenge'
      ? startChallenge({
        difficulty: 'varsity', gameLength: 'short', seed: 4242,
        mode: mode as 'challenge' | 'superchallenge',
      })
      : createCareer({
        mode, teamId: 'highland-park', difficulty: 'varsity', gameLength: 'short', seed: 4242,
      });
    // Play a couple of games so there is something to lose.
    for (let i = 0; i < 3; i++) {
      const g = nextUserGame(career);
      if (!g) break;
      simulateUserGame(career, g);
    }
    saves.saveCareer(career);
    const back = saves.loadCareer(mode);
    check(`${mode}: the career comes back`, !!back);
    if (!back) continue;
    check(`${mode}: the squad comes back whole`, back.roster.length === career.roster.length,
      `${back.roster.length}/${career.roster.length}`);
    check(`${mode}: the record comes back`,
      JSON.stringify(back.standings[back.teamId]) === JSON.stringify(career.standings[career.teamId]));
    check(`${mode}: the schedule comes back`,
      back.schedule.filter((g) => g.played).length === career.schedule.filter((g) => g.played).length);
    check(`${mode}: it is still the same mode`, back.mode === mode, back.mode);
    if (mode === 'challenge' || mode === 'superchallenge') {
      check(`${mode}: the climb comes back`, !!back.challenge
        && back.challenge.stageIndex === career.challenge!.stageIndex
        && back.challenge.tier === career.challenge!.tier,
        `${back.challenge?.tier} at rung ${(back.challenge?.stageIndex ?? -1) + 1}`);
    }
    const issues = validateRecords(back);
    check(`${mode}: the loaded career validates`, issues.length === 0, issues.slice(0, 2).join('; '));
  }
}

/* ------------------------------------------------- promotion and relegation */

{
  console.log('\nPROMOTION AND RELEGATION');
  // Synthetic final tables, so the rule is tested rather than a season's luck.
  const divisions: DivisionResult[] = [
    { key: 'a', order: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'], champion: 'a1' },
    { key: 'b', order: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'], champion: 'b2' },
    { key: 'c-east', order: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], champion: 'e1' },
    { key: 'c-west', order: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'], champion: 'w3' },
    { key: 'd', order: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'], champion: 'd1' },
  ];
  const sizes = new Map(divisions.map((d) => [d.key, d.order.length]));
  const report = planMovement(divisions, 2);

  // Every division has to be the same size next season: a promotion without a
  // matching relegation drains one division and inflates the other, year on
  // year, which is what this rule replaced.
  const after = new Map(sizes);
  for (const m of report.moves) {
    after.set(m.from, (after.get(m.from) ?? 0) - 1);
    after.set(m.to, (after.get(m.to) ?? 0) + 1);
  }
  const kept = [...sizes.entries()].every(([k, n]) => after.get(k) === n);
  check('no division changes size', kept,
    [...after.entries()].map(([k, n]) => `${k}:${n}/${sizes.get(k)}`).join(' '));
  check('promotions and relegations are matched',
    report.moves.filter((m) => m.direction === 'up').length
    === report.moves.filter((m) => m.direction === 'down').length,
    `${report.moves.filter((m) => m.direction === 'up').length} up`);
  check('nobody moves twice',
    new Set(report.moves.map((m) => m.teamId)).size === report.moves.length);
  check('every move has a reason', report.moves.every((m) => !!m.reason));
  check('a champion goes up', report.moves.some((m) => m.direction === 'up' && /won the/i.test(m.reason)),
    report.moves.filter((m) => m.direction === 'up').map((m) => m.reason)[0] ?? 'none');
  check('the drop comes from the bottom',
    report.moves.filter((m) => m.direction === 'down')
      .every((m) => /finished \d+\w+ of/i.test(m.reason)));
  // The spots the screens quote have to be the spots the rule uses.
  for (const key of ['a', 'b', 'c-east', 'c-west', 'd'] as const) {
    const up = report.moves.filter((m) => m.direction === 'up' && m.from === key).length;
    const down = report.moves.filter((m) => m.direction === 'down' && m.from === key).length;
    check(`${key}: the promotion spots match what a coach is told`, up === promotionSpots(key),
      `${up} moved, ${promotionSpots(key)} advertised`);
    check(`${key}: the relegation spots match`, down === relegationSpots(key),
      `${down} moved, ${relegationSpots(key)} advertised`);
  }
}

/* --------------------------------------------------------------- the bill */

const rng = new Rng('final');
void rng;
console.log();
if (problems.length) {
  console.log(`${problems.length} of ${checks} checks FAILED:`);
  for (const p of problems) console.log(`  - ${p}`);
  env?.exit(1);
} else {
  console.log(`${checks}/${checks} checks passed`);
}
