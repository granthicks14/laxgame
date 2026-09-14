/**
 * TWO ENGINES, ONE SPORT.
 *
 * There is the engine you play — a physics simulation at sixty frames a second,
 * a third of a second per game — and there is the one that plays the other
 * hundred and nineteen games of the league round while you are not looking, in
 * under a millisecond. A career is built on the assumption that these two are
 * the same sport. If they are not, everything downstream lies: a coach's
 * statistics change character depending on whether he watched the game, a
 * league table rewards a style the played engine does not reward, and a
 * simulated season means nothing.
 *
 * So this runs both over the same fixtures and holds them together.
 *
 *   npm run hoops-sim
 */
import { HoopsGame } from '../sports/basketball/Game';
import {
  TEAMS, computeOverall, generateRoster, teamRatings, type HoopsPlayer,
} from '../sports/basketball/data';
import { DIFFICULTIES, GAME_LENGTHS } from '../sports/basketball/tuning';
import { simulateGame, type SimTeam } from '../sports/basketball/sim';
import {
  DEFENSES, OFFENSES, resolveScheme, schemeAtFullFit,
  type DefenseScheme, type OffenseScheme,
} from '../sports/basketball/schemes';
import type { TeamBox } from '../sports/basketball/types';

const env = (globalThis as {
  process?: { exit(n: number): void; env?: Record<string, string | undefined> };
}).process;

const GAMES = Number(env?.env?.GAMES ?? 200);
const QUARTER = GAME_LENGTHS.standard.quarterSeconds;

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

interface Totals {
  games: number; points: number; fga: number; fgm: number; tpa: number; tpm: number;
  fta: number; ftm: number; offReb: number; defReb: number; assists: number;
  steals: number; blocks: number; turnovers: number; fouls: number; paint: number;
}

const zero = (): Totals => ({
  games: 0, points: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0,
  offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0, paint: 0,
});

function add(t: Totals, b: TeamBox): void {
  t.points += b.points; t.fga += b.fga; t.fgm += b.fgm; t.tpa += b.tpa; t.tpm += b.tpm;
  t.fta += b.fta; t.ftm += b.ftm; t.offReb += b.offReb; t.defReb += b.defReb;
  t.assists += b.assists; t.steals += b.steals; t.blocks += b.blocks;
  t.turnovers += b.turnovers; t.fouls += b.fouls; t.paint += b.paintPoints;
}

const pct = (a: number, b: number): number => (b > 0 ? a / b : 0);
const fmt = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** The fixtures both engines play. */
function fixture(g: number): { home: number; away: number; seed: number } {
  const home = g % TEAMS.length;
  let away = (g * 7 + 3) % TEAMS.length;
  if (away === home) away = (away + 1) % TEAMS.length;
  return { home, away, seed: 4000 + g };
}

/* ------------------------------------------------------- the played engine */

console.log('\nTHE PLAYED ENGINE\n');

const played = zero();
const playedScores: number[] = [];
let playedHomeWins = 0;
const playedStart = Date.now();
const PLAYED_GAMES = Math.min(GAMES, Number(env?.env?.PLAYED ?? 40));

for (let g = 0; g < PLAYED_GAMES; g++) {
  const f = fixture(g);
  const game = new HoopsGame({
    home: { team: TEAMS[f.home], roster: generateRoster(TEAMS[f.home], f.seed) },
    away: { team: TEAMS[f.away], roster: generateRoster(TEAMS[f.away], f.seed) },
    humanSide: null,
    quarterSeconds: QUARTER,
    difficulty: DIFFICULTIES.pro,
    seed: f.seed,
  });
  game.simulateRest();
  played.games++;
  add(played, game.box.home);
  add(played, game.box.away);
  playedScores.push(game.score.home, game.score.away);
  if (game.score.home > game.score.away) playedHomeWins++;
}
const playedMs = (Date.now() - playedStart) / Math.max(1, PLAYED_GAMES);

/* --------------------------------------------------------- the fast engine */

console.log('THE FAST ENGINE\n');

