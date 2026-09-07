/* ---------------------------------------------------------------------------
 * ROSTERS
 * ---------------------------------------------------------------------------
 * Two kinds of roster exist in this game and they are never mixed up:
 *
 *   'official'  — names, numbers, positions and grades imported from a public
 *                 source (a THSLL team page). Only the identifying details are
 *                 real. Ratings are ALWAYS generated: no public source
 *                 publishes player ratings, and inventing them and calling them
 *                 official would be a lie.
 *
 *   'generated' — the whole player is fictional. This is the fallback and it is
 *                 what every team ships with today.
 *
 * NOTHING IS IMPORTED YET. `OFFICIAL_ROSTERS` is deliberately empty: the build
 * environment for this project cannot reach thsll.org, so no roster has been
 * verified. Adding one is a data-only change — drop an entry in below and that
 * team switches to 'official' automatically, with no gameplay code touched.
 *
 * See docs/EDITING-DATA.md for the import checklist.
 * ------------------------------------------------------------------------- */

import type { Position } from './constants';

export type RosterSource = 'official' | 'generated';

/** A player as published by a public roster. Every field except the name is
 *  optional, because public rosters are inconsistent about what they list. */
export interface OfficialPlayer {
  name: string;
  number?: number;
  position?: Position;
  /** 9-12. Omit when the source does not say. */
  grade?: 9 | 10 | 11 | 12;
}

export interface OfficialRoster {
  teamId: string;
  /** Where it came from, e.g. "thsll.org/team?id=4". */
  source: string;
  /** ISO date the data was read, so staleness is visible. */
  retrieved: string;
  season: number;
  players: OfficialPlayer[];
}

/**
 * Imported public rosters, keyed by team id.
 *
 * Example of the expected shape:
 *
 *   'highland-park': {
 *     teamId: 'highland-park',
 *     source: 'https://thsll.org/team?id=4',
 *     retrieved: '2026-09-07',
 *     season: 2026,
 *     players: [
 *       { name: 'A. Player', number: 7, position: 'A', grade: 12 },
 *     ],
 *   },
 */
export const OFFICIAL_ROSTERS: Record<string, OfficialRoster> = {};

/**
 * The season this build plays. League sites publish next season's team pages
 * well before the season starts, so an import is only used when it is the 2026
 * roster — a 2027 page dropped in by mistake is ignored rather than silently
 * becoming the squad. `rosterImportProblems()` reports anything skipped.
 */
export const TARGET_SEASON = 2026;

export function officialRoster(teamId: string): OfficialRoster | null {
  const r = OFFICIAL_ROSTERS[teamId];
  if (!r || r.season !== TARGET_SEASON || r.players.length === 0) return null;
  return r;
}

export function rosterSourceFor(teamId: string): RosterSource {
  return officialRoster(teamId) ? 'official' : 'generated';
}

/** Imports that exist but are not being used, with the reason why. */
export function rosterImportProblems(): string[] {
  const out: string[] = [];
  for (const [id, r] of Object.entries(OFFICIAL_ROSTERS)) {
    if (r.teamId !== id) out.push(`${id}: entry declares teamId "${r.teamId}"`);
    if (r.season !== TARGET_SEASON) out.push(`${id}: season ${r.season} roster ignored (this build plays ${TARGET_SEASON})`);
    if (r.players.length === 0) out.push(`${id}: import has no players`);
  }
  return out;
}

/** How many teams currently ship real roster data. Shown in the Teams screen. */
export function officialRosterCount(): number {
  return Object.keys(OFFICIAL_ROSTERS).filter((id) => officialRoster(id) !== null).length;
}
