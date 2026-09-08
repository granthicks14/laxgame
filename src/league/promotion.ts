/* ---------------------------------------------------------------------------
 * PROMOTION AND RELEGATION
 * ---------------------------------------------------------------------------
 * A dynasty used to be a trap: take a weak programme in Class A and you lose
 * for a decade with no way out. The district now moves teams between classes on
 * fixed, stated rules, so a struggling programme drops into a division it can
 * compete in, rebuilds, and climbs back.
 *
 * THE LADDER
 *   Class A   top flight
 *   Class B
 *   Class C   two regional divisions, East and West, at the same level
 *   Class D   entry level
 *
 * THE RULES (the same for every team, including yours)
 *   - Promotions and relegations are matched: for every team that goes up, one
 *     comes down, so a division is the same size next season as it was this
 *     one. Class A and Class B swap two teams; each half of Class C swaps one
 *     with Class B and one with Class D.
 *   - Going up means winning your division, or finishing behind the team that
 *     did when two places are on offer.
 *   - Going down means finishing at the bottom of yours.
 *   - Nobody moves more than one step in a season.
 *
 * A team moving into Class C joins whichever regional division is smaller, so
 * the two halves stay balanced.
 * ------------------------------------------------------------------------- */

import type { ClassKey } from '../data/teams';

export const MIN_DIVISION = 6;
export const MAX_DIVISION = 12;
export const RELEGATION_SPOTS = 2;

/** The class directly above, or null at the top. */
export function classAbove(key: ClassKey): ClassKey | null {
  switch (key) {
    case 'a': return null;
    case 'b': return 'a';
    case 'c-east': return 'b';
    case 'c-west': return 'b';
    case 'd': return 'c-east'; // resolved to the smaller C division at move time
  }
}

/** The class directly below, or null at the bottom. */
export function classBelow(key: ClassKey): ClassKey | null {
  switch (key) {
    case 'a': return 'b';
    case 'b': return 'c-east'; // resolved to the smaller C division at move time
    case 'c-east': return 'd';
    case 'c-west': return 'd';
    case 'd': return null;
  }
}

export const LADDER_LABEL: Record<ClassKey, string> = {
  a: 'Class A',
  b: 'Class B',
  'c-east': 'Class C East',
  'c-west': 'Class C West',
  d: 'Class D',
};

/** Where a team dropping out of Class B, or climbing out of D, should land. */
export function pickCDivision(sizeEast: number, sizeWest: number): ClassKey {
  if (sizeEast === sizeWest) return 'c-east';
  return sizeEast < sizeWest ? 'c-east' : 'c-west';
}

export interface Movement {
  teamId: string;
  from: ClassKey;
  to: ClassKey;
  direction: 'up' | 'down';
  /** Plain-English reason, shown to the player. */
  reason: string;
}

export interface MovementReport {
  season: number;
  moves: Movement[];
  /** Moves that the size rules blocked, with why. */
  blocked: string[];
}

export interface DivisionResult {
  key: ClassKey;
  /** Team ids in final order, best first. */
  order: string[];
  /** The division champion, if the playoffs were decided. */
  champion: string | null;
}

/**
 * Fixed exchange between divisions. Every promotion is matched by a relegation
 * in the same direction, so a division is exactly the size next season that it
 * was this season — the old "promote the champion, relegate the bottom two"
 * version quietly drained Class A and inflated Class D year on year.
 */
const FLOWS: { up: ClassKey; down: ClassKey; count: number }[] = [
  { up: 'b', down: 'a', count: 2 },
  { up: 'c-east', down: 'b', count: 1 },
  { up: 'c-west', down: 'b', count: 1 },
  { up: 'd', down: 'c-east', count: 1 },
  { up: 'd', down: 'c-west', count: 1 },
];

/**
 * Works out every move for one season. Pure: it takes final tables and returns
 * what should happen, so the same function drives both the league and the
 * screen that explains it.
 */
export function planMovement(results: DivisionResult[], season: number): MovementReport {
  const byKey = new Map<ClassKey, DivisionResult>();
  for (const r of results) byKey.set(r.key, r);

  const moves: Movement[] = [];
  const blocked: string[] = [];
  const moved = new Set<string>();

  const add = (teamId: string, from: ClassKey, to: ClassKey, direction: 'up' | 'down', reason: string) => {
    if (moved.has(teamId)) return false;
    moved.add(teamId);
    moves.push({ teamId, from, to, direction, reason });
    return true;
  };

  for (const flow of FLOWS) {
    const up = byKey.get(flow.up);
    const down = byKey.get(flow.down);
    if (!up || !down) continue;

    // Promotions: the best of the division below, champion first.
    const promoting: string[] = [];
    const champ = up.champion ?? up.order[0];
    const ranked = [champ, ...up.order.filter((id) => id !== champ)];
    for (const id of ranked) {
      if (promoting.length >= flow.count) break;
      if (moved.has(id)) continue;
      promoting.push(id);
    }

    // Relegations: the same number, from the bottom of the division above.
    const relegating: string[] = [];
    for (let i = down.order.length - 1; i >= 0 && relegating.length < promoting.length; i--) {
      const id = down.order[i];
      if (moved.has(id)) continue;
      relegating.push(id);
    }

    // Only swap in matched pairs, so neither division changes size.
    const pairs = Math.min(promoting.length, relegating.length);
    if (pairs < flow.count) {
      blocked.push(`${LADDER_LABEL[flow.up]} and ${LADDER_LABEL[flow.down]} could not fill every place this year.`);
    }
    for (let i = 0; i < pairs; i++) {
      const promotedId = promoting[i];
      const place = up.order.indexOf(promotedId) + 1;
      add(promotedId, flow.up, flow.down, 'up',
        promotedId === champ && up.champion
          ? `Won the ${LADDER_LABEL[flow.up]} title`
          : `Finished ${ordinal(place)} in ${LADDER_LABEL[flow.up]}`);

      const relegatedId = relegating[i];
      const dropPlace = down.order.indexOf(relegatedId) + 1;
      add(relegatedId, flow.down, flow.up, 'down',
        `Finished ${ordinal(dropPlace)} of ${down.order.length} in ${LADDER_LABEL[flow.down]}`);
    }
  }

  return { season, moves, blocked: [...new Set(blocked)] };
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** What a team needs to do next season, given where it finished. */
export function movementOutlook(place: number, teams: number, key: ClassKey): string {
  const up = classAbove(key);
  const down = classBelow(key);
  if (place <= 2 && up) return `Another top-two finish moves you up to ${LADDER_LABEL[up]}.`;
  if (place > teams - RELEGATION_SPOTS && down) return `Finish in the bottom ${RELEGATION_SPOTS} again and you drop to ${LADDER_LABEL[down]}.`;
  if (up) return `Win ${LADDER_LABEL[key]} and you are promoted to ${LADDER_LABEL[up]}.`;
  return `Stay out of the bottom ${RELEGATION_SPOTS} and you hold your place in the top flight.`;
}