const fast = zero();
const fastScores: number[] = [];
let fastHomeWins = 0;
const teamOf = (i: number, seed: number): SimTeam => ({
  id: TEAMS[i].id,
  roster: generateRoster(TEAMS[i], seed),
});

const fastStart = Date.now();
for (let g = 0; g < GAMES; g++) {
  const f = fixture(g);
  const r = simulateGame(teamOf(f.home, f.seed), teamOf(f.away, f.seed), {
    seed: f.seed, quarterSeconds: QUARTER,
  });
  fast.games++;
  add(fast, r.home.box);
  add(fast, r.away.box);
  fastScores.push(r.home.score, r.away.score);
  if (r.home.score > r.away.score) fastHomeWins++;
}
const fastMs = (Date.now() - fastStart) / Math.max(1, GAMES);

/* ------------------------------------------------------------ the comparison */

const per = (t: Totals, n: number): number => n / Math.max(1, t.games * 2);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

interface Row {
  label: string;
  played: number;
  fast: number;
  /** How far apart they may be, in the same units. */
  tolerance: number;
  /** How to print it. */
  show: (n: number) => string;
}

const rows: Row[] = [
  { label: 'points a team', played: per(played, played.points), fast: per(fast, fast.points),
    tolerance: 5, show: (n) => n.toFixed(1) },
  { label: 'field goals attempted', played: per(played, played.fga), fast: per(fast, fast.fga),
    tolerance: 6, show: (n) => n.toFixed(1) },
  { label: 'field goal %', played: pct(played.fgm, played.fga), fast: pct(fast.fgm, fast.fga),
    tolerance: 0.035, show: fmt },
  { label: 'three point %', played: pct(played.tpm, played.tpa), fast: pct(fast.tpm, fast.tpa),
    tolerance: 0.04, show: fmt },
  { label: 'three point share', played: pct(played.tpa, played.fga), fast: pct(fast.tpa, fast.fga),
    tolerance: 0.07, show: fmt },
  { label: 'free throws attempted', played: per(played, played.fta), fast: per(fast, fast.fta),
    tolerance: 5, show: (n) => n.toFixed(1) },
  { label: 'free throw %', played: pct(played.ftm, played.fta), fast: pct(fast.ftm, fast.fta),
    tolerance: 0.05, show: fmt },
  { label: 'rebounds a team', played: per(played, played.offReb + played.defReb),
    fast: per(fast, fast.offReb + fast.defReb), tolerance: 5, show: (n) => n.toFixed(1) },
  { label: 'offensive rebound share',
    played: pct(played.offReb, played.offReb + played.defReb),
    fast: pct(fast.offReb, fast.offReb + fast.defReb), tolerance: 0.06, show: fmt },
  { label: 'assists a team', played: per(played, played.assists), fast: per(fast, fast.assists),
    tolerance: 4, show: (n) => n.toFixed(1) },
  { label: 'turnovers a team', played: per(played, played.turnovers),
    fast: per(fast, fast.turnovers), tolerance: 4, show: (n) => n.toFixed(1) },
  { label: 'steals a team', played: per(played, played.steals), fast: per(fast, fast.steals),
    tolerance: 4, show: (n) => n.toFixed(1) },
  { label: 'blocks a team', played: per(played, played.blocks), fast: per(fast, fast.blocks),
    tolerance: 2.5, show: (n) => n.toFixed(1) },
  { label: 'fouls a team', played: per(played, played.fouls), fast: per(fast, fast.fouls),
    tolerance: 5, show: (n) => n.toFixed(1) },
];

console.log(`  ${'rate'.padEnd(24)} ${'played'.padStart(8)} ${'fast'.padStart(8)}  gap`);
for (const r of rows) {
  const gap = Math.abs(r.played - r.fast);
  const ok = gap <= r.tolerance;
  console.log(`  ${r.label.padEnd(24)} ${r.show(r.played).padStart(8)}`
    + ` ${r.show(r.fast).padStart(8)}  ${ok ? ' ' : '!'}${r.show(gap)}`);
}
console.log(`\n  speed: played ${playedMs.toFixed(1)}ms a game, fast ${fastMs.toFixed(2)}ms a game`
  + `  (${Math.round(playedMs / Math.max(0.001, fastMs))}x)`);

