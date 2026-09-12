/**
 * THE FIRST SEASONS OF A CHALLENGE CAREER
 *
 * The climb only works if the bottom of it feels like the bottom. A coach who
 * takes the worst programme in the district and wins the class in his first
 * season has not been given a challenge, he has been given a head start.
 *
 * So this runs the starting job twice, with the same seeds, at every tier:
 *
 *   PASSIVE — a coach who does nothing. No Coach Points spent, nobody
 *     recruited, no transfers worked. He should lose, stay last, and not win
 *     anything. If doing nothing works, the systems are decoration.
 *
 *   ACTIVE — a coach who actually coaches: the tree, the staff, scouts,
 *     recruiting and the portal, every season. He should climb out of the hole
 *     and win the class within a handful of years. If he cannot, the job is not
 *     a challenge, it is a dead end.
 *
 * Both failures matter, which is why both arms are here.
 *
 *   npm run start-check
 */
import { Rng } from '../core/rng';
import {
  advancePhase, buyCoachUpgrade, coachProfile, coachUpgradeCost, effectiveTeam,
  nextUserGame, pitchTo, programSnapshot, resolveChallengeSeason, runOffseason,
  simulateUserGame, spendCoachPoints, staffUpgradeCost, startChallenge,
} from '../league/career';
import { UPGRADES, levelOf } from '../challenge/coach';
import { upgradeCost, TRACK_ORDER } from '../league/coaching';
import { assignScout, board, hireScout, makeOffer } from '../scouting/recruiting';
import { estimateOf, levelPar } from '../scouting/prospects';
import { suggestedAngle } from '../league/transfers';
import { programmesAt } from '../challenge/ladder';
import { SITUATIONS } from '../challenge/situations';
import { TIERS, TIER_ORDER, type ChallengeTier } from '../challenge/difficulty';
import type { Career } from '../league/types';

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

/** SEEDS=28 npm run start-check for a tighter read; 16 is enough day to day. */
const SEEDS = Number(env?.env?.SEEDS ?? 16);
/** Eight seasons: long enough that the hardest tiers can be judged fairly — a
 *  Final Challenge career spends about six years at the bottom rung. */
const SEASONS = Number(env?.env?.SEASONS ?? 8);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/* ----------------------------------------------------------- a real coach */

function spend(career: Career): void {
  const profile = coachProfile(career);
  for (const u of UPGRADES) {
    if (profile.owned.includes(u.key)) continue;
    if (levelOf(profile.xp) < u.level) continue;
    if (!u.requires.every((r) => profile.owned.includes(r))) continue;
    if (profile.points < coachUpgradeCost(career, u.cost)) continue;
    buyCoachUpgrade(career, u.key);
  }
  for (const track of TRACK_ORDER) {
    for (;;) {
      const cost = staffUpgradeCost(career, upgradeCost(career.staff[track]));
      if (cost === null || career.coachingPoints < cost) break;
      if (!spendCoachPoints(career, cost)) break;
      career.staff[track]++;
    }
  }
}

function recruit(career: Career): void {
  const state = career.recruiting;
  if (!state || state.closed) return;
  const par = levelPar(state.level);
  for (const s of [...state.market]) {
    if (career.coachingPoints < s.salary + 10) break;
    if (!hireScout(state, s.id)) break;
    spendCoachPoints(career, s.salary);
  }
  const targets = [
    ...board(state, career.teamId, 'scouting').filter((p) => p.scouted < 60),
    ...board(state, career.teamId, 'targets'),
  ];
  for (const s of state.scouts) {
    if (s.assignedTo) {
      const cur = state.prospects.find((x) => x.id === s.assignedTo);
      if (cur && !cur.committedTo && cur.scouted < 70) continue;
    }
    const next = targets.find((p) => p.scouted < 60
      && !state.scouts.some((o) => o.assignedTo === p.id));
    if (next) assignScout(state, s.id, next.id);
  }
  const ranked = [...state.prospects]
    .filter((p) => !p.committedTo && !p.offered && (state.scouts.length ? p.scouted >= 45 : true))
    .sort((a, b) => estimateOf(b, par).potential - estimateOf(a, par).potential);
  for (const p of ranked) {
    if (state.offersLeft <= 0) break;
    makeOffer(state, p.id);
  }
}

function workPortal(career: Career): void {
  const snap = programSnapshot(career);
  let guard = 0;
  while (career.pitchesLeft > 0 && guard++ < 12) {
    const target = career.market.find((c) => c.status === 'open' || c.status === 'considering');
    if (!target) break;
    if (!pitchTo(career, target.id, suggestedAngle(target, snap))) break;
  }
}

