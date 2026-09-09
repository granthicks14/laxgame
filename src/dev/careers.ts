/**
 * CHALLENGE MODE STRESS TEST
 *
 * Runs whole coaching careers end to end, many of them, with different
 * strategies, and validates the save after every single game, season, playoff
 * round and job change. The point is not to prove one happy path works — it is
 * to try to break the thing before a player does.
 *
 *   npm run careers
 *   RUNS=12 YEARS=60 npm run careers
 *   npm run careers -- --verbose
 */
import {
  advancePhase, bracketRounds, buyCoachUpgrade, champion, coachProfile, declineChallengeOffers,
  nextUserGame, perksOf, pitchTo, postseasonStatus, resolveChallengeSeason, runOffseason,
  coachUpgradeCost, seasonFormat, simulateUserGame, spendCoachPoints, staffUpgradeCost,
  standingsSorted, startChallenge, takeChallengeJob, userTeam, validateRecords, winPct,
} from '../league/career';
import { fixtureStory } from '../league/fixture';
import { UPGRADES, levelOf } from '../challenge/coach';
import { STAGES, stageAt } from '../challenge/ladder';
import { assignScout, board, hireScout, makeOffer } from '../scouting/recruiting';
import { estimateOf, levelPar } from '../scouting/prospects';
import { PITCH_ORDER, suggestedAngle } from '../league/transfers';
import { programSnapshot } from '../league/career';
import { upgradeCost, TRACK_ORDER } from '../league/coaching';
import type { Career } from '../league/types';
import { TIERS, type ChallengeTier } from '../challenge/difficulty';

const env = (globalThis as { process?: { env?: Record<string, string | undefined>; argv?: string[]; exit(n: number): void } }).process;
const RUNS = Number(env?.env?.RUNS ?? 8);
const YEARS = Number(env?.env?.YEARS ?? 40);
const VERBOSE = (env?.argv ?? []).includes('--verbose');
/** TIER=elite runs one tier; unset sweeps all four. */
const TIER = env?.env?.TIER ?? '';

interface Bug { kind: string; detail: string; run: number; year: number }
const bugs: Bug[] = [];
let run = 0;
let year = 0;
const seen = new Set<string>();
function bug(kind: string, detail: string): void {
  const key = `${kind}::${detail}`;
  if (seen.has(key)) return;
  seen.add(key);
  bugs.push({ kind, detail, run, year });
  if (VERBOSE) console.log(`  BUG [${kind}] ${detail}`);
}

/* ------------------------------------------------------------ validation */

function checkRecords(career: Career, where: string): void {
  const problems = validateRecords(career);
  for (const p of problems) bug('record', `${where}: ${p}`);
  const mine = career.standings[career.teamId];
  if (!mine) { bug('record', `${where}: you have no row in your own standings`); return; }
  const played = career.schedule.filter((g) => g.featured && g.played && !g.playoff).length;
  if (mine.wins + mine.losses + mine.ties !== played) {
    bug('record', `${where}: ${mine.wins}-${mine.losses}-${mine.ties} against ${played} completed games`);
  }
  if (mine.confWins + mine.confLosses + mine.confTies > mine.wins + mine.losses + mine.ties) {
    bug('record', `${where}: more conference games than games`);
  }
}

function checkStandings(career: Career, where: string): void {
  for (const row of Object.values(career.standings)) {
    const games = career.schedule.filter(
      (g) => g.played && !g.playoff && (g.homeId === row.teamId || g.awayId === row.teamId),
    ).length;
    if (row.wins + row.losses + row.ties !== games) {
      bug('standings', `${where}: ${row.teamId} shows ${row.wins + row.losses + row.ties} of ${games}`);
    }
  }
  const table = standingsSorted(career);
  for (let i = 1; i < table.length; i++) {
    if (winPct(table[i - 1]) < winPct(table[i]) - 0.5) {
      bug('standings', `${where}: table is out of order`);
      break;
    }
  }
}

