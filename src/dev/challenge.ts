/**
 * Challenge Mode progression harness: runs the whole ladder, from the bottom of
 * Class D to the PLL, simulating every game and taking the best job on offer
 * each time one appears.
 *
 *   npm run challenge            # one career
 *   RUNS=8 npm run challenge     # a sample, for balance
 */
import {
  advancePhase, declineChallengeOffers, nextUserGame, resolveChallengeSeason,
  runOffseason, seekChallengeJob, simulateUserGame, startChallenge, takeChallengeJob,
  userTeam, challengeLegacy,
} from '../league/career';
import { assignScout, board, hireScout, makeOffer } from '../scouting/recruiting';
import { estimateOf, levelPar } from '../scouting/prospects';
import { stageAt } from '../challenge/ladder';
import { TRACK_ORDER, upgradeCost } from '../league/coaching';
import { SITUATIONS } from '../challenge/situations';
import type { Career } from '../league/types';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const RUNS = Number(env.RUNS ?? 1);
const MAX_YEARS = Number(env.MAX_YEARS ?? 45);
const VERBOSE = RUNS === 1;

/** A plausible coach: builds development first, then defence, then culture. */
function spend(career: Career): void {
  const order = ['development', 'defense', 'culture', 'offense', 'conditioning'] as const;
  for (const track of order) {
    for (;;) {
      const cost = upgradeCost(career.staff[track]);
      if (cost === null || career.coachingPoints < cost) break;
      career.coachingPoints -= cost;
      career.staff[track]++;
    }
  }
  void TRACK_ORDER;
}

/**
 * A competent recruiter: hires what he can afford, puts his scouts on the best
 * available targets, and offers to the players his own reports rate highest —
 * which is not the same list as the rankings.
 */
function recruit(career: Career): void {
  const state = career.recruiting;
  if (!state || state.closed) return;
  const par = levelPar(state.level);

  for (const s of [...state.market]) {
    if (career.coachingPoints < s.salary + 12) break;
    if (!hireScout(state, s.id)) break;
    career.coachingPoints -= s.salary;
  }

  const targets = board(state, career.teamId, 'targets');
  for (const scout of state.scouts) {
    if (scout.assignedTo) {
      const p = state.prospects.find((x) => x.id === scout.assignedTo);
      if (p && !p.committedTo && p.scouted < 92) continue;
    }
    const next = targets.find((p) => p.scouted < 60 && !state.scouts.some((s) => s.assignedTo === p.id));
    if (next) assignScout(state, scout.id, next.id);
  }

  // Offer to the best ceilings YOUR scouts believe in, once there is something
  // to believe. That is where a gem gets signed.
  const ranked = [...state.prospects]
    .filter((p) => !p.committedTo && !p.offered && p.scouted >= 45)
    .sort((a, b) => estimateOf(b, par).potential - estimateOf(a, par).potential);
  for (const p of ranked) {
    if (state.offersLeft <= 0) break;
    makeOffer(state, p.id);
  }
}

function playSeason(career: Career): void {
  spend(career);
  recruit(career);
  let guard = 0;
  while (guard++ < 500) {
    const g = nextUserGame(career);
    if (!g) break;
    simulateUserGame(career, g);
  }
  advancePhase(career);
}

interface RunResult {
  years: number;
  stage: number;
  titles: number;
  fired: number;
  score: number;
  title: string;
  reason: string;
}

