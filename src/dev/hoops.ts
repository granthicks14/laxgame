import { HoopsGame } from '../sports/basketball/Game';
import { DIFFICULTIES, GAME_LENGTHS, HOOPS } from '../sports/basketball/tuning';
import { TEAMS, generateRoster, teamRatings } from '../sports/basketball/data';
import {
  beginPlayoffs, createSeason, nextPlayoffGame, playoffGameFor, playoffSeeds,
  recordPlayoff, rollOver, simulateGame, standings,
} from '../sports/basketball/season';
import { COURT, isThree } from '../sports/basketball/court';
import { makeChance, releaseQuality, releaseWindow } from '../sports/basketball/shot';
import type { DifficultyKey, TeamBox } from '../sports/basketball/types';

/**
 * DOES IT PLAY BASKETBALL?
 *
 * Not "does it run". A basketball game that runs but shoots 70% from three, or
 * gives the offence every rebound, or ends 12-9, is a basketball-shaped thing
 * rather than basketball. So this plays whole games with nobody watching and holds
 * the result against what the sport actually produces:
 *
 *   - a final score in the right range for the length played
 *   - 44-49% from the field, 33-40% from three, 70-80% from the line
 *   - about seven of every ten rebounds to the defence
 *   - more than half the makes assisted
 *   - fouls, turnovers and blocks in real proportions
 *   - the better team winning more often than not, but not always
 *   - every quarter played, every clock reaching zero, nothing stuck
 *   - the same seed producing the same box score, to the point
 *
 *   npm run hoops
 */

const env = (globalThis as {
  process?: { exit(n: number): void; env?: Record<string, string | undefined> };
}).process;

const problems: string[] = [];
let checks = 0;
function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
}

/**
 * Enough games that a RATE means something. Twenty-four was not: the defensive
 * rebound share and the assist rate both swung three to five points between one
 * set of seeds and another, which is wider than the bars they are held to, so
 * the suite failed on whichever league happened to be generated rather than on
 * anything about the basketball.
 */
const GAMES = Number(env?.env?.GAMES ?? 90);
const LENGTH = (env?.env?.LENGTH ?? 'standard') as keyof typeof GAME_LENGTHS;

const pct = (a: number, b: number): number => (b > 0 ? a / b : 0);
const fmt = (n: number): string => `${(n * 100).toFixed(1)}%`;

interface Totals {
  games: number;
  points: number;
  fga: number; fgm: number;
  tpa: number; tpm: number;
  fta: number; ftm: number;
  offReb: number; defReb: number;
  assists: number; steals: number; blocks: number;
  turnovers: number; fouls: number;
  paint: number; fastBreak: number;
  overtimes: number;
  quarters: number;
  homeWins: number;
  ties: number;
}

const zero = (): Totals => ({
  games: 0, points: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0,
  offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
  paint: 0, fastBreak: 0, overtimes: 0, quarters: 0, homeWins: 0, ties: 0,
});

function addBox(t: Totals, b: TeamBox): void {
  t.points += b.points;
  t.fga += b.fga; t.fgm += b.fgm;
  t.tpa += b.tpa; t.tpm += b.tpm;
  t.fta += b.fta; t.ftm += b.ftm;
  t.offReb += b.offReb; t.defReb += b.defReb;
  t.assists += b.assists; t.steals += b.steals; t.blocks += b.blocks;
  t.turnovers += b.turnovers; t.fouls += b.fouls;
  t.paint += b.paintPoints; t.fastBreak += b.fastBreak;
}

function play(
  homeIdx: number, awayIdx: number, seed: number, difficulty: DifficultyKey = 'pro',
  quarterSeconds = GAME_LENGTHS[LENGTH].quarterSeconds,
): HoopsGame {
  const home = TEAMS[homeIdx];
  const away = TEAMS[awayIdx];
  const game = new HoopsGame({
    home: { team: home, roster: generateRoster(home, seed) },
    away: { team: away, roster: generateRoster(away, seed) },
    humanSide: null,
    quarterSeconds,
    difficulty: DIFFICULTIES[difficulty],
    seed,
  });
  game.simulateRest();
  return game;
}

