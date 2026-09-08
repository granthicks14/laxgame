/* ---------------------------------------------------------------------------
 * SIMULATING ONE FIXTURE OF A CAREER
 * ---------------------------------------------------------------------------
 * The bridge between a career and the scoring engine. It is its own file with
 * no dependency on career.ts so that BOTH the career (which needs the result)
 * and the statistics (which need the box score) can call it without importing
 * each other.
 *
 * It is completely deterministic: the same fixture in the same season always
 * produces the same game, down to the ground balls. That is what lets the
 * statistics screen rebuild a box score after a reload instead of storing one,
 * and it is why a scoreline can never disagree with the numbers behind it.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import { GAME_LENGTHS } from '../data/constants';
import { getTeam, tryGetTeam, type TeamData } from '../data/teams';
import { tryWorldTeam } from '../data/world';
import { weatherFor } from '../render/weather';
import { coachEffects } from './coaching';
import { tacticsFor } from './matchSetup';
import { simulateMatch, type SimResult } from './simulate';
import type { Career, ScheduledGame } from './types';

/** A team as this career has it: world data plus whatever drift it has picked up. */
export function fixtureTeam(career: Career, teamId: string): TeamData {
  const base = (tryWorldTeam(teamId) ?? tryGetTeam(teamId) ?? getTeam(teamId)) as unknown as TeamData;
  const over = career.ratingOverrides[teamId];
  return over ? { ...base, ...over } : base;
}

/** Quarter length relative to Short, which is how the rest of the game measures it. */
export function lengthScale(career: Career): number {
  return GAME_LENGTHS[career.gameLength].quarterSeconds / GAME_LENGTHS.short.quarterSeconds;
}

/**
 * Plays out one fixture with everything the model can actually use: the level,
 * the conditions at the home ground, both sides' tactics, and — when the coach
 * is involved — his own staff.
 */
export function simulateFixture(career: Career, g: ScheduledGame): SimResult {
  const home = fixtureTeam(career, g.homeId);
  const away = fixtureTeam(career, g.awayId);
  const w = weatherFor(
    Rng.hash(`${career.seed}:${career.year}:${g.id}`),
    home.homeField?.time ?? 'day',
    tryWorldTeam(g.homeId)?.region ?? 'texas',
  );
  const fx = coachEffects(career.staff);
  const coaching = fx.offenseIQ * 0.5 + fx.defenseIQ * 0.5;
  const userIsHome = g.homeId === career.teamId;
  const userInvolved = g.homeId === career.teamId || g.awayId === career.teamId;

  return simulateMatch(home, away, `${career.seed}:${career.year}:${g.id}`, {
    level: career.level,
    lengthScale: lengthScale(career),
    homeAdvantage: true,
    weather: { rain: w.rain, wind: w.wind, label: w.label },
    rivalry: g.rivalry,
    playoff: !!g.playoff,
    homeTactics: userInvolved && userIsHome ? career.tactics : tacticsFor(home),
    awayTactics: userInvolved && !userIsHome ? career.tactics : tacticsFor(away),
    homeCoaching: userInvolved && userIsHome ? coaching : 0,
    awayCoaching: userInvolved && !userIsHome ? coaching : 0,
  });
}
