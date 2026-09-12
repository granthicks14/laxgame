/**
 * SUPER CHALLENGE, PLAYED RATHER THAN ASSERTED
 *
 * `npm run dominance` proves the window arithmetic in isolation. This plays
 * real careers in the mode and checks the things that can only go wrong once
 * it is wired to the rest of the game:
 *
 *   - it runs the SAME career engine as Challenge (ladder, coach, transfers,
 *     recruiting, difficulty) rather than a thinner copy,
 *   - falling short NEVER ends a career,
 *   - meeting the requirement completes it, once, with the right window named,
 *   - and a coach who changes jobs keeps his count.
 *
 *   npm run super
 */
import {
  advancePhase, nextUserGame, resolveChallengeSeason, runOffseason, simulateUserGame,
  startChallenge, takeChallengeJob, coachProfile,
} from '../league/career';
import { dominance } from '../challenge/dominance';
import { STAGES } from '../challenge/ladder';
import type { Career } from '../league/types';
import type { ChallengeTier } from '../challenge/difficulty';

const env = (globalThis as { process?: { env?: Record<string, string | undefined>; exit(n: number): void } }).process;
const YEARS = Number(env?.env?.YEARS ?? 26);
const problems: string[] = [];
let checks = 0;
function check(name: string, ok: boolean, detail = ''): void {
  checks++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) problems.push(name);
}

function playSeason(c: Career): void {
  let guard = 0;
  while (guard++ < 400) {
    const g = nextUserGame(c);
    if (!g) break;
    simulateUserGame(c, g);
  }
  advancePhase(c);
}

/** Plays a whole career, taking every promotion offered. */
function runCareer(tier: ChallengeTier, seed: number, years: number): {
  career: Career; completedAt: number | null; everFailed: boolean; jobs: number;
} {
  const career = startChallenge({
    difficulty: 'varsity', gameLength: 'short', seed, tier, mode: 'superchallenge',
  });
  const state = career.challenge!;
  let completedAt: number | null = null;
  let everFailed = false;
  let jobs = 1;

  while (state.totalYears < years) {
    playSeason(career);
    const verdict = resolveChallengeSeason(career);
    if (state.complete && completedAt === null) completedAt = state.totalYears;
    // A career that ends for ANY reason other than proving dominance is a
    // failure mode this mode is not supposed to have.
    if (state.complete && !dominance(state).achieved) everFailed = true;
    if (state.complete) break;
    void verdict;

    if (state.offers && state.offers.length) {
      takeChallengeJob(career, state.offers[0]);
      jobs++;
      continue;
    }
    runOffseason(career);
  }
  return { career, completedAt, everFailed, jobs };
}

/* ------------------------------------------- 1. it is the same career engine */

{
  const { career } = runCareer('standard', 77001, 6);
  const state = career.challenge!;
  check('a Super Challenge career carries a coach profile', !!career.coach);
  check('it keeps a squad', career.roster.length >= 18, `${career.roster.length} players`);
  check('it runs a recruiting class', (career.recruiting?.prospects.length ?? 0) > 0);
  check('it keeps standings', Object.keys(career.standings).length >= 4);
  check('it writes a record book', career.history.length > 0, `${career.history.length} seasons`);
  check('it sits on the ladder', state.stageIndex >= 0 && state.stageIndex < STAGES.length);
  check('the coach earns points like any other career', coachProfile(career).xp > 0);
  check('it is stamped as its own mode', career.mode === 'superchallenge');
}

/* ------------------------------------------- 2. falling short is never fatal */

{
  // A deliberately long career on the hardest tier, which is the least likely
  // to bunch three titles. Whatever happens, it must not END unhappily.
  const { career, everFailed, completedAt } = runCareer('final', 77002, 30);
  const state = career.challenge!;
  const d = dominance(state);
  check('thirty seasons short of the requirement is not a failure', !everFailed,
    state.endedReason ?? 'still coaching');
  check('and the career is still open unless dominance was proved',
    !state.complete || d.achieved,
    state.complete ? `ended: ${state.endedReason}` : 'open');
  check('the window keeps rolling with it', d.current.to === d.seasons,
    `window ${d.current.from}-${d.current.to} of ${d.seasons}`);
  void completedAt;
}

/* ------------------------------------------- 3. meeting it completes it once */

{
  let completed = 0;
  let sound = true;
  for (let i = 0; i < 6; i++) {
    const { career, completedAt } = runCareer('standard', 78000 + i * 131, YEARS);
    const state = career.challenge!;
    const d = dominance(state);
    if (state.complete) {
      completed++;
      // It must be complete BECAUSE of the window, and the window it names
      // must really hold the titles.
      if (!d.achieved) sound = false;
      if (d.achievedIn && d.achievedIn.titles < d.need) sound = false;
      if (completedAt !== null && d.achievedIn && completedAt < d.achievedIn.to) sound = false;
    }
  }
  check('the requirement is reachable on Standard', completed > 0, `${completed}/6 careers`);
  check('every completion names a window that genuinely holds three titles', sound);
}

/* ------------------------------------------- 4. changing jobs keeps the count */

{
  const { career, jobs } = runCareer('standard', 77003, 24);
  const state = career.challenge!;
  const d = dominance(state);
  const teams = new Set(state.steps.map((s) => s.teamShort));
  check('a career that moves around still counts every title',
    d.careerTitles === state.steps.filter((s) => s.champion).length,
    `${d.careerTitles} titles across ${teams.size} programmes, ${jobs} jobs`);
  check('and the window spans the whole career, not one job',
    d.current.from >= 1 && d.current.to <= d.seasons);
}

/* ------------------------------------------- 5. Challenge is left alone */

{
  const career = startChallenge({
    difficulty: 'varsity', gameLength: 'short', seed: 77004, tier: 'standard',
  });
  const state = career.challenge!;
  let guard = 0;
  while (state.totalYears < 14 && guard++ < 40) {
    playSeason(career);
    resolveChallengeSeason(career);
    if (state.complete) break;
    if (state.offers && state.offers.length) { takeChallengeJob(career, state.offers[0]); continue; }
    runOffseason(career);
  }
  const d = dominance(state);
  check('a normal Challenge career is never completed by the dominance rule',
    !state.complete || state.stageIndex >= STAGES.length - 1,
    state.endedReason ?? 'still coaching');
  check('even when it would have qualified',
    !state.complete || !d.achieved || state.stageIndex >= STAGES.length - 1,
    `best window ${d.best.titles}`);
}

console.log();
if (problems.length) {
  console.log(`${problems.length} of ${checks} checks FAILED:`);
  for (const p of problems) console.log(`  - ${p}`);
  env?.exit(1);
} else {
  console.log(`${checks}/${checks} checks passed`);
}