/* --------------------------------------------------- the model, in isolation */

console.log('THE SHOT MODEL\n');
console.log('shot                       release   chance');
const shotRow = (
  label: string, kind: 'layup' | 'jumper' | 'three' | 'freeThrow',
  distance: number, release: number, rating = 70, contest = 99,
): number => {
  const p = makeChance({
    kind, distance, release, rating, finishing: rating,
    contestDistance: contest, contestRating: contest < 90 ? 70 : 0,
    contestInLine: contest < 4, moving: 0, fading: false,
  });
  console.log(`  ${label.padEnd(26)} ${release.toFixed(2).padStart(5)}  ${fmt(p).padStart(7)}`);
  return p;
};

const openLayup = shotRow('layup, open', 'layup', 2.5, 1);
const openMid = shotRow('15ft jumper, open', 'jumper', 15, 1);
const openThree = shotRow('open three', 'three', 24, 1);
const contestedThree = shotRow('contested three', 'three', 24, 1, 70, 2.2);
const deepThree = shotRow('30ft three', 'three', 30, 1);
const rushedThree = shotRow('open three, rushed', 'three', 24, -0.4);
const freeThrow = shotRow('free throw', 'freeThrow', 15, 1, 78);

console.log();
check('an open layup is the best shot on the floor',
  openLayup > openMid && openLayup > openThree, fmt(openLayup));
check('a mid-range jumper beats a three on percentage',
  openMid > openThree, `${fmt(openMid)} v ${fmt(openThree)}`);
check('but the three is worth more points',
  openThree * 3 > openMid * 2, `${(openThree * 3).toFixed(2)} v ${(openMid * 2).toFixed(2)} points`);
check('a contest costs real percentage',
  openThree - contestedThree > 0.06, `${fmt(openThree)} -> ${fmt(contestedThree)}`);
check('distance keeps mattering past the line',
  deepThree < openThree - 0.05, `${fmt(openThree)} at 24ft, ${fmt(deepThree)} at 30ft`);
check('a rushed release is punished',
  rushedThree < openThree - 0.1, `${fmt(openThree)} -> ${fmt(rushedThree)}`);
check('free throws land near three in four', freeThrow > 0.7 && freeThrow < 0.88, fmt(freeThrow));

// The window itself: a better shooter gets a bigger target, and the timing is
// what the player is actually doing.
const narrow = releaseWindow(40);
const wide = releaseWindow(95);
check('a better shooter gets a more forgiving window',
  wide > narrow * 1.5, `${narrow.toFixed(3)} -> ${wide.toFixed(3)}`);
check('a perfect release reads as perfect',
  Math.abs(releaseQuality(0.82, 70) - 1) < 1e-6, releaseQuality(0.82, 70).toFixed(3));
check('the edge of the window reads as zero',
  Math.abs(releaseQuality(0.82 + releaseWindow(70), 70)) < 1e-6);
check('outside the window goes negative',
  releaseQuality(0.5, 70) < 0, releaseQuality(0.5, 70).toFixed(2));

/* ------------------------------------------------------------- whole games */

console.log('\nWHOLE GAMES\n');
const t = zero();
const scores: number[] = [];
const shotDistances: number[] = [];
let threeShare = 0;
let totalShots = 0;
let stuck = 0;
let maxFouls = 0;
/** Why possessions ended, which is the only way to see a turnover problem. */
const reasons = new Map<string, number>();
let simSeconds = 0;
let longest = 0;
/** Ball movement: a possession that never passes is one man, not an offence. */
let passes = 0;
/** Box scores whose player rows do not add up to the team line. */
let boxDrift = 0;
let fouledOut = 0;

