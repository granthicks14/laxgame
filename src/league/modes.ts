/* ---------------------------------------------------------------------------
 * WHAT KIND OF SAVE THIS IS
 * ---------------------------------------------------------------------------
 * There are three modes, but only two QUESTIONS worth asking about one:
 *
 *   Is this a long-term career?   Dynasty and Challenge both are. They keep a
 *                                 squad across years, develop it, recruit into
 *                                 it, move players in and out of it, and carry
 *                                 a record book. Season does not: it is one
 *                                 campaign and then it is over.
 *
 *   Does the coach's JOB move?    Only Challenge. That is the single thing
 *                                 Challenge adds on top of the career engine.
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
export const CAREER_MODES: CareerMode[] = ['dynasty', 'challenge'];

export const ALL_MODES: CareerMode[] = ['season', 'dynasty', 'challenge'];

/**
 * True for any save that runs across seasons. Use this wherever a system is
 * about building a programme over time rather than about one campaign.
 */
export function isCareerMode(mode: CareerMode): boolean {
  return mode === 'dynasty' || mode === 'challenge';
}

/** True when the coach's job itself can change: Challenge, and only Challenge. */
export function isClimbMode(mode: CareerMode): boolean {
  return mode === 'challenge';
}

export const MODE_LABEL: Record<CareerMode, string> = {
  season: 'Season',
  dynasty: 'Dynasty',
  challenge: 'Challenge',
};

export const MODE_SUBTITLE: Record<CareerMode, string> = {
  season: 'One season',
  dynasty: 'Multi-season',
  challenge: 'Coaching career',
};
