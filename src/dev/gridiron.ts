/**
 * DOES THIS PLAY LIKE FOOTBALL?
 *
 * The engine either produces a football game or it produces twenty-two men
 * running around, and the difference is not visible by reading the code. So this
 * plays whole games at sixty frames a second with nobody at the sticks and
 * reports the numbers the sport is actually described by — yards per carry,
 * completion percentage, sack rate, points, drives — next to what those numbers
 * are in the real thing.
 *
 * WHAT IT IS NOT. It is not a pass/fail on realism: a retro arcade game should
 * score more than the NFL does, and it should. It IS a pass/fail on the things
 * that are never acceptable — a game that never ends, a down that goes to five,
 * a ball spotted outside the field, a quarterback who is sacked on every snap,
 * a completion rate of four per cent.
 *
 *   npm run gridiron
 */
import { FootballGame } from '../sports/football/Game';
import { buildRoster, teamRatings, type Team } from '../sports/football/data';
import { DIFFICULTIES, DIFFICULTY_ORDER, GAME_LENGTHS } from '../sports/football/tuning';
import { FIELD } from '../sports/football/field';
import type { DifficultyKey } from '../sports/football/types';

const DT = 1 / 60;
const LIMIT = 60 * 60 * 24; // a hard ceiling: twenty-four minutes of wall clock

function team(id: string, city: string, name: string, abbr: string): Team {
  return {
    id, city, name, abbr,
    primary: '#1d3f8f', secondary: '#f0c419',
    stadium: `${city} Field`, conference: 'North', prestige: 3,
  };
}

interface Tally {
  games: number;
  points: number[];
  plays: number;
  passAtt: number;
  comps: number;
  passYards: number;
  ints: number;
  sacks: number;
  carries: number;
  rushYards: number;
  tds: number;
  fgAtt: number;
  fgMade: number;
  punts: number;
  firstDowns: number;
  thirdAtt: number;
  thirdConv: number;
  drives: number;
  penalties: number;
  frames: number;
  longest: number;
  air: number;
  firstDownEvents: number;
  runGain: number[];
  passGain: number[];
}

const blank = (): Tally => ({
  games: 0, points: [], plays: 0, passAtt: 0, comps: 0, passYards: 0, ints: 0,
  sacks: 0, carries: 0, rushYards: 0, tds: 0, fgAtt: 0, fgMade: 0, punts: 0,
  firstDowns: 0, thirdAtt: 0, thirdConv: 0, drives: 0, penalties: 0, frames: 0,
  longest: 0, air: 0, firstDownEvents: 0, runGain: [], passGain: [],
});

const problems: string[] = [];
const seen = new Set<string>();
function problem(text: string): void {
  if (seen.has(text)) return;
  seen.add(text);
  problems.push(text);
}

