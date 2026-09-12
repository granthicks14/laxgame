/* ---------------------------------------------------------------------------
 * WHAT KIND OF SAVE THIS IS
 * ---------------------------------------------------------------------------
 * There are four modes, but only two QUESTIONS worth asking about one:
 *
 *   Is this a long-term career?   Dynasty and Challenge both are. They keep a
 *                                 squad across years, develop it, recruit into
 *                                 it, move players in and out of it, and carry
 *                                 a record book. Season does not: it is one
 *                                 campaign and then it is over.
 *
 *   Does the coach's JOB move?    Challenge and Super Challenge. That is the
 *                                 single thing they add on top of the career
 *                                 engine — and they add exactly the same one,
 *                                 which is why they share `isClimbMode`.
 *
 * Everything else — the offseason, transfers, recruiting, scouting, staff,
 * development, statistics, news — belongs to the career engine and must be
 * asked for with `isCareerMode`, never with `mode === 'dynasty'`.
 *
 * That check was the bug this file exists to prevent: the offseason screen
 * hard-coded 'dynasty' when it opened the transfer window, so a Challenge coach
 * clicking it was handed a different save's data — or, if he had never played
 * Dynasty, an empty screen telling him he had no career.
 * ------------------------------------------------------------------------- */

import type { CareerMode } from './types';

/** Modes that keep a programme across seasons. */
export const CAREER_MODES: CareerMode[] = ['dynasty', 'challenge', 'superchallenge'];

export const ALL_MODES: CareerMode[] = ['season', 'dynasty', 'challenge', 'superchallenge'];

/**
 * True for any save that runs across seasons. Use this wherever a system is
 * about building a programme over time rather than about one campaign.
 */
export function isCareerMode(mode: CareerMode): boolean {
  return mode === 'dynasty' || isClimbMode(mode);
}

/**
 * True when the coach's job itself can change — the ladder, the job market,
 * the coach profile, the difficulty tiers.
 *
 * BOTH Challenge and Super Challenge. Super Challenge is not a second career
 * engine: it is the same climb, the same ladder, the same difficulty table and
 * the same coach, with a different thing to prove. Anything that asks "does
 * this save run a coaching career?" must ask it here, or Super Challenge will
 * quietly lose a feature that Challenge has.
 */
export function isClimbMode(mode: CareerMode): boolean {
  return mode === 'challenge' || mode === 'superchallenge';
}

/** True only for the mode whose objective is the dominance requirement. */
export function isSuperChallenge(mode: CareerMode): boolean {
  return mode === 'superchallenge';
}

export const MODE_LABEL: Record<CareerMode, string> = {
  season: 'Season',
  dynasty: 'Dynasty',
  challenge: 'Challenge',
  superchallenge: 'Super Challenge',
};

export const MODE_SUBTITLE: Record<CareerMode, string> = {
  season: 'One season',
  dynasty: 'Multi-season',
  challenge: 'Coaching career',
  superchallenge: 'Prove dominance',
};