function checkRoster(career: Career, where: string): void {
  const r = career.roster;
  if (r.length < 16) bug('roster', `${where}: only ${r.length} players`);
  const ids = new Set(r.map((p) => p.id));
  if (ids.size !== r.length) bug('roster', `${where}: duplicate player ids`);
  const numbers = new Set(r.map((p) => p.number));
  if (numbers.size !== r.length) bug('roster', `${where}: duplicate shirt numbers`);
  for (const pos of ['A', 'M', 'D', 'G'] as const) {
    const n = r.filter((p) => p.pos === pos).length;
    const need = pos === 'G' ? 1 : 3;
    if (n < need) bug('roster', `${where}: only ${n} at ${pos}`);
  }
  for (const p of r) {
    if (!p.first || !p.last) bug('roster', `${where}: a player has no name`);
    if (p.overall < 1 || p.overall > 99) bug('roster', `${where}: ${p.last} is ${p.overall} overall`);
    if (p.potential < p.overall - 1) bug('roster', `${where}: ${p.last} ceiling below his rating`);
    if (!p.dev) bug('roster', `${where}: ${p.last} has no development profile`);
  }
}

function checkPlayoffs(career: Career, where: string): void {
  const fmt = seasonFormat(career);
  const playoffs = career.schedule.filter((g) => g.playoff);
  if (!playoffs.length) { bug('playoffs', `${where}: no postseason was played`); return; }
  if (playoffs.some((g) => !g.played)) bug('playoffs', `${where}: a playoff game was never played`);
  if (!champion(career)) bug('playoffs', `${where}: no champion`);
  const finals = playoffs.filter((g) => g.playoff === 'F');
  if (!finals.length) bug('playoffs', `${where}: no final was played`);
  void fmt;

  // The bracket the screen draws has to be the bracket that was played, and it
  // has to run through to a final — that is what an eliminated coach follows.
  const rounds = bracketRounds(career);
  if (!rounds.length) bug('playoffs', `${where}: the bracket screen would be empty`);
  if (rounds.reduce((n, r) => n + r.games.length, 0) !== playoffs.length) {
    bug('playoffs', `${where}: the bracket does not account for every playoff game`);
  }
  if (rounds.length && rounds[rounds.length - 1].games.length !== 1) {
    bug('playoffs', `${where}: the bracket does not end in a single final`);
  }

  // Where the coach stands has to agree with the schedule.
  const status = postseasonStatus(career);
  if (!status) { bug('playoffs', `${where}: no postseason status`); return; }
  const mine = playoffs.filter((g) => g.featured);
  if (status.qualified !== mine.length > 0) {
    bug('playoffs', `${where}: qualified says ${status.qualified} with ${mine.length} games`);
  }
  if (status.qualified && status.seed <= 0) {
    bug('playoffs', `${where}: in the bracket without a seed`);
  }
}

interface CoachSnapshot {
  points: number; xp: number; owned: number; staff: number;
  wins: number; losses: number; titles: number; seasons: number;
}
function snapshotCoach(career: Career): CoachSnapshot {
  const c = coachProfile(career);
  return {
    points: c.points, xp: c.xp, owned: c.owned.length,
    staff: TRACK_ORDER.reduce((n, t) => n + career.staff[t], 0),
    wins: c.careerWins, losses: c.careerLosses, titles: c.championships, seasons: c.seasons,
  };
}

function checkCoachSurvived(before: CoachSnapshot, after: CoachSnapshot, where: string): void {
  if (after.owned < before.owned) bug('coach', `${where}: upgrades went from ${before.owned} to ${after.owned}`);
  if (after.staff < before.staff) bug('coach', `${where}: staff went from ${before.staff} to ${after.staff}`);
  if (after.xp < before.xp) bug('coach', `${where}: experience went backwards`);
  if (after.points < before.points) bug('coach', `${where}: coach points went from ${before.points} to ${after.points}`);
  if (after.wins < before.wins) bug('coach', `${where}: career wins went backwards`);
  if (after.titles < before.titles) bug('coach', `${where}: championships went backwards`);
  if (after.seasons < before.seasons) bug('coach', `${where}: seasons coached went backwards`);
}