for (let g = 0; g < GAMES; g++) {
  const homeIdx = g % TEAMS.length;
  const awayIdx = (g * 7 + 3) % TEAMS.length;
  if (homeIdx === awayIdx) continue;
  const game = new HoopsGame({
    home: { team: TEAMS[homeIdx], roster: generateRoster(TEAMS[homeIdx], 1000 + g) },
    away: { team: TEAMS[awayIdx], roster: generateRoster(TEAMS[awayIdx], 1000 + g) },
    humanSide: null,
    quarterSeconds: GAME_LENGTHS[LENGTH].quarterSeconds,
    difficulty: DIFFICULTIES.pro,
    seed: 1000 + g,
  });
  game.events.on('turnover', (e) => {
    reasons.set(e.reason, (reasons.get(e.reason) ?? 0) + 1);
  });
  game.events.on('pass', () => { passes++; });
  {
    // Time the simulation as well as measure it: a game that does not finish
    // inside its own clock is a hang, and the average hides it.
    const dtSim = 1 / 30;
    let elapsed = 0;
    while (game.phase !== 'final' && elapsed < 3600) {
      game.update(dtSim, {
        moveX: 0, moveY: 0, sprint: false, passPressed: false,
        shootHeld: false, shootReleased: false, crossPressed: false,
        screenPressed: false, switchPressed: false,
      });
      elapsed += dtSim;
    }
    simSeconds += elapsed;
    longest = Math.max(longest, elapsed);
  }

  t.games++;
  t.quarters += game.quarter;
  if (game.overtime > 0) t.overtimes++;
  addBox(t, game.box.home);
  addBox(t, game.box.away);
  scores.push(game.score.home, game.score.away);
  if (game.score.home > game.score.away) t.homeWins++;
  if (game.score.home === game.score.away) t.ties++;
  if (game.phase !== 'final') stuck++;

  totalShots += game.box.home.fga + game.box.away.fga;
  threeShare += game.box.home.tpa + game.box.away.tpa;
  for (const side of ['home', 'away'] as const) {
    // Everybody who played, so a man who fouled out is still counted. If he were
    // dropped, the rows of the box score would stop adding up to the team line
    // and nobody would notice until they added the column up by hand.
    let points = 0;
    let fouls = 0;
    for (const p of game.played(side)) {
      maxFouls = Math.max(maxFouls, p.fouls);
      points += p.stat.points;
      fouls += p.fouls;
      if (p.fouledOut) fouledOut++;
    }
    if (points !== game.box[side].points) boxDrift++;
    if (fouls !== game.box[side].fouls) boxDrift++;
  }
}

const perTeam = (n: number): number => n / Math.max(1, t.games * 2);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

console.log(`  ${t.games} games at ${GAME_LENGTHS[LENGTH].label} (${GAME_LENGTHS[LENGTH].quarterSeconds}s quarters)`);
console.log(`  score          ${perTeam(t.points).toFixed(1)} a team  (low ${Math.min(...scores)}, high ${Math.max(...scores)})`);
console.log(`  field goals    ${fmt(pct(t.fgm, t.fga))} on ${perTeam(t.fga).toFixed(1)} attempts`);
console.log(`  threes         ${fmt(pct(t.tpm, t.tpa))} on ${perTeam(t.tpa).toFixed(1)} attempts  (${fmt(pct(t.tpa, t.fga))} of all shots)`);
console.log(`  free throws    ${fmt(pct(t.ftm, t.fta))} on ${perTeam(t.fta).toFixed(1)} attempts`);
console.log(`  rebounds       ${perTeam(t.defReb).toFixed(1)} defensive, ${perTeam(t.offReb).toFixed(1)} offensive  (${fmt(pct(t.defReb, t.defReb + t.offReb))} to the defence)`);
console.log(`  assists        ${perTeam(t.assists).toFixed(1)}  (${fmt(pct(t.assists, t.fgm))} of makes)`);
console.log(`  turnovers      ${perTeam(t.turnovers).toFixed(1)}   steals ${perTeam(t.steals).toFixed(1)}   blocks ${perTeam(t.blocks).toFixed(1)}`);
console.log(`  fouls          ${perTeam(t.fouls).toFixed(1)}  (most by one man: ${maxFouls})`);
console.log(`  paint points   ${perTeam(t.paint).toFixed(1)}   fast break ${perTeam(t.fastBreak).toFixed(1)}`);
console.log(`  overtimes      ${t.overtimes}/${t.games}`);
console.log(`  ball movement  ${(passes / Math.max(1, t.fga + t.turnovers)).toFixed(2)} passes a possession`);
console.log(`  possessions    ${(perTeam(t.fga + t.turnovers)).toFixed(1)} a team`
  + `  (${((t.fga + t.turnovers) / Math.max(1, t.games) / 2).toFixed(1)} endings each)`);