const drifted = rows.filter((r) => Math.abs(r.played - r.fast) > r.tolerance);
check('the fast engine plays the same basketball', drifted.length === 0,
  drifted.map((r) => `${r.label} ${r.show(r.played)} vs ${r.show(r.fast)}`).join('; '));

check('a league round costs under a second',
  fastMs * 132 < 1000, `${(fastMs * 132).toFixed(0)}ms for 132 games`);

check('scores land in the same place',
  Math.abs(mean(playedScores) - mean(fastScores)) < 5,
  `${mean(playedScores).toFixed(1)} vs ${mean(fastScores).toFixed(1)}`);

// Home advantage is worth about two and a half points. Both engines read the
// same number, but this comparison is over different fixtures in each, and a
// two-point edge is not visible in forty games — so what is asserted is that the
// fast engine's home edge is real and is not a rout.
check('the home floor is worth something, and not the game',
  fastHomeWins / GAMES > 0.5 && fastHomeWins / GAMES < 0.66,
  `fast ${fmt(fastHomeWins / GAMES)}, played ${fmt(playedHomeWins / PLAYED_GAMES)} (no edge set)`);

/* -------------------------------------------------------------- properties */

console.log('\nWHAT THE FAST ENGINE HAS TO GET RIGHT\n');

// Determinism.
const a = simulateGame(teamOf(0, 77), teamOf(6, 77), { seed: 9, quarterSeconds: QUARTER });
const b = simulateGame(teamOf(0, 77), teamOf(6, 77), { seed: 9, quarterSeconds: QUARTER });
check('the same seed plays the same game',
  JSON.stringify(a.home.box) === JSON.stringify(b.home.box)
  && JSON.stringify(a.away.box) === JSON.stringify(b.away.box));

// Nobody draws.
let draws = 0;
let overtimes = 0;
for (let g = 0; g < 400; g++) {
  const f = fixture(g);
  const r = simulateGame(teamOf(f.home, f.seed), teamOf(f.away, f.seed), {
    seed: 50_000 + g, quarterSeconds: QUARTER,
  });
  if (r.home.score === r.away.score) draws++;
  if (r.overtime > 0) overtimes++;
}
check('no game ends level', draws === 0, `${draws} draws`);
check('some games go to overtime, and not many',
  overtimes > 2 && overtimes < 90, `${overtimes}/400`);

// The box score has to add up, exactly, or every statistic downstream is wrong.
const problems: string[] = [];
for (let g = 0; g < 60; g++) {
  const f = fixture(g);
  const r = simulateGame(teamOf(f.home, f.seed), teamOf(f.away, f.seed), {
    seed: 60_000 + g, quarterSeconds: QUARTER,
  });
  for (const side of [r.home, r.away]) {
    const sum = (pick: (l: typeof side.lines[number]['line']) => number): number =>
      side.lines.reduce((n, l) => n + pick(l.line), 0);
    if (sum((l) => l.points) !== side.box.points) problems.push(`${side.id}: points`);
    if (sum((l) => l.fga) !== side.box.fga) problems.push(`${side.id}: attempts`);
    if (sum((l) => l.fgm) !== side.box.fgm) problems.push(`${side.id}: makes`);
    if (sum((l) => l.fta) !== side.box.fta) problems.push(`${side.id}: free throws`);
    if (sum((l) => l.turnovers) !== side.box.turnovers) problems.push(`${side.id}: turnovers`);
    if (sum((l) => l.fouls) !== side.box.fouls) problems.push(`${side.id}: fouls`);
    if (side.box.points !== side.score) problems.push(`${side.id}: score`);
    if (side.box.fgm > side.box.fga) problems.push(`${side.id}: more makes than attempts`);
    if (side.box.tpm > side.box.tpa) problems.push(`${side.id}: more threes than attempted`);
    if (side.box.ftm > side.box.fta) problems.push(`${side.id}: more free throws than attempted`);
    if (side.box.assists > side.box.fgm) problems.push(`${side.id}: more assists than makes`);
    const total = side.box.byQuarter.reduce((n, q) => n + q, 0);
    if (total !== side.score) problems.push(`${side.id}: quarters do not add up`);
  }
}
check('every box score adds up', problems.length === 0,
  [...new Set(problems)].slice(0, 3).join('; '));

