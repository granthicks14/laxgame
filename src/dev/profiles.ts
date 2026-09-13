/**
 * DOES A TEAM PLAY LIKE ITS ROSTER?
 *
 * A squad is not one number. An attack of 94 behind a defence of 70 is a
 * different team from a balanced 85 — it should score more and concede more,
 * lose shoot-outs it has no business being in, and struggle to hold a lead. A
 * defence of 94 in front of a keeper of 95 with nothing up front should win
 * 8-6 and lose 7-6.
 *
 * This measures both halves of the game against that:
 *
 *   SIMULATED  the league's own `simulateMatch`, over hundreds of fixtures
 *   PLAYED     the real match engine, with rosters built to the same shapes
 *
 * Both have to show the same team behaving the same way, or the coach is
 * building a squad for one half of his own game.
 *
 *   npm run profiles
 */
import { Rng } from '../core/rng';
import { simulateMatch } from '../league/simulate';
import { Match } from '../match/Match';
import { makeMatchConfig } from '../league/matchSetup';
import { getTeam } from '../data/teams';
import { generateRoster, refreshOverall, type PlayerData } from '../data/players';
import type { TeamRatings } from '../data/teams';
import type { Position } from '../data/constants';

const env = (globalThis as { process?: { exit(n: number): void } }).process;
const problems: string[] = [];
let checks = 0;
function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
}

/* ------------------------------------------------------------ the archetypes
 * Three squads of the SAME overall standard, arranged differently. Everything
 * that is not being tested — chemistry, faceoffs, speed — is held equal, so a
 * difference in the results is the arrangement and nothing else.
 * ------------------------------------------------------------------------ */

interface Shape {
  key: string;
  name: string;
  attack: number;
  midfield: number;
  defense: number;
  goalie: number;
}

const SHAPES: Shape[] = [
  { key: 'offense', name: 'Elite offence, poor defence', attack: 94, midfield: 93, defense: 70, goalie: 72 },
  { key: 'balanced', name: 'Balanced', attack: 83, midfield: 83, defense: 83, goalie: 83 },
  { key: 'defense', name: 'Elite defence, poor offence', attack: 70, midfield: 75, defense: 94, goalie: 95 },
];

function ratingsOf(s: Shape): TeamRatings {
  const offense = Math.round(s.attack * 0.55 + s.midfield * 0.45);
  const defense = Math.round(s.defense * 0.6 + s.goalie * 0.4);
  return {
    overall: Math.round(offense * 0.42 + defense * 0.42 + 70 * 0.08 + 70 * 0.08),
    offense,
    defense,
    goalie: s.goalie,
    attack: s.attack,
    midfield: s.midfield,
    faceoff: 70,
    speed: 70,
    chemistry: 70,
  };
}

/* --------------------------------------------------------------- simulated */

interface Line { gf: number; ga: number; wins: number; games: number; high: number }

function simulated(shape: Shape, games: number): Line {
  const me = ratingsOf(shape);
  const line: Line = { gf: 0, ga: 0, wins: 0, games, high: 0 };
  for (let i = 0; i < games; i++) {
    // A league of ordinary opponents, so the only variable is our own shape.
    const foe = ratingsOf(SHAPES[1]);
    const r = simulateMatch(me, foe, `profile:${shape.key}:${i}`, {
      level: 'hs', lengthScale: 3, homeAdvantage: i % 2 === 0,
    });
    line.gf += r.homeScore;
    line.ga += r.awayScore;
    if (r.homeScore > r.awayScore) line.wins++;
    if (r.homeScore + r.awayScore >= 24) line.high++;
  }
  return line;
}

/* ------------------------------------------------------------------ played */

/** Rebuilds a real roster to a shape: the players carry the ratings. */
function rosterFor(shape: Shape, seed: string): PlayerData[] {
  const roster = generateRoster(getTeam('highland-park'), seed, 'hs');
  const target: Record<Position, number> = {
    A: shape.attack, M: shape.midfield, D: shape.defense, G: shape.goalie, FO: 70,
  };
  const rng = new Rng(`shape:${seed}`);
  for (const p of roster) {
    const want = target[p.pos] ?? 70;
    // Spread the squad around its target the way a real depth chart is spread.
    const level = Math.round(want + rng.range(-7, 4));
    for (const k of Object.keys(p.attrs) as (keyof PlayerData['attrs'])[]) {
      // Everyone gets the athletic baseline; the position's own skills carry
      // the shape, which is what the match engine actually reads.
      const positional = k === 'goalie' ? p.pos === 'G'
        : k === 'faceoff' ? p.pos === 'FO'
          : true;
      p.attrs[k] = Math.max(20, Math.min(99, positional ? level : 70));
    }
    p.grade = 11;
    refreshOverall(p);
  }
  return roster;
}