/* ---------------------------------------------------------- the experiment */

interface Arm {
  /** Squad overall minus the class average, season one. */
  gap: number[];
  /** Win percentage, season one. */
  firstWinPct: number[];
  /** Win percentage in the last season reached. */
  lastWinPct: number[];
  /** Squad overall minus the class average, last season reached. */
  endGap: number[];
  titleYearOne: number;
  /** Seeds that won the class inside SEASONS years, and how long it took. */
  titled: number;
  /** Seeds that won it inside two seasons — before any squad they built arrived. */
  titledEarly: number;
  years: number[];
  sacked: number;
  worstStart: string;
  bestStart: string;
  depth: number[];
  chemistry: number[];
  situations: Record<string, number>;
}

function emptyArm(): Arm {
  return {
    gap: [], firstWinPct: [], lastWinPct: [], endGap: [], titleYearOne: 0,
    titled: 0, titledEarly: 0, years: [], sacked: 0, worstStart: '', bestStart: '',
    depth: [], chemistry: [], situations: {},
  };
}

function classAverage(career: Career): number {
  const pool = programmesAt(0);
  let total = 0;
  for (const p of pool) total += effectiveTeam(career, p.id).overall;
  return total / pool.length;
}

/** Starters minus the next men up: how far behind the bench is. */
function depthGap(career: Career): number {
  const sorted = [...career.roster].sort((a, b) => b.overall - a.overall);
  const avg = (xs: typeof sorted) =>
    xs.reduce((n, p) => n + p.overall, 0) / Math.max(1, xs.length);
  return avg(sorted.slice(0, 10)) - avg(sorted.slice(10, 20));
}

function playSeason(career: Career): void {
  let guard = 0;
  while (guard++ < 600) {
    const g = nextUserGame(career);
    if (!g) break;
    simulateUserGame(career, g);
  }
  advancePhase(career);
}

function runArm(tier: ChallengeTier, active: boolean): Arm {
  const arm = emptyArm();
  let worst = 9, best = -1;
  for (let s = 0; s < SEEDS; s++) {
    const seed = new Rng(`start:${tier}:${s}`).int(1, 10_000_000);
    const career = startChallenge({ difficulty: 'varsity', gameLength: 'short', seed, tier });
    const state = career.challenge!;
    arm.situations[state.situation] = (arm.situations[state.situation] ?? 0) + 1;
    arm.gap.push(effectiveTeam(career, career.teamId).overall - classAverage(career));
    arm.chemistry.push(effectiveTeam(career, career.teamId).chemistry);
    arm.depth.push(depthGap(career));

    for (let year = 1; year <= SEASONS; year++) {
      if (active) { spend(career); recruit(career); }
      const titlesBefore = career.championships;
      playSeason(career);
      const verdict = resolveChallengeSeason(career);
      const last = career.history[career.history.length - 1];
      const pct = last.wins / Math.max(1, last.wins + last.losses);
      // The counter, not the wording: "Lost the District Championship" contains
      // the word champion, and counting that as a title inflated every number
      // in this harness the first time it was written.
      const won = career.championships > titlesBefore;
      if (year === 1) {
        arm.firstWinPct.push(pct);
        if (pct < worst) { worst = pct; arm.worstStart = `${last.wins}-${last.losses}`; }
        if (pct > best) { best = pct; arm.bestStart = `${last.wins}-${last.losses}`; }
        if (won) arm.titleYearOne++;
      }
      arm.lastWinPct[s] = pct;
      arm.endGap[s] = effectiveTeam(career, career.teamId).overall - classAverage(career);
      if (won) {
        arm.titled++;
        if (year <= 2) arm.titledEarly++;
        arm.years.push(year);
        break;
      }
      if (verdict?.outcome === 'fired') { arm.sacked++; break; }
      if (state.complete) break;
      // This measures ONE programme, so promotions and poaching are declined.
      if (state.offers) state.offers = null;
      runOffseason(career);
      if (active) workPortal(career);
    }
  }
  return arm;
}

const passive: Record<string, Arm> = {};
const active: Record<string, Arm> = {};

console.log(`THE STARTING JOB — ${SEEDS} careers per tier per arm, first ${SEASONS} seasons\n`);
for (const tier of TIER_ORDER) {
  passive[tier] = runArm(tier, false);
  active[tier] = runArm(tier, true);
}