// The better team wins more often. Without this the league table is noise.
let betterWon = 0;
let contests = 0;
for (let g = 0; g < 300; g++) {
  const hi = TEAMS[0];
  const lo = TEAMS[11];
  const r = simulateGame(
    { id: lo.id, roster: generateRoster(lo, 200 + g) },
    { id: hi.id, roster: generateRoster(hi, 200 + g) },
    { seed: 70_000 + g, quarterSeconds: QUARTER, homeAdvantage: false },
  );
  contests++;
  if (r.away.score > r.home.score) betterWon++;
}
check('the better roster wins most of the time',
  betterWon / contests > 0.62 && betterWon / contests < 0.95,
  `${fmt(betterWon / contests)} for the stronger squad`);

// A star has to be a star.
{
  const strong = generateRoster(TEAMS[0], 31);
  const lines = new Map<string, number>();
  for (let g = 0; g < 40; g++) {
    const r = simulateGame(
      { id: 'a', roster: strong },
      { id: 'b', roster: generateRoster(TEAMS[5], 31) },
      { seed: 80_000 + g, quarterSeconds: QUARTER },
    );
    for (const l of r.home.lines) {
      lines.set(l.player.id, (lines.get(l.player.id) ?? 0) + l.line.points);
    }
  }
  const ranked = [...lines.entries()].sort((x, y) => y[1] - x[1]);
  const bestPlayer = [...strong].sort((x, y) => y.overall - x.overall)[0];
  const topScorers = ranked.slice(0, 3).map(([id]) => id);
  check('the best player is one of the leading scorers',
    topScorers.includes(bestPlayer.id),
    `${bestPlayer.first} ${bestPlayer.last} (${bestPlayer.overall} ovr)`);
  check('and the bench does not outscore the starters',
    (ranked[0]?.[1] ?? 0) > (ranked[ranked.length - 1]?.[1] ?? 0) * 2);
}

/* ----------------------------------------------------------------- schemes */

console.log('\nSCHEMES CHANGE THE GAME\n');

const roster = generateRoster(TEAMS[0], 4242);

/**
 * A squad built for one thing, so a scheme can be judged on what it DOES rather
 * than on whether these particular twelve men can run it. Whether a real roster
 * can run a system is the fit system's job, and it is asserted separately — the
 * two must not be allowed to hide each other.
 */
function squadOf(kind: 'shooters' | 'bigs'): HoopsPlayer[] {
  // Shifted, not flattened: twelve identical players make the AI's own ranking
  // of who plays inside arbitrary, and then nothing it does means anything.
  return generateRoster(TEAMS[0], 4242).map((p) => {
    const attrs = { ...p.attrs };
    const bump = (v: number, by: number): number => Math.max(25, Math.min(96, v + by));
    if (kind === 'shooters') {
      attrs.three = bump(attrs.three, 26);
      attrs.shooting = bump(attrs.shooting, 18);
      attrs.finishing = bump(attrs.finishing, -18);
    } else {
      attrs.finishing = bump(attrs.finishing, 24);
      attrs.strength = bump(attrs.strength, 18);
      attrs.rebounding = bump(attrs.rebounding, 18);
      attrs.three = bump(attrs.three, -26);
    }
    return { ...p, attrs, overall: computeOverall(p.pos, attrs) };
  });
}

function withScheme(off: OffenseScheme, def: DefenseScheme, games = 60): Totals {
  const t = zero();
  // At full fit: what the system does when it is being run by the right players.
  // Whether a given squad CAN run it is the fit system's job, tested below.
  const scheme = schemeAtFullFit(off, def);
  for (let g = 0; g < games; g++) {
    const r = simulateGame(
      { id: 'us', roster, scheme },
      { id: 'them', roster: generateRoster(TEAMS[5], 4242) },
      { seed: 90_000 + g, quarterSeconds: QUARTER },
    );
    t.games++;
    add(t, r.home.box);
    // The defensive knobs act on the OTHER side, so a defence is measured there.
    oppTotals.games++;
    add(oppTotals, r.away.box);
  }
  return t;
}