/* -------------------------------------------------------------- behaviour */

type Strategy = 'balanced' | 'upgrades' | 'nothing' | 'recruiting' | 'transfers' | 'wanderer';

function spend(career: Career, strategy: Strategy): void {
  if (strategy === 'nothing') return;
  const profile = coachProfile(career);
  // The coach's own tree first, then the office.
  if (strategy !== 'recruiting') {
    for (const u of UPGRADES) {
      if (profile.owned.includes(u.key)) continue;
      if (levelOf(profile.xp) < u.level) continue;
      if (!u.requires.every((r) => profile.owned.includes(r))) continue;
      // The PRICE, not the list cost: harder tiers charge a multiple, and
      // affordability has to be asked in the units actually charged.
      if (profile.points < coachUpgradeCost(career, u.cost)) continue;
      if (!buyCoachUpgrade(career, u.key)) bug('coach', 'an affordable upgrade could not be bought');
    }
  }
  if (strategy === 'upgrades') return;
  for (const track of TRACK_ORDER) {
    for (;;) {
      const cost = staffUpgradeCost(career, upgradeCost(career.staff[track]));
      if (cost === null || career.coachingPoints < cost) break;
      if (!spendCoachPoints(career, cost)) break;
      career.staff[track]++;
    }
  }
}

function recruit(career: Career, strategy: Strategy): void {
  const state = career.recruiting;
  if (!state || state.closed) return;
  if (strategy === 'nothing') return;
  const par = levelPar(state.level);
  for (const s of [...state.market]) {
    if (career.coachingPoints < s.salary + 10) break;
    if (!hireScout(state, s.id)) break;
    spendCoachPoints(career, s.salary);
  }
  const tipped = board(state, career.teamId, 'scouting').filter((p) => p.scouted < 60);
  const targets = [...tipped, ...board(state, career.teamId, 'targets')];
  for (const s of state.scouts) {
    if (s.assignedTo) {
      const cur = state.prospects.find((x) => x.id === s.assignedTo);
      if (cur && !cur.committedTo && cur.scouted < 70) continue;
    }
    const next = targets.find((p) => p.scouted < 60 && !state.scouts.some((o) => o.assignedTo === p.id));
    if (next) assignScout(state, s.id, next.id);
  }
  const ranked = [...state.prospects]
    .filter((p) => !p.committedTo && !p.offered && (state.scouts.length ? p.scouted >= 45 : true))
    .sort((a, b) => estimateOf(b, par).potential - estimateOf(a, par).potential);
  for (const p of ranked) {
    if (state.offersLeft <= 0) break;
    const r = makeOffer(state, p.id);
    if (!r.ok) bug('recruiting', `an offer was refused: ${r.reason}`);
  }
}

function workPortal(career: Career, strategy: Strategy): void {
  if (strategy === 'nothing') return;
  const snap = programSnapshot(career);
  let guard = 0;
  while (career.pitchesLeft > 0 && guard++ < 12) {
    const target = career.market.find((c) => c.status === 'open' || c.status === 'considering');
    if (!target) break;
    const angle = strategy === 'transfers'
      ? suggestedAngle(target, snap)
      : PITCH_ORDER[guard % PITCH_ORDER.length];
    const before = career.pitchesLeft;
    const out = pitchTo(career, target.id, angle);
    if (!out) { bug('transfers', 'an approach with pitches left produced nothing'); break; }
    if (career.pitchesLeft !== before - 1) bug('transfers', 'an approach did not cost a pitch');
  }
}