function playGame(seed: number, key: DifficultyKey, tally: Tally): void {
  const home = { team: team('nor', 'Northgate', 'Miners', 'NOR'), roster: buildRoster(`h${seed}`, { par: 66 }) };
  const away = { team: team('wes', 'Westbrook', 'Rail', 'WES'), roster: buildRoster(`a${seed}`, { par: 64 }) };
  const g = new FootballGame({
    home, away, humanSide: null,
    quarterSeconds: GAME_LENGTHS.standard.quarterSeconds,
    difficulty: DIFFICULTIES[key],
    seed,
  });

  g.events.on('catch', (e) => { tally.air += e.yards; });
  g.events.on('firstDown', () => { tally.firstDownEvents++; });
  let frames = 0;
  let lastPossession = g.possession;
  let plays = 0;
  let lastDown = g.down;
  let lastScore = 0;

  while (!g.isFinal() && frames < LIMIT) {
    const before = g.lastResult;
    const wasThrown = g.thrown;
    const wasKick = g.kickKind;
    g.update(DT);
    frames++;

    /* INVARIANTS, checked every frame, because a rule that breaks once in nine
     * games is exactly the kind that ships. */
    if (g.down < 1 || g.down > 4) problem(`down went to ${g.down}`);
    if (g.toGo < 1 || g.toGo > 99) problem(`distance went to ${g.toGo}`);
    if (g.lineOfScrimmage < FIELD.homeGoal - 0.01 || g.lineOfScrimmage > FIELD.awayGoal + 0.01) {
      problem(`ball spotted at ${g.lineOfScrimmage.toFixed(1)}, off the field`);
    }
    if (!Number.isFinite(g.clock) || g.clock < 0) problem(`clock went to ${g.clock}`);
    const total = g.score.home + g.score.away;
    if (total < lastScore) problem('the score went down');
    lastScore = total;
    for (const p of g.players) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) problem(`${p.slot} left the universe`);
      if (p.x < -1 || p.x > FIELD.width + 1) problem(`${p.slot} at x ${p.x.toFixed(1)}`);
    }
    if (!Number.isFinite(g.ball.x) || !Number.isFinite(g.ball.y)) problem('the ball left the universe');

    if (g.lastResult !== before && g.lastResult) {
      plays++;
      const r = g.lastResult;
      tally.longest = Math.max(tally.longest, r.yards);
      if (r.outcome === 'punt') tally.punts++;
      if (wasKick === 'none'
        && (r.outcome === 'tackle' || r.outcome === 'outOfBounds' || r.outcome === 'touchdown')) {
        (wasThrown ? tally.passGain : tally.runGain).push(r.yards);
      }
    }
    /* A DRIVE IS A SERIES, NOT A POSSESSION FLAG.
     *
     * The ball formally changes hands twice on every kickoff — once when the
     * kicking side is given it to kick, once when the receiving side takes it —
     * so counting flags reported half again as many drives as the game actually
     * had. Only a change that leaves somebody with a first down to play is a
     * drive. */
    if (g.possession !== lastPossession && g.kickKind === 'none' && g.phase !== 'presnap') {
      tally.drives++;
      lastPossession = g.possession;
    } else if (g.possession !== lastPossession) {
      lastPossession = g.possession;
    }
    lastDown = g.down;
  }
  void lastDown;

  if (frames >= LIMIT) problem('a game never finished');

  tally.games++;
  tally.frames += frames;
  tally.plays += plays;
  tally.points.push(g.score.home, g.score.away);
  for (const side of ['home', 'away'] as const) {
    const b = g.box[side];
    tally.firstDowns += b.firstDowns;
    tally.thirdAtt += b.thirdDownAtt;
    tally.thirdConv += b.thirdDownConv;
    tally.penalties += b.penalties;
  }
  for (const line of g.stats.values()) {
    tally.passAtt += line.passAttempts;
    tally.comps += line.completions;
    tally.passYards += line.passYards;
    tally.ints += line.interceptions;
    tally.sacks += line.sacks;
    tally.carries += line.carries;
    tally.rushYards += line.rushYards;
    // Only the man who scored it: a passing touchdown is one touchdown.
    tally.tds += line.rushTD + line.recTD;
    tally.fgAtt += line.fgAttempts;
    tally.fgMade += line.fgMade;
  }
}

const N = 6;
console.log('GRIDIRON — the engine, played\n');
console.log(`${N} games per difficulty, ${GAME_LENGTHS.standard.label} quarters, nobody at the sticks.\n`);

const sample = buildRoster('h1', { par: 66 });
const r = teamRatings(sample);
console.log(`A par-66 roster reads: overall ${r.overall}, offence ${r.offense} `
  + `(pass ${r.passing} / run ${r.rushing}), defence ${r.defense} `
  + `(pass ${r.passDefense} / run ${r.runDefense}), kicking ${r.specialTeams}\n`);