/** What the opposition did, filled in by the run just before it is read. */
let oppTotals = zero();
function againstScheme(off: OffenseScheme, def: DefenseScheme, games = 60): Totals {
  oppTotals = zero();
  withScheme(off, def, games);
  return oppTotals;
}

const base = withScheme('motion', 'man');
const five = withScheme('fiveOut', 'man');
const post = withScheme('post', 'man');
const run = withScheme('fastBreak', 'man');
const iso = withScheme('iso', 'man');

const shareOf = (t: Totals): number => pct(t.tpa, t.fga);
console.log(`  motion      ${fmt(shareOf(base))} threes, ${(base.fga / base.games).toFixed(1)} shots,`
  + ` ${(base.assists / base.games).toFixed(1)} assists, ${(base.offReb / base.games).toFixed(1)} off reb`);
console.log(`  five-out    ${fmt(shareOf(five))} threes, ${(five.fga / five.games).toFixed(1)} shots,`
  + ` ${(five.assists / five.games).toFixed(1)} assists, ${(five.offReb / five.games).toFixed(1)} off reb`);
console.log(`  post        ${fmt(shareOf(post))} threes, ${(post.fga / post.games).toFixed(1)} shots,`
  + ` ${(post.assists / post.games).toFixed(1)} assists, ${(post.offReb / post.games).toFixed(1)} off reb`);
console.log(`  fast break  ${fmt(shareOf(run))} threes, ${(run.fga / run.games).toFixed(1)} shots,`
  + ` ${(run.assists / run.games).toFixed(1)} assists, ${(run.offReb / run.games).toFixed(1)} off reb`);

check('five-out shoots more threes than a post offence',
  shareOf(five) > shareOf(post) + 0.1,
  `${fmt(shareOf(five))} vs ${fmt(shareOf(post))}`);
check('a post offence gets more offensive rebounds',
  post.offReb / post.games > five.offReb / five.games * 1.3,
  `${(post.offReb / post.games).toFixed(1)} vs ${(five.offReb / five.games).toFixed(1)}`);
check('running produces more shots than a half-court offence',
  run.fga / run.games > post.fga / post.games * 1.08,
  `${(run.fga / run.games).toFixed(1)} vs ${(post.fga / post.games).toFixed(1)}`);
check('isolation concentrates the offence on one man', (() => {
  const isoLines = new Map<string, number>();
  const motionLines = new Map<string, number>();
  for (const [scheme, into] of [['iso', isoLines], ['motion', motionLines]] as const) {
    const s = schemeAtFullFit(scheme as OffenseScheme, 'man');
    for (let g = 0; g < 40; g++) {
      const r = simulateGame(
        { id: 'us', roster, scheme: s },
        { id: 'them', roster: generateRoster(TEAMS[5], 4242) },
        { seed: 95_000 + g, quarterSeconds: QUARTER },
      );
      for (const l of r.home.lines) into.set(l.player.id, (into.get(l.player.id) ?? 0) + l.line.fga);
    }
  }
  const topShare = (m: Map<string, number>): number => {
    const total = [...m.values()].reduce((a2, b2) => a2 + b2, 0);
    const top = Math.max(...m.values());
    return total > 0 ? top / total : 0;
  };
  return topShare(isoLines) > topShare(motionLines) + 0.03;
})(), `${iso.fga > 0 ? '' : 'no shots taken'}`);