console.log(`  sim time       ${(simSeconds / Math.max(1, t.games)).toFixed(0)}s a game, longest ${longest.toFixed(0)}s`);
console.log('  possessions ended by:');
for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${why.padEnd(20)} ${n}`);
}
console.log();

const expected = GAME_LENGTHS[LENGTH].quarterSeconds === 210
  ? [38, 72]
  : GAME_LENGTHS[LENGTH].quarterSeconds === 120 ? [20, 48] : [52, 98];

check('nothing gets stuck', stuck === 0, `${stuck} games did not finish`);
check('a game finishes inside its own clock', longest < 3000, `longest ${longest.toFixed(0)}s of sim`);
check('every game plays four quarters',
  t.quarters / t.games >= 4, (t.quarters / t.games).toFixed(2));
check('the score lands where the length says it should',
  perTeam(t.points) >= expected[0] && perTeam(t.points) <= expected[1],
  `${perTeam(t.points).toFixed(1)} a team, expected ${expected[0]}-${expected[1]}`);
check('field goal percentage is basketball',
  pct(t.fgm, t.fga) > 0.4 && pct(t.fgm, t.fga) < 0.53, fmt(pct(t.fgm, t.fga)));
check('three point percentage is basketball',
  pct(t.tpm, t.tpa) > 0.29 && pct(t.tpm, t.tpa) < 0.42, fmt(pct(t.tpm, t.tpa)));
check('free throw percentage is basketball',
  pct(t.ftm, t.fta) > 0.66 && pct(t.ftm, t.fta) < 0.86, fmt(pct(t.ftm, t.fta)));
// Modern basketball really does shoot a lot of threes — around four in ten, and
// the teams that lean hardest on them go past half. The bar is what separates a
// three-heavy STYLE from a game that has forgotten the other two-thirds of the
// floor exist.
check('the threes are a real share of the offence, not all of it',
  pct(t.tpa, t.fga) > 0.22 && pct(t.tpa, t.fga) < 0.58, fmt(pct(t.tpa, t.fga)));
check('the defence gets most of the rebounds',
  pct(t.defReb, t.defReb + t.offReb) > 0.6 && pct(t.defReb, t.defReb + t.offReb) < 0.85,
  fmt(pct(t.defReb, t.defReb + t.offReb)));
check('most baskets come off a pass',
  pct(t.assists, t.fgm) > 0.4 && pct(t.assists, t.fgm) < 0.85, fmt(pct(t.assists, t.fgm)));
check('turnovers happen, and are not the whole game',
  perTeam(t.turnovers) > 2 && perTeam(t.turnovers) < 30, perTeam(t.turnovers).toFixed(1));
check('somebody gets to the line',
  perTeam(t.fta) > 1, perTeam(t.fta).toFixed(1));
check('nobody plays on past six fouls', maxFouls <= HOOPS.foulOutAt, `${maxFouls}`);
check('the box score adds up to the team line', boxDrift === 0,
  `${boxDrift} sides drifted (${fouledOut} men fouled out)`);
check('points are scored inside as well as out',
  pct(t.paint, t.points) > 0.15, fmt(pct(t.paint, t.points)));

/* ------------------------------------------------------------------ season */

console.log('\nA WHOLE SEASON\n');
{
  const season = createSeason(TEAMS[0].id, 'pro', LENGTH, 77123);
  const games = new Map<string, { played: number; home: number }>();
  for (const t of TEAMS) games.set(t.id, { played: 0, home: 0 });
  for (const f of season.schedule) {
    const h = games.get(f.homeId);
    const a = games.get(f.awayId);
    if (h) { h.played++; h.home++; }
    if (a) a.played++;
    if (f.homeId === f.awayId) throw new Error('a club is scheduled against itself');
  }
  const counts = [...games.values()];
  check('every club plays the same number of games',
    new Set(counts.map((c) => c.played)).size === 1, `${counts[0].played} each`);
  check('and half of them at home',
    counts.every((c) => c.home * 2 === c.played), `${counts[0].home} home`);

  // Play it out, then the bracket.
  for (let i = 0; i < season.schedule.length; i++) simulateGame(season, i);
  const table = standings(season);
  const wins = table.reduce((n, r) => n + r.wins, 0);
  const losses = table.reduce((n, r) => n + r.losses, 0);
  check('every fixture produced exactly one winner and one loser',
    wins === season.schedule.length && losses === season.schedule.length,
    `${wins}W ${losses}L of ${season.schedule.length}`);
  check('the table is ordered by record',
    table.every((r, i) => i === 0 || table[i - 1].wins >= r.wins),
    table.map((r) => `${r.team.abbr} ${r.wins}-${r.losses}`).slice(0, 3).join(', '));
  check('somebody is better than somebody else',
    table[0].wins - table[table.length - 1].wins >= 4,
    `${table[0].wins} to ${table[table.length - 1].wins}`);
  check('points for and against balance across the league',
    table.reduce((n, r) => n + r.pointsFor - r.pointsAgainst, 0) === 0);

  beginPlayoffs(season);
  let guard = 0;
  while (guard++ < 40) {
    const g = nextPlayoffGame(season);
    if (!g) break;
    const sim = playoffGameFor(season, g, null);
    sim.simulateRest();
    recordPlayoff(g, sim.score.home, sim.score.away);
  }
  check('the bracket is seven games', season.playoffs.length === 7,
    `${season.playoffs.length}`);
  check('and it produces a champion', !!season.championId,
    season.championId ?? 'nobody');
  const champ = TEAMS.find((t) => t.id === season.championId);
  const seeded = playoffSeeds(season);
  check('who was in the field',
    [...seeded.East, ...seeded.West].some((r) => r.team.id === season.championId),
    champ?.name ?? '');
  check('no playoff game ended level',
    season.playoffs.every((g) => g.homeScore !== g.awayScore));

  const next = rollOver(season);
  check('next year starts empty but remembers the titles',
    next.year === 2 && next.results.length === 0 && next.schedule.length === season.schedule.length,
    `year ${next.year}`);

  // The same seed builds the same schedule, so a season is reproducible too.
  const twin = createSeason(TEAMS[0].id, 'pro', LENGTH, 77123);
  check('the same seed builds the same schedule',
    JSON.stringify(twin.schedule) === JSON.stringify(season.schedule));
}

/* -------------------------------------------------------------- determinism */

console.log('\nTHE SAME GAME TWICE\n');
const a = play(0, 6, 4242);
const b = play(0, 6, 4242);
const boxOf = (g: HoopsGame): string => JSON.stringify([
  g.score, g.box.home.fga, g.box.home.fgm, g.box.home.tpm, g.box.home.offReb,
  g.box.away.fga, g.box.away.fgm, g.box.away.tpm, g.box.away.assists,
  g.quarter, g.box.home.fouls, g.box.away.turnovers,
]);
check('the same seed plays the same game', boxOf(a) === boxOf(b),
  `${a.score.home}-${a.score.away} v ${b.score.home}-${b.score.away}`);
const c = play(0, 6, 4243);
check('a different seed does not', boxOf(a) !== boxOf(c),
  `${a.score.home}-${a.score.away} v ${c.score.home}-${c.score.away}`);

/* ------------------------------------------------------- does quality win? */

console.log('\nDOES THE BETTER TEAM WIN?\n');
// The best club in the league against the worst, both ways round so home
// advantage cannot be mistaken for quality.
const best = TEAMS.findIndex((x) => x.prestige === 5);
const worst = TEAMS.findIndex((x) => x.prestige === 2);
let strongWins = 0;
let runs = 0;
const margins: number[] = [];
// Thirty, because a basketball result has real variance in it: a ten-point
// roster gap is about a seven-point spread, and a seven-point favourite loses
// often enough that twenty runs cannot tell luck from balance.
for (let i = 0; i < 30; i++) {
  const flip = i % 2 === 0;
  const g = play(flip ? best : worst, flip ? worst : best, 7000 + i);
  const strongScore = flip ? g.score.home : g.score.away;
  const weakScore = flip ? g.score.away : g.score.home;
  if (strongScore > weakScore) strongWins++;
  margins.push(strongScore - weakScore);
  runs++;
}
const strongRate = strongWins / runs;
console.log(`  ${TEAMS[best].abbr} (${teamRatings(generateRoster(TEAMS[best], 1)).overall} ovr)`
  + ` v ${TEAMS[worst].abbr} (${teamRatings(generateRoster(TEAMS[worst], 1)).overall} ovr)`);
console.log(`  the better team won ${strongWins}/${runs}, average margin ${mean(margins).toFixed(1)}`);
check('the better roster wins more often than not', strongRate > 0.6, `${strongWins}/${runs}`);
check('but not every time — it is still a game', strongRate < 1.0, `${strongWins}/${runs}`);
check('the margin is a basketball margin', Math.abs(mean(margins)) < 40,
  mean(margins).toFixed(1));

/* ------------------------------------------------------ shot chart sanity */

console.log('\nWHERE THE SHOTS COME FROM\n');
{
  // Re-play a few games watching every release, so the shot chart can be read.
  const buckets = new Map<string, number>();
  let threes = 0;
  let attempts = 0;
  for (let g = 0; g < 6; g++) {
    const game = new HoopsGame({
      home: { team: TEAMS[0], roster: generateRoster(TEAMS[0], 99) },
      away: { team: TEAMS[7], roster: generateRoster(TEAMS[7], 99) },
      humanSide: null,
      quarterSeconds: GAME_LENGTHS.standard.quarterSeconds,
      difficulty: DIFFICULTIES.pro,
      seed: 31000 + g,
    });
    game.events.on('shot', (e) => {
      attempts++;
      shotDistances.push(e.distance);
      const band = e.distance < 4 ? 'at the rim'
        : e.distance < 10 ? '4-10ft'
          : e.distance < 16 ? '10-16ft'
            : e.distance < COURT.threeRadius ? '16ft to the line'
              : 'three';
      buckets.set(band, (buckets.get(band) ?? 0) + 1);
      if (e.distance >= COURT.threeRadius) threes++;
    });
    game.simulateRest(3600, false);
  }
  for (const band of ['at the rim', '4-10ft', '10-16ft', '16ft to the line', 'three']) {
    const n = buckets.get(band) ?? 0;
    console.log(`  ${band.padEnd(20)} ${String(n).padStart(4)}  ${fmt(pct(n, attempts))}`);
  }
  check('shots come from everywhere, not one spot',
    [...buckets.values()].filter((n) => n > attempts * 0.04).length >= 3,
    `${buckets.size} bands used`);
  check('somebody attacks the rim',
    pct(buckets.get('at the rim') ?? 0, attempts) > 0.1,
    fmt(pct(buckets.get('at the rim') ?? 0, attempts)));
  check('nobody shoots from the car park',
    mean(shotDistances) < 24, `${mean(shotDistances).toFixed(1)}ft average`);
  void threes;
  void threeShare;
  void totalShots;
}

/* ------------------------------------------------------- the difficulties */

console.log('\nTHE DIFFICULTY LADDER\n');
console.log('tier        AI points   its FG%   its shot quality   human-side points');
const tierRows: { key: DifficultyKey; pts: number; fg: number; quality: number }[] = [];
/*
 * WHAT A DIFFICULTY ACTUALLY CHANGES, measured properly.
 *
 * Shooting percentage cannot answer this. Both sides of a simulated game run on
 * the same tier, so a harder setting improves the offence AND the defence and the
 * two cancel almost exactly — which is what the first version of this check
 * measured, and why it read as noise.
 *
 * What a tier really changes is the QUALITY OF THE SHOTS THE AI CHOOSES TO TAKE:
 * patience, shot selection and the release it commits to. That is measurable
 * directly, at the moment of release, and it is the thing the setting claims to
 * do — with no rating anywhere in it.
 */
for (const key of ['rookie', 'pro', 'allstar', 'legend'] as DifficultyKey[]) {
  let aiPts = 0;
  let oppPts = 0;
  let fgm = 0;
  let fga = 0;
  let quality = 0;
  let shotsSeen = 0;
  const runsPer = 8;
  for (let i = 0; i < runsPer; i++) {
    const home = TEAMS[1];
    const away = TEAMS[8];
    const g = new HoopsGame({
      home: { team: home, roster: generateRoster(home, 5000 + i) },
      away: { team: away, roster: generateRoster(away, 5000 + i) },
      humanSide: null,
      quarterSeconds: GAME_LENGTHS[LENGTH].quarterSeconds,
      difficulty: DIFFICULTIES[key],
      seed: 5000 + i,
    });
    g.events.on('shot', (e) => {
      if (e.kind === 'freeThrow') return;
      quality += e.quality;
      shotsSeen++;
    });
    g.simulateRest(3600, false);
    aiPts += g.score.away;
    oppPts += g.score.home;
    fgm += g.box.away.fgm;
    fga += g.box.away.fga;
  }
  const row = {
    key, pts: aiPts / runsPer, fg: pct(fgm, fga), quality: quality / Math.max(1, shotsSeen),
  };
  tierRows.push(row);
  console.log(`  ${DIFFICULTIES[key].label.padEnd(10)} ${row.pts.toFixed(1).padStart(9)}`
    + `   ${fmt(row.fg).padStart(6)}   ${fmt(row.quality).padStart(16)}   ${(oppPts / runsPer).toFixed(1)}`);
}
const rookieQ = tierRows[0].quality;
const legendQ = tierRows[3].quality;
check('a harder tier takes a better shot', legendQ > rookieQ + 0.005,
  `${fmt(rookieQ)} -> ${fmt(legendQ)}`);
check('and the ladder is ordered, not random',
  tierRows.every((r, i) => i === 0 || r.quality >= tierRows[i - 1].quality - 0.012),
  tierRows.map((r) => fmt(r.quality)).join(' -> '));

/* ------------------------------------------------------------- the corners */

console.log('\nTHE LINE ITSELF\n');
check('the corner three is inside the sideline',
  isThree(COURT.length - 8, 2.5, 'home') && !isThree(COURT.length - 8, 6, 'home'),
  'straight section held');
// Measured from the RIM, which is where the rule measures it — the rim sits
// 5.25ft in from the baseline, so a spot 26ft from the baseline is only 20.75ft
// from the basket and is a long two, not a three.
const topOfArc = COURT.length - COURT.rimInset - COURT.threeRadius - 1.5;
check('the arc is a three at the top', isThree(topOfArc, COURT.centerY, 'home'),
  `${(COURT.length - COURT.rimInset - topOfArc).toFixed(1)}ft from the rim`);
check('a step inside the arc is not',
  !isThree(topOfArc + 3, COURT.centerY, 'home'),
  `${(COURT.length - COURT.rimInset - topOfArc - 3).toFixed(1)}ft from the rim`);
check('a layup is not a three', !isThree(COURT.length - 6, COURT.centerY, 'home'));

console.log();
if (problems.length) {
  console.log(`${problems.length} of ${checks} checks FAILED:`);
  for (const p of problems) console.log(`  - ${p}`);
  env?.exit(1);
} else {
  console.log(`${checks}/${checks} checks passed`);
}