function run(seed: number): RunResult {
  const career = startChallenge({ difficulty: 'varsity', gameLength: 'short', seed });
  const state = career.challenge!;
  let fired = 0;

  if (VERBOSE) {
    console.log(`Start: ${userTeam(career).name} — ${stageAt(0).short}`);
    console.log(`Situation: ${SITUATIONS[state.situation].label} — ${SITUATIONS[state.situation].blurb}\n`);
  }

  while (!state.complete && state.totalYears < MAX_YEARS) {
    playSeason(career);
    const verdict = resolveChallengeSeason(career);
    const last = career.history[career.history.length - 1];
    if (VERBOSE) {
      const stage = stageAt(state.stageIndex);
      console.log(
        `Y${String(state.totalYears).padStart(2)} ${stage.short.padEnd(7)} ${userTeam(career).short.padEnd(16)} `
        + `${last.wins}-${last.losses}  rep ${Math.round(state.reputation).toString().padStart(3)}  `
        + `heat ${state.heat}  ${last.finish}`,
      );
      for (const m of verdict?.messages ?? []) console.log(`      ${m}`);
    }
    if (verdict?.outcome === 'fired') fired++;
    if (state.complete) break;

    if (state.offers && state.offers.length) {
      // Once in a career, turn everything down after a sacking: it exercises
      // the year-out-of-the-game path, which is a real way this mode ends.
      if (state.fired && fired === 1 && state.strikes === 0) {
        if (VERBOSE) console.log('      turned everything down — a year out of the game');
        declineChallengeOffers(career);
        if (state.complete) break;
        continue;
      }
      // Take the best programme available, which is what a coach climbing does.
      const pick = state.offers[0];
      if (VERBOSE) {
        console.log(`      OFFERS: ${state.offers.map((o) => `${o.teamShort} (${o.prestige}, ${SITUATIONS[o.situation].label})`).join(' | ')}`);
        console.log(`      → took ${pick.teamName}, ${stageAt(pick.stageIndex).short}`);
      }
      takeChallengeJob(career, pick);
    } else {
      if (state.fired) declineChallengeOffers(career);
      if (state.complete) break;
      // A coach who has been stuck for years puts his name about. The only way
      // UP is still a championship; this is how you escape a dead end sideways.
      const stuck = state.tenure >= 6 && !state.steps.slice(-4).some((x) => x.champion);
      if (stuck) {
        const found = seekChallengeJob(career);
        if (found && found.length) {
          const pick = found[0];
          if (VERBOSE) console.log(`      LOOKED AROUND → ${pick.teamName} (${pick.prestige})`);
          takeChallengeJob(career, pick);
          continue;
        }
      }
      runOffseason(career);
    }
  }

  const legacy = challengeLegacy(career)!;
  const titles = Object.values(state.titles).reduce((n, v) => n + v, 0);
  return {
    years: state.totalYears,
    stage: state.stageIndex,
    titles,
    fired,
    score: legacy.score,
    title: legacy.title,
    reason: state.endedReason ?? 'still coaching',
  };
}

const SEED = env.SEED ? Number(env.SEED) : null;
const results: RunResult[] = [];
for (let i = 0; i < RUNS; i++) results.push(run(SEED ?? 4400 + i * 977));

if (VERBOSE) {
  const r = results[0];
  console.log(`\nEnded at ${stageAt(r.stage).name} after ${r.years} seasons.`);
  console.log(`${r.titles} championships, fired ${r.fired} time(s).`);
  console.log(`Legacy ${r.score} — ${r.title}. ${r.reason}`);
} else {
  console.log(`\n${RUNS} careers, ${MAX_YEARS} seasons each:\n`);
  const avg = (f: (r: RunResult) => number) => (results.reduce((n, r) => n + f(r), 0) / results.length).toFixed(1);
  for (const r of results) {
    console.log(`  ${String(r.years).padStart(2)}y  reached ${stageAt(r.stage).short.padEnd(7)} `
      + `${String(r.titles).padStart(2)} titles  ${r.fired} sackings  legacy ${String(r.score).padStart(4)} ${r.title}`);
  }
  console.log(`\n  average rung reached: ${avg((r) => r.stage)} of 8`);
  console.log(`  average titles:       ${avg((r) => r.titles)}`);
  console.log(`  average sackings:     ${avg((r) => r.fired)}`);
  console.log(`  reached the PLL:      ${results.filter((r) => r.stage >= 8).length}/${RUNS}`);
}