function played(shape: Shape, games: number): Line {
  const line: Line = { gf: 0, ga: 0, wins: 0, games, high: 0 };
  for (let i = 0; i < games; i++) {
    const m = new Match(makeMatchConfig({
      homeTeam: getTeam('highland-park'),
      awayTeam: getTeam('dallas-jesuit'),
      homeRoster: rosterFor(shape, `${shape.key}:${i}`),
      awayRoster: rosterFor(SHAPES[1], `foe:${i}`),
      difficulty: 'varsity',
      gameLength: 'long',
      humanSide: null,
      seed: 90000 + i * 131,
      replays: false,
    }));
    let guard = 0;
    while (m.phase !== 'final' && guard++ < 40) m.simulateQuarter();
    line.gf += m.score.home;
    line.ga += m.score.away;
    if (m.score.home > m.score.away) line.wins++;
    if (m.score.home + m.score.away >= 24) line.high++;
  }
  return line;
}

/* -------------------------------------------------------------------- run */

const SIM_GAMES = 400;
const PLAY_GAMES = 24;

const simLines: Record<string, Line> = {};
const playLines: Record<string, Line> = {};

console.log(`TEAM SHAPES — ${SIM_GAMES} simulated and ${PLAY_GAMES} played games each,`
  + ' every opponent a balanced side\n');
console.log('shape                          A   M   D   G   |  simulated GF-GA  win%  |  played GF-GA  win%');
for (const s of SHAPES) {
  simLines[s.key] = simulated(s, SIM_GAMES);
  playLines[s.key] = played(s, PLAY_GAMES);
  const sl = simLines[s.key];
  const pl = playLines[s.key];
  console.log(
    `${s.name.padEnd(30)}${String(s.attack).padStart(3)} ${String(s.midfield).padStart(3)} `
    + `${String(s.defense).padStart(3)} ${String(s.goalie).padStart(3)}   |`
    + `${(sl.gf / sl.games).toFixed(1).padStart(9)}-${(sl.ga / sl.games).toFixed(1).padEnd(5)}`
    + `${`${((sl.wins / sl.games) * 100).toFixed(0)}%`.padStart(5)}   |`
    + `${(pl.gf / pl.games).toFixed(1).padStart(8)}-${(pl.ga / pl.games).toFixed(1).padEnd(5)}`
    + `${`${((pl.wins / pl.games) * 100).toFixed(0)}%`.padStart(5)}`,
  );
}
console.log();

const per = (l: Line) => ({ gf: l.gf / l.games, ga: l.ga / l.games });

for (const [where, lines] of [['simulated', simLines], ['played', playLines]] as const) {
  const off = per(lines.offense);
  const def = per(lines.defense);
  const bal = per(lines.balanced);

  // TEST 1 — elite offence, terrible defence: high scoring BOTH ways.
  check(`${where}: an elite offence outscores a balanced side`, off.gf > bal.gf + 0.8,
    `${bal.gf.toFixed(1)} -> ${off.gf.toFixed(1)} goals`);
  check(`${where}: and a poor defence concedes much more`, off.ga > bal.ga + 1.2,
    `${bal.ga.toFixed(1)} -> ${off.ga.toFixed(1)} conceded`);

  // TEST 2 — elite defence, weak offence: low scoring BOTH ways.
  check(`${where}: an elite defence concedes far fewer`, def.ga < bal.ga - 1.2,
    `${bal.ga.toFixed(1)} -> ${def.ga.toFixed(1)} conceded`);
  check(`${where}: and a weak offence scores fewer`, def.gf < bal.gf - 0.8,
    `${bal.gf.toFixed(1)} -> ${def.gf.toFixed(1)} goals`);

  // The shapes have to produce genuinely different GAMES, not just different
  // results: the shoot-out team's games are far higher scoring than the
  // defensive team's.
  const offTotal = off.gf + off.ga;
  const defTotal = def.gf + def.ga;
  check(`${where}: the two shapes play different games`, offTotal > defTotal + 5,
    `${offTotal.toFixed(1)} goals a game v ${defTotal.toFixed(1)}`);

  // And neither arrangement is simply better: two squads of the same standard
  // should both be competitive.
  const offWin = lines.offense.wins / lines.offense.games;
  const defWin = lines.defense.wins / lines.defense.games;
  check(`${where}: neither shape is a free win`, offWin < 0.85 && defWin < 0.85,
    `${(offWin * 100).toFixed(0)}% and ${(defWin * 100).toFixed(0)}%`);
}

console.log();
if (problems.length) {
  console.log(`${problems.length} of ${checks} checks FAILED:`);
  for (const p of problems) console.log(`  - ${p}`);
  env?.exit(1);
} else {
  console.log(`${checks}/${checks} checks passed`);
}