const row = (name: string, a: Arm): string =>
  `${name.padEnd(16)}`
  + `${mean(a.gap).toFixed(1).padStart(9)}`
  + `${`${a.worstStart} .. ${a.bestStart}`.padStart(18)}`
  + `${`${(mean(a.firstWinPct) * 100).toFixed(0)}%`.padStart(9)}`
  + `${`${a.titleYearOne}/${SEEDS}`.padStart(11)}`
  + `${`${a.titled}/${SEEDS}`.padStart(13)}`
  + `${`${a.titledEarly}/${SEEDS}`.padStart(11)}`
  + `${(a.years.length ? mean(a.years).toFixed(1) : '—').padStart(9)}`
  + `${mean(a.endGap.filter((n) => n !== undefined)).toFixed(1).padStart(10)}`
  + `${`${a.sacked}/${SEEDS}`.padStart(9)}`;

console.log('A COACH WHO DOES NOTHING');
console.log(`tier             squad     year-1 record   year-1    titles Y1   titles by Y${SEASONS}   by Y2   in years   end gap   sacked`);
for (const tier of TIER_ORDER) console.log(row(TIERS[tier].name, passive[tier]));
console.log('\nA COACH WHO COACHES');
for (const tier of TIER_ORDER) console.log(row(TIERS[tier].name, active[tier]));

console.log('\nSITUATIONS DRAWN');
for (const tier of TIER_ORDER) {
  const names = Object.entries(passive[tier].situations)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${SITUATIONS[k as keyof typeof SITUATIONS].label} x${n}`);
  console.log(`  ${TIERS[tier].name.padEnd(16)} ${names.join(', ')}`);
}

console.log();
for (const tier of TIER_ORDER) {
  const name = TIERS[tier].name;
  const p = passive[tier];
  const a = active[tier];

  /* the hole is real */
  check(`${name}: the squad you inherit is the worst in the class`, mean(p.gap) < -5,
    `${mean(p.gap).toFixed(1)} OVR below the class average`);
  check(`${name}: the bench is thin`, mean(p.depth) > 3, `${mean(p.depth).toFixed(1)} OVR gap`);
  check(`${name}: the room is cold`, mean(p.chemistry) < 62, `chemistry ${mean(p.chemistry).toFixed(0)}`);
  check(`${name}: year one is a losing season`, mean(p.firstWinPct) < 0.45,
    `${(mean(p.firstWinPct) * 100).toFixed(0)}% of games won`);

  /* Doing nothing does not work. One upset is allowed — a district playoff is
   * single elimination and a bottom seed stealing a bracket is part of the
   * sport, and the 'Bottom of the table' job literally asks you to do it. What
   * is not allowed is an early coronation, or a gap that closes on its own. */
  // Thresholds are rates, so the sample size can be raised without retuning
  // them. A district playoff is single elimination: a bottom seed stealing one
  // bracket is part of the sport, and the 'Bottom of the table' job asks you to
  // do exactly that. Dominating the class from a standing start is not.
  check(`${name}: the class is not handed to you in year one`,
    p.titleYearOne / SEEDS <= 0.2, `${p.titleYearOne}/${SEEDS} careers`);
  check(`${name}: a passive coach does not win it early`,
    p.titledEarly / SEEDS <= 0.35, `${p.titledEarly}/${SEEDS} inside two seasons`);
  check(`${name}: doing nothing does not close the gap`, mean(p.endGap) < -3,
    `${mean(p.endGap).toFixed(1)} OVR after ${SEASONS} seasons`);

  /* coaching does */
  check(`${name}: coaching closes the gap`, mean(a.endGap) > mean(p.endGap) + 1.5,
    `${mean(p.endGap).toFixed(1)} -> ${mean(a.endGap).toFixed(1)} OVR`);
  check(`${name}: the job is winnable by coaching`, a.titled / SEEDS >= 0.3,
    `${a.titled}/${SEEDS} won the class inside ${SEASONS} seasons`);
  check(`${name}: coaching beats not coaching`, a.titled > p.titled,
    `${a.titled} v ${p.titled} titles`);
}

/* the tiers have to be ordered at the start too, not only over a career */
const holes = TIER_ORDER.map((t) => mean(passive[t].gap));
check('a harder tier starts from a deeper hole',
  holes.every((h, i) => i === 0 || h <= holes[i - 1] + 0.4),
  holes.map((h) => h.toFixed(1)).join(' -> '));
const wins = TIER_ORDER.map((t) => mean(active[t].firstWinPct));
check('a harder tier is harder in season one',
  wins[0] > wins[wins.length - 1],
  wins.map((w) => `${(w * 100).toFixed(0)}%`).join(' -> '));

console.log();
if (problems.length) {
  console.log(`${problems.length} of ${checks} checks FAILED:`);
  for (const p of problems) console.log(`  - ${p}`);
  env?.exit(1);
} else {
  console.log(`${checks}/${checks} checks passed`);
}