function playSeason(career: Career, strategy: Strategy): void {
  let guard = 0;
  let games = 0;
  while (guard++ < 600) {
    const g = nextUserGame(career);
    if (!g) break;
    const wasPlayed = career.schedule.filter((x) => x.played).length;
    simulateUserGame(career, g);
    if (career.schedule.filter((x) => x.played).length <= wasPlayed) {
      bug('season', 'a game was simulated but never marked played');
      break;
    }
    games++;
    // Validate after EVERY game: a record must never drift for even one fixture.
    checkRecords(career, `year ${year} after game ${games}`);
    // A simulated game must come back with a story, and the story must quote
    // the score that is actually on the record.
    const story = fixtureStory(career, g);
    if (!story) {
      bug('stories', `year ${year}: a simulated game produced no story`);
    } else {
      const mine = g.homeId === career.teamId ? g.homeScore : g.awayScore;
      const theirs = g.homeId === career.teamId ? g.awayScore : g.homeScore;
      const hi = `${Math.max(mine, theirs)}-${Math.min(mine, theirs)}`;
      const lo = `${Math.min(mine, theirs)}-${Math.max(mine, theirs)}`;
      if (/\d+-\d+/.test(story.line) && !story.line.includes(hi) && !story.line.includes(lo)) {
        bug('stories', `year ${year}: "${story.line}" does not match ${mine}-${theirs}`);
      }
    }
    if (games % 4 === 0) recruit(career, strategy);
  }
  advancePhase(career);
  if (games === 0) bug('season', 'a season contained no games for the coach');
}

/* ------------------------------------------------------------------- runs */

const STRATEGIES: Strategy[] = ['balanced', 'upgrades', 'nothing', 'recruiting', 'transfers', 'wanderer'];

interface RunResult {
  tier: ChallengeTier;
  strategy: Strategy; years: number; stage: number; titles: number;
  jobs: number; upgrades: number; points: number; level: number; ended: string;
  /** Seasons spent out of work, and jobs lost — the shape of a hard career. */
  fired: number;
  /** Recruiting and transfer battles the coach LOST, which is what should make
   *  a hard tier hard rather than a rating penalty. */
  lostRecruits: number;
  lostTransfers: number;
  /** Seasons spent at each rung, indexed by stage. */
  perRung: number[];
}
const runs: RunResult[] = [];

// Every tier gets the same strategies and the same seeds, so a difference in
// the table below is the difficulty and nothing else.
const TIERS_TESTED: ChallengeTier[] = TIER
  ? [TIER as ChallengeTier]
  : ['standard', 'elite', 'impossible', 'final'];