const zoned = againstScheme('motion', 'zone23');
const pressed = againstScheme('motion', 'press');
check('a press forces more turnovers than a zone', (() => {
  // Measured on the OPPOSITION, which is what a defence acts on.
  const oppTurnovers = (def: DefenseScheme): number => {
    const scheme = schemeAtFullFit('motion', def);
    let to = 0;
    for (let g = 0; g < 60; g++) {
      const r = simulateGame(
        { id: 'us', roster, scheme },
        { id: 'them', roster: generateRoster(TEAMS[5], 4242) },
        { seed: 97_000 + g, quarterSeconds: QUARTER },
      );
      to += r.away.box.turnovers;
    }
    return to / 60;
  };
  return oppTurnovers('press') > oppTurnovers('zone23') * 1.15;
})());
check('a zone sends the other side to the line less often than a press does',
  zoned.fta / zoned.games < pressed.fta / pressed.games,
  `${(zoned.fta / zoned.games).toFixed(1)} vs ${(pressed.fta / pressed.games).toFixed(1)}`);

// A scheme the players cannot run is worse than one they can.
{
  const bigs = generateRoster(TEAMS[3], 808);
  const good = resolveScheme('post', 'man', bigs, teamRatings(bigs).overall - 6);
  const bad = resolveScheme('fiveOut', 'man', bigs, teamRatings(bigs).overall - 6);
  console.log(`\n  post fit ${(good.offenseFit * 100).toFixed(0)}%,`
    + ` five-out fit ${(bad.offenseFit * 100).toFixed(0)}% for the same squad`);
  check('personnel decide whether a scheme fits',
    Math.abs(good.offenseFit - bad.offenseFit) > 0.05,
    `${good.offenseFit.toFixed(2)} vs ${bad.offenseFit.toFixed(2)}`);
  check('a badly fitting scheme costs real percentage',
    bad.offenseFit < 0.95 && bad.offensePenalty > 0);
}

check('every scheme is described to the player',
  Object.values(OFFENSES).every((o) => o.label && o.blurb && o.effect && o.needsText)
  && Object.values(DEFENSES).every((d) => d.label && d.blurb && d.effect && d.needsText));

/* ------------------------------------- and they change the game you PLAY too */

console.log('\nSCHEMES CHANGE THE GAME YOU WATCH\n');

/**
 * The fast engine reading the knobs proves nothing on its own: a scheme that
 * only changes simulated games is a scheme that evaporates the moment you press
 * Play. So the same schemes go through the PHYSICS engine, which knows nothing
 * about shot diets — it only knows where five men are standing and what the AI
 * decided — and the same differences have to come out the other end.
 */
function playedWith(
  off: OffenseScheme, def: DefenseScheme, squad: HoopsPlayer[], games = 14,
): Totals {
  const t = zero();
  const scheme = schemeAtFullFit(off, def);
  const neutral = schemeAtFullFit('motion', 'man');
  for (let g = 0; g < games; g++) {
    const home = TEAMS[0];
    const away = TEAMS[6];
    const game = new HoopsGame({
      home: { team: home, roster: squad },
      away: { team: away, roster: generateRoster(away, 5150) },
      humanSide: null,
      quarterSeconds: QUARTER,
      difficulty: DIFFICULTIES.pro,
      seed: 30_000 + g,
      schemes: { home: scheme, away: neutral },
    });
    game.simulateRest();
    t.games++;
    add(t, game.box.home);
  }
  return t;
}

const shooters = squadOf('shooters');
const bigs = squadOf('bigs');
// Each system judged with the players it is FOR, and against the same opposition.
const pMotion = playedWith('motion', 'man', shooters);
const pFive = playedWith('fiveOut', 'man', shooters);
const pPost = playedWith('post', 'man', bigs);
const pIso = playedWith('iso', 'man', shooters);
const pPostShooters = playedWith('post', 'man', shooters);

const line = (name: string, t: Totals): string =>
  `  ${name.padEnd(12)} ${fmt(pct(t.tpa, t.fga))} threes,`
  + ` ${(t.paint / t.games).toFixed(1)} paint points,`
  + ` ${(t.assists / t.games).toFixed(1)} assists,`
  + ` ${(t.offReb / t.games).toFixed(1)} off reb`;
console.log(line('motion', pMotion));
console.log(line('five-out', pFive));
console.log(line('post', pPost));
console.log(line('isolation', pIso));