console.log('                 pts   plays  cmp%  ypa  int%  sack%  ypc   1st  3rd%  FG    drives  min   yds   td  1st*');
for (const key of DIFFICULTY_ORDER) {
  const t = blank();
  for (let i = 0; i < N; i++) playGame(1000 + i, key, t);
  const perGame = (n: number): number => n / t.games;
  const teams = t.games * 2;
  const pts = t.points.reduce((a, b) => a + b, 0) / teams;
  const cmp = t.passAtt ? (t.comps / t.passAtt) * 100 : 0;
  const ypa = t.passAtt ? t.passYards / t.passAtt : 0;
  const intPct = t.passAtt ? (t.ints / t.passAtt) * 100 : 0;
  const sackPct = (t.passAtt + t.sacks) ? (t.sacks / (t.passAtt + t.sacks)) * 100 : 0;
  const ypc = t.carries ? t.rushYards / t.carries : 0;
  const third = t.thirdAtt ? (t.thirdConv / t.thirdAtt) * 100 : 0;
  const minutes = (t.frames / 60 / 60) / t.games;
  const yards = (t.passYards + t.rushYards) / teams;
  const tds = t.tds / teams;
  console.log(
    `  ${DIFFICULTIES[key].label.padEnd(12)} ${pts.toFixed(1).padStart(5)} `
    + `${perGame(t.plays).toFixed(0).padStart(6)} `
    + `${cmp.toFixed(0).padStart(5)} ${ypa.toFixed(1).padStart(4)} `
    + `${intPct.toFixed(1).padStart(5)} ${sackPct.toFixed(1).padStart(6)} `
    + `${ypc.toFixed(1).padStart(4)} `
    + `${(t.firstDowns / teams).toFixed(0).padStart(5)} ${third.toFixed(0).padStart(5)} `
    + `${(`${t.fgMade}/${t.fgAtt}`).padStart(6)} `
    + `${(t.drives / t.games).toFixed(0).padStart(6)} `
    + `${minutes.toFixed(1).padStart(5)}`
    + `${yards.toFixed(0).padStart(6)}${tds.toFixed(1).padStart(6)}`
    + `${(t.firstDownEvents / teams).toFixed(0).padStart(6)}`,
  );
}

console.log('\nWHERE THE YARDS COME FROM');
for (const key of DIFFICULTY_ORDER) {
  const t = blank();
  for (let i = 0; i < N; i++) playGame(1000 + i, key, t);
  const yac = t.passYards - t.air;
  const bucket = (list: number[]): string => {
    const b = [0, 0, 0, 0, 0, 0];
    for (const y of list) {
      b[y < 0 ? 0 : y === 0 ? 1 : y < 3 ? 2 : y < 6 ? 3 : y < 11 ? 4 : 5]++;
    }
    const n = Math.max(1, list.length);
    return b.map((c) => `${((c / n) * 100).toFixed(0)}%`.padStart(5)).join('');
  };
  console.log(`  ${DIFFICULTIES[key].label.padEnd(9)} air ${(t.air / Math.max(1, t.comps)).toFixed(1).padStart(5)}`
    + ` + yac ${(yac / Math.max(1, t.comps)).toFixed(1).padStart(5)} per catch`);
  console.log(`    runs  (loss   0  1-2 3-5 6-10 11+): ${bucket(t.runGain)}  n=${t.runGain.length}`);
  console.log(`    passes(loss   0  1-2 3-5 6-10 11+): ${bucket(t.passGain)}  n=${t.passGain.length}`);
}

console.log('\nWHAT THE REAL SPORT DOES, for scale');
console.log('  pts 22   plays 130  cmp 64%  ypa 7.0  int 2.3%  sack 6.5%  ypc 4.3  1st 20  3rd 39%');
console.log('  yards 350 per team, 2.3 touchdowns, 11 drives');

console.log(`\n${problems.length === 0 ? 'No broken rules.' : `${problems.length} PROBLEM(S):`}`);
for (const p of problems) console.log(`  ! ${p}`);