for (const tier of TIERS_TESTED) {
for (run = 1; run <= RUNS; run++) {
  const strategy = STRATEGIES[(run - 1) % STRATEGIES.length];
  const career = startChallenge({
    difficulty: 'varsity', gameLength: 'short', seed: 90000 + run * 613, tier,
  });
  let fired = 0;
  let lostRecruits = 0;
  let lostTransfers = 0;
  const perRung: number[] = STAGES.map(() => 0);
  const state = career.challenge!;
  let jobs = 1;

  while (!state.complete && state.totalYears < YEARS) {
    year = state.totalYears + 1;
    perRung[state.stageIndex]++;
    spend(career, strategy);
    recruit(career, strategy);
    checkRoster(career, `year ${year} preseason`);

    playSeason(career, strategy);
    checkRecords(career, `year ${year} end of season`);
    checkStandings(career, `year ${year}`);
    checkPlayoffs(career, `year ${year}`);
    if (!career.seasonComplete) bug('season', `year ${year}: the season never completed`);

    const before = snapshotCoach(career);
    const verdict = resolveChallengeSeason(career);
    if (!verdict) bug('career', `year ${year}: a completed season was not graded`);
    if (verdict?.outcome === 'fired') fired++;
    // Recruiting battles have to be counted while the class is still open: the
    // career only ever holds the CURRENT one, so a total taken at the end is
    // the last season's, not the career's.
    for (const pr of career.recruiting?.prospects ?? []) {
      if (pr.offered && pr.committedTo && pr.committedTo !== career.teamId) lostRecruits++;
    }
    for (const c of career.market) {
      if (c.attempts > 0 && c.status !== 'committed') lostTransfers++;
    }
    if (state.complete && state.stageIndex < STAGES.length - 1) {
      bug('career', `year ${year}: the career ended at ${stageAt(state.stageIndex).key}`);
      break;
    }
    if (state.complete) break;

    if (state.offers && state.offers.length) {
      // A wanderer turns the first offer down to exercise that path.
      if (strategy === 'wanderer' && jobs % 3 === 0 && !state.fired) {
        declineChallengeOffers(career);
        checkCoachSurvived(before, snapshotCoach(career), `year ${year} declining offers`);
        if (state.complete) break;
        runOffseason(career);
        checkRoster(career, `year ${year} after offseason`);
        continue;
      }
      const pick = state.offers[0];
      takeChallengeJob(career, pick);
      jobs++;
      // THE CENTRAL CHECK OF THIS WHOLE HARNESS.
      checkCoachSurvived(before, snapshotCoach(career), `year ${year} changing jobs`);
      checkRoster(career, `year ${year} at the new programme`);
      if (career.schedule.length === 0) bug('career', `year ${year}: the new job has no schedule`);
      if (Object.keys(career.standings).length < 4) bug('career', `year ${year}: the new job has no standings`);
      if (career.seasonComplete) bug('career', `year ${year}: the new season starts already complete`);
      continue;
    }

    if (state.fired) {
      declineChallengeOffers(career);
      checkCoachSurvived(before, snapshotCoach(career), `year ${year} out of work`);
      if (state.complete) break;
      continue;
    }

    runOffseason(career);
    checkCoachSurvived(before, snapshotCoach(career), `year ${year} offseason`);
    checkRoster(career, `year ${year} after offseason`);
    workPortal(career, strategy);
    checkRoster(career, `year ${year} after the portal`);
  }

  const profile = coachProfile(career);
  runs.push({
    tier,
    perRung,
    fired,
    lostRecruits,
    lostTransfers,
    strategy,
    years: state.totalYears,
    stage: state.stageIndex,
    titles: Object.values(state.titles).reduce((n, v) => n + v, 0),
    jobs,
    upgrades: profile.owned.length,
    points: profile.points,
    level: levelOf(profile.xp),
    ended: state.endedReason ?? (state.complete ? 'complete' : 'still coaching'),
  });
  if (VERBOSE) {
    console.log(`run ${run} (${strategy}): ${state.totalYears}y, rung ${state.stageIndex + 1}, `
      + `${jobs} jobs, ${profile.owned.length} upgrades, level ${levelOf(profile.xp)}`);
  }
  void perksOf(career);
  void userTeam(career);
}
}

/* ---------------------------------------------------------------- report */

console.log(
  `CHALLENGE MODE STRESS TEST — ${TIERS_TESTED.length} tier(s) x ${RUNS} careers, `
  + `up to ${YEARS} seasons each\n`,
);
for (const tier of TIERS_TESTED) {
  const mine = runs.filter((r) => r.tier === tier);
  console.log(`${TIERS[tier].name.toUpperCase()}`);
  console.log('  strategy     years  rung  titles  jobs  upgr  lvl  sacked  lost  ending');
  for (const r of mine) {
    console.log(
      `  ${r.strategy.padEnd(12)} ${String(r.years).padStart(5)}  `
      + `${stageAt(r.stage).short.padEnd(5)} ${String(r.titles).padStart(6)}  `
      + `${String(r.jobs).padStart(4)}  ${String(r.upgrades).padStart(4)}  `
      + `${String(r.level).padStart(3)}  ${String(r.fired).padStart(6)}  `
      + `${String(r.lostRecruits + r.lostTransfers).padStart(4)}  ${r.ended}`,
    );
  }
  console.log();
}

/* ------------------------------------------------- is the ladder ordered? */

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
interface TierSummary {
  tier: ChallengeTier;
  finished: number;
  of: number;
  /** Seasons taken by the careers that FINISHED — the number that matters. */
  seasonsToFinish: number;
  rung: number;
  upgrades: number;
  sacked: number;
  /** Recruiting and transfer battles lost across the whole career. */
  lost: number;
}
const summaries: TierSummary[] = TIERS_TESTED.map((tier) => {
  const mine = runs.filter((r) => r.tier === tier);
  const done = mine.filter((r) => r.ended.includes('Premier'));
  return {
    tier,
    finished: done.length,
    of: mine.length,
    seasonsToFinish: avg(done.map((r) => r.years)),
    rung: avg(mine.map((r) => r.stage + 1)),
    upgrades: avg(mine.map((r) => r.upgrades)),
    sacked: avg(mine.map((r) => r.fired)),
    lost: avg(mine.map((r) => r.lostRecruits + r.lostTransfers)),
  };
});

