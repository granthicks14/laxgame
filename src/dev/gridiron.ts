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
import { neutralFootballInput } from '../sports/football/input';
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

  g.events.on('catch', (e) => {
    tally.air += e.yards;
    /* ONLY AN ELIGIBLE RECEIVER CATCHES A PASS. The quick game once went
     * nowhere because the ball was being "caught" by the guards it flew past. */
    const man = g.players.find((p) => p.side === g.possession && g.nameOf(p) === e.by);
    if (man && (!man.route || man.route.kind === 'block' || man.uid === g.ball.from)) {
      problem(`${man.slot} caught a pass`);
    }
  });
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

/* ===========================================================================
 * THE KICK
 * ===========================================================================
 * A field goal is the most tense forty-five seconds in the sport and a dice
 * roll turns it into a loading screen. So a kick a PERSON is taking is a kick
 * he takes — and the thing that has to be true of it is the same thing that has
 * to be true of the throw:
 *
 *   HIS TIMING MATTERS, AND THE LEG ON THE ROSTER MATTERS MORE.
 *
 * Perfect timing must not make a great kicker out of a poor one, and poor
 * timing must not make a poor kicker out of a great one. Both of those are
 * measured below, over enough attempts that the dice cancel.
 * ========================================================================= */

console.log('\nTHE KICK\n');

{
  const neutral = neutralFootballInput;

  const attempt = (
    legPar: number, distance: number, timing: 'perfect' | 'edge' | 'miss', n: number,
  ): number => {
    let made = 0;
    for (let i = 0; i < n; i++) {
      const game = new FootballGame({
        home: { team: team('a', 'A', 'A', 'AAA'), roster: buildRoster(`k:${legPar}:${i}`, { par: legPar, spread: 4 }) },
        away: { team: team('b', 'B', 'B', 'BBB'), roster: buildRoster(`k2:${i}`, { par: 62, spread: 4 }) },
        humanSide: 'home',
        quarterSeconds: 210,
        difficulty: DIFFICULTIES.pro,
        seed: 900 + i,
        offenseOnly: true,
      });
      game.setSituationForTest({
        side: 'home',
        down: 4,
        toGo: 8,
        los: FIELD.awayGoal - (distance - 17),
      });
      game.callKick('fieldGoal');
      // Snap it, which opens the meter.
      for (let f = 0; f < 600 && !game.kickReadout; f++) {
        game.update(DT, { ...neutral(), snapPressed: f > 30 });
      }
      const m = game.kickReadout;
      if (!m) continue;
      // Walk the marker to where this timing wants it, then press.
      const target = timing === 'perfect' ? m.sweet
        : timing === 'edge' ? Math.min(0.99, m.sweet + m.width * 0.95)
          : Math.min(0.99, m.sweet + m.width * 6);
      for (let f = 0; f < 4000; f++) {
        const before = game.kickReadout;
        if (!before || before.taken) break;
        const close = Math.abs(before.t - target) < before.speed * DT * 1.2;
        game.update(DT, { ...neutral(), snapPressed: close });
      }
      const scoreBefore = game.score.home;
      for (let f = 0; f < 600 && game.score.home === scoreBefore && game.phase === 'special'; f++) {
        game.update(DT, neutral());
      }
      if (game.score.home > scoreBefore) made++;
    }
    return made / n;
  };

  const N = 110;

  /* AT FORTY-FIVE, TIMING IS THE STORY. Everybody's kicker can reach it, so
   * what separates a make from a miss is whether he struck it. */
  const struck45 = attempt(78, 45, 'perfect', N);
  const edge45 = attempt(78, 45, 'edge', N);
  const shank45 = attempt(78, 45, 'miss', N);

  /* AT FIFTY-TWO, THE LEG IS THE STORY. Perfect timing does not grow one. */
  const goodLeg52 = attempt(78, 52, 'perfect', N);
  const poorLeg52 = attempt(46, 52, 'perfect', N);

  /* AND A CHIP SHOT IS A CHIP SHOT. A game where a twenty-three yarder is a
   * coin toss is a game nobody will ever kick a field goal in. */
  const chip = attempt(62, 23, 'perfect', N);
  const chipEdge = attempt(62, 23, 'edge', N);

  const pct = (n: number): string => `${(n * 100).toFixed(0)}%`.padStart(4);
  console.log(`  45 yards, good leg:   struck ${pct(struck45)}   edge of the band ${pct(edge45)}   shanked ${pct(shank45)}`);
  console.log(`  52 yards, struck:     good leg ${pct(goodLeg52)}   poor leg ${pct(poorLeg52)}`);
  console.log(`  23 yards, good leg:   struck ${pct(chip)}   edge of the band ${pct(chipEdge)}`);

  if (!(struck45 > shank45 + 0.15)) {
    problems.push(`timing does not matter: ${pct(struck45)} struck vs ${pct(shank45)} shanked`);
  }
  if (!(struck45 >= edge45)) {
    problems.push('the middle of the band is not better than the edge of it');
  }
  if (!(goodLeg52 > poorLeg52 + 0.18)) {
    problems.push(`the leg on the roster does not matter: ${pct(goodLeg52)} vs ${pct(poorLeg52)}`);
  }
  if (chip < 0.85) problems.push(`a twenty-three yarder is not routine: ${pct(chip)}`);
  if (chipEdge < 0.6) problems.push(`a slightly mistimed chip shot is punished too hard: ${pct(chipEdge)}`);
  if (shank45 > 0.6) problems.push(`a shank is not punished enough: ${pct(shank45)}`);

  console.log(`\n${problems.length === 0 ? 'The kick is a skill and a rating, in that order.' : `${problems.length} PROBLEM(S):`}`);
  for (const p of problems) console.log(`  ! ${p}`);
}