check('five-out really does shoot more threes on the floor',
  pct(pFive.tpa, pFive.fga) > pct(pPostShooters.tpa, pPostShooters.fga) + 0.05,
  `${fmt(pct(pFive.tpa, pFive.fga))} vs ${fmt(pct(pPostShooters.tpa, pPostShooters.fga))}`
  + ' (same shooters, different instructions)');
check('a post offence really does score more in the paint',
  pPost.paint / pPost.games > pFive.paint / pFive.games * 1.12,
  `${(pPost.paint / pPost.games).toFixed(1)} vs ${(pFive.paint / pFive.games).toFixed(1)}`);
check('motion really does move the ball more than isolation',
  pMotion.assists / pMotion.games > pIso.assists / pIso.games * 1.1,
  `${(pMotion.assists / pMotion.games).toFixed(1)} vs ${(pIso.assists / pIso.games).toFixed(1)}`);

// And the defences, measured on what they concede.
function conceded(def: DefenseScheme, games = 24): Totals {
  const t = zero();
  const scheme = schemeAtFullFit('motion', def);
  const neutral = schemeAtFullFit('motion', 'man');
  for (let g = 0; g < games; g++) {
    const game = new HoopsGame({
      home: { team: TEAMS[0], roster: generateRoster(TEAMS[0], 5150) },
      away: { team: TEAMS[6], roster: generateRoster(TEAMS[6], 5150) },
      humanSide: null,
      quarterSeconds: QUARTER,
      difficulty: DIFFICULTIES.pro,
      seed: 40_000 + g,
      schemes: { home: scheme, away: neutral },
    });
    game.simulateRest();
    t.games++;
    // What the OTHER side managed against it.
    add(t, game.box.away);
  }
  return t;
}

const vMan = conceded('man');
const vZone = conceded('zone23');
const vPress = conceded('press');
console.log(`\n  against man     ${(vMan.paint / vMan.games).toFixed(1)} paint points,`
  + ` ${(vMan.turnovers / vMan.games).toFixed(1)} turnovers forced`);
console.log(`  against 2-3     ${(vZone.paint / vZone.games).toFixed(1)} paint points,`
  + ` ${(vZone.turnovers / vZone.games).toFixed(1)} turnovers forced`);
console.log(`  against press   ${(vPress.paint / vPress.games).toFixed(1)} paint points,`
  + ` ${(vPress.turnovers / vPress.games).toFixed(1)} turnovers forced`);

check('a 2-3 zone really does protect the paint',
  vZone.paint / vZone.games < vMan.paint / vMan.games,
  `${(vZone.paint / vZone.games).toFixed(1)} vs ${(vMan.paint / vMan.games).toFixed(1)}`);
check('a press really does force more turnovers on the floor',
  vPress.turnovers / vPress.games > vMan.turnovers / vMan.games * 1.1,
  `${(vPress.turnovers / vPress.games).toFixed(1)} vs ${(vMan.turnovers / vMan.games).toFixed(1)}`);

// And nothing a scheme does may break the game.
{
  let broken = 0;
  for (const off of ['motion', 'fiveOut', 'fourOneIn', 'pickRoll', 'post', 'fastBreak', 'iso'] as OffenseScheme[]) {
    for (const def of ['man', 'zone23', 'zone32', 'press', 'halfCourt'] as DefenseScheme[]) {
      const game = new HoopsGame({
        home: { team: TEAMS[0], roster: generateRoster(TEAMS[0], 611) },
        away: { team: TEAMS[6], roster: generateRoster(TEAMS[6], 611) },
        humanSide: null,
        quarterSeconds: QUARTER,
        difficulty: DIFFICULTIES.pro,
        seed: 611,
        schemes: { home: schemeAtFullFit(off, def), away: schemeAtFullFit('motion', 'man') },
      });
      game.simulateRest();
      const score = game.score.home + game.score.away;
      if (game.phase !== 'final' || score < 40 || score > 400) broken++;
    }
  }
  check('every combination of schemes plays a real game', broken === 0,
    `${broken} of 35 did not`);
}

/* ------------------------------------------------------------------- done */

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  env?.exit(1);
}