// Where the seasons actually go. With strict one-rung-at-a-time promotion the
// whole climb is nine championships, so "seasons per rung" is the single number
// that decides how long a career runs — and the one to move when retuning pace.
console.log('SEASONS SPENT PER RUNG\n');
console.log(`tier          ${STAGES.map((st) => st.short.padStart(7)).join('')}`);
for (const tier of TIERS_TESTED) {
  const mine = runs.filter((r) => r.tier === tier);
  const cells = STAGES.map((_, i) => {
    const spans = mine.map((r) => r.perRung[i]).filter((n): n is number => n !== undefined && n > 0);
    return (spans.length ? avg(spans).toFixed(1) : '—').padStart(7);
  });
  console.log(`${TIERS[tier].mark.padEnd(13)} ${cells.join('')}`);
}

console.log(
  '\ntier          finished   seasons to PLL   avg rung   avg upgrades   sacked   battles lost',
);
for (const s of summaries) {
  console.log(
    `${TIERS[s.tier].mark.padEnd(13)} ${`${s.finished}/${s.of}`.padStart(8)}   `
    + `${(s.seasonsToFinish ? s.seasonsToFinish.toFixed(1) : '—').padStart(14)}   `
    + `${s.rung.toFixed(1).padStart(8)}   `
    + `${s.upgrades.toFixed(1).padStart(12)}   ${s.sacked.toFixed(1).padStart(6)}   `
    + `${s.lost.toFixed(0).padStart(12)}`,
  );
}

// The ladder has to be ORDERED. A harder tier that finishes faster, or lets a
// coach buy more of the tree, is not a harder tier — it is a mislabelled one.
if (TIERS_TESTED.length > 1) {
  console.log();
  for (let i = 1; i < summaries.length; i++) {
    const below = summaries[i - 1];
    const here = summaries[i];
    const problems: string[] = [];
    if (here.rung > below.rung + 0.4) {
      problems.push(`climbs further (${here.rung.toFixed(1)} vs ${below.rung.toFixed(1)})`);
    }
    if (here.upgrades > below.upgrades + 0.6) {
      problems.push(`buys more of the tree (${here.upgrades.toFixed(1)} vs ${below.upgrades.toFixed(1)})`);
    }
    const ok = problems.length === 0;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${TIERS[below.tier].mark} -> ${TIERS[here.tier].mark}`
      + `${ok ? '   harder in every measure' : `   ${problems.join('; ')}`}`,
    );
    if (!ok) bug('difficulty', `${TIERS[here.tier].mark} is not harder than ${TIERS[below.tier].mark}: ${problems.join('; ')}`);
  }

  // And every tier has to remain POSSIBLE. A difficulty nobody can finish is a
  // wall, not a challenge — the brief was "extremely difficult but possible".
  const hardest = summaries[summaries.length - 1];
  if (hardest.finished === 0 && hardest.rung < 5) {
    bug('difficulty', `${TIERS[hardest.tier].mark} never got past rung ${hardest.rung.toFixed(1)}`);
  }
}

const byKind = new Map<string, number>();
for (const b of bugs) byKind.set(b.kind, (byKind.get(b.kind) ?? 0) + 1);

console.log(`\n${bugs.length === 0 ? 'NO BUGS FOUND' : `${bugs.length} DISTINCT BUGS`}`);
for (const [kind, n] of byKind) console.log(`  ${kind}: ${n}`);
if (bugs.length) {
  console.log('');
  for (const b of bugs.slice(0, 40)) console.log(`  [${b.kind}] run ${b.run} year ${b.year}: ${b.detail}`);
  env?.exit(1);
}