/* ===========================================================================
 * THE OPENING KICKOFF, WITH SOMEBODY AT THE STICKS
 * ===========================================================================
 * The kicking side used to wait for the person to press snap on his own
 * kickoff. Nobody told him to, the play clock ran out, and the delay of game
 * turned the kickoff into a first and fifteen for the KICKING team. Every
 * game in which the person was the away side opened that way.
 * ========================================================================= */

console.log('\nTHE OPENING KICKOFF\n');

{
  const neutral = neutralFootballInput;
  let bad = 0;
  const seen: string[] = [];
  for (const human of ['home', 'away'] as const) {
    for (let seed = 1; seed <= 6; seed++) {
      const game = new FootballGame({
        home: { team: team('a', 'A', 'A', 'AAA'), roster: buildRoster(`ko:h:${seed}`, { par: 66, spread: 12 }) },
        away: { team: team('b', 'B', 'B', 'BBB'), roster: buildRoster(`ko:a:${seed}`, { par: 66, spread: 12 }) },
        humanSide: human,
        quarterSeconds: 210,
        difficulty: DIFFICULTIES.pro,
        seed,
        offenseOnly: true,
      });
      let penalties = 0;
      for (let f = 0; f < 60 * 180; f++) {
        game.update(DT, neutral());
        penalties = game.box.home.penalties + game.box.away.penalties;
        if (game.phase === 'playcall' && game.possession === human) break;
      }
      /* Whoever kicked, the first ball the person gets is a fresh series and
       * nobody has been flagged for standing still on a kickoff. */
      if (game.toGo > 10.01 || penalties > 0) {
        bad++;
        seen.push(`${human}#${seed}: ${game.downText}, ${penalties} penalties`);
      }
    }
  }
  if (bad) problems.push(`the opening went wrong ${bad} times: ${seen.slice(0, 3).join('; ')}`);
  console.log(bad ? `  ${bad} bad openings` : '  Twelve openings, home and away: every one a clean first and ten.');
}
