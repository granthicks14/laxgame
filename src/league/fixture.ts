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
import { clamp } from '../core/math';
import { GAME_LENGTHS } from '../data/constants';
import { getTeam, tryGetTeam, type TeamData } from '../data/teams';
import { tryWorldTeam } from '../data/world';
import { weatherFor } from '../render/weather';
import { coachEffects, withPerks } from './coaching';
import { coachPerks } from '../challenge/coach';
import { tacticsFor } from './matchSetup';
import { simulateMatch, type SimResult } from './simulate';
import { gameStory, type GameStory } from './gameStory';
import type { Career, ScheduledGame } from './types';

/** A team as this career has it: world data plus whatever drift it has picked up. */
export function fixtureTeam(career: Career, teamId: string): TeamData {
  const base = (tryWorldTeam(teamId) ?? tryGetTeam(teamId) ?? getTeam(teamId)) as unknown as TeamData;
  const over = career.ratingOverrides[teamId];
  return over ? { ...base, ...over } : base;
}

/**
 * Every other programme has a coaching staff too.
 *
 * Leaving this at zero was a real balance bug: the coach's own office fed the
 * model while nobody else's did, so a well-run programme won far more than it
 * should have and a Challenge career climbed the ladder in fifteen seasons. A
 * coach's investment should be an edge only insofar as it beats the opposition's.
 */
function aiCoaching(teamId: string): number {
  const wt = tryWorldTeam(teamId);
  if (!wt) return 0.45;
  // The world's `coaching` rating runs roughly 20-90; a typical programme sits
  // near the middle of the staff scale.
  return clamp((wt.coaching - 30) / 70, 0.15, 0.9);
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
  // The coach's office AND everything he has earned across his career.
  const fx = withPerks(coachEffects(career.staff), coachPerks(career.coach));
  const mine = fx.offenseIQ * 0.5 + fx.defenseIQ * 0.5;

  return simulateMatch(home, away, `${career.seed}:${career.year}:${g.id}`, {
    level: career.level,
    lengthScale: lengthScale(career),
    homeAdvantage: true,
    weather: { rain: w.rain, wind: w.wind, label: w.label },
    rivalry: g.rivalry,
    playoff: !!g.playoff,
    homeTactics: g.homeId === career.teamId ? career.tactics : tacticsFor(home),
    awayTactics: g.awayId === career.teamId ? career.tactics : tacticsFor(away),
    homeCoaching: g.homeId === career.teamId ? mine : aiCoaching(g.homeId),
    awayCoaching: g.awayId === career.teamId ? mine : aiCoaching(g.awayId),
  });
}

/**
 * The story of a fixture the coach's team has already played.
 *
 * Returns null when the recorded score did not come out of the simulation —
 * a game the coach played by hand has its own scoreline, and a story must
 * describe the game that is on the record rather than a different one the
 * model would have produced.
 */
export function fixtureStory(career: Career, g: ScheduledGame): GameStory | null {
  if (!g.played) return null;
  const home = g.homeId === career.teamId;
  if (!home && g.awayId !== career.teamId) return null;
  const r = simulateFixture(career, g);
  if (r.homeScore !== g.homeScore || r.awayScore !== g.awayScore) return null;
  const you = fixtureTeam(career, career.teamId);
  const them = fixtureTeam(career, home ? g.awayId : g.homeId);
  return gameStory(r, {
    side: home ? 'home' : 'away',
    yourName: you.short || you.name,
    theirName: them.short || them.name,
    yourRating: you.overall,
    theirRating: them.overall,
  });
}
