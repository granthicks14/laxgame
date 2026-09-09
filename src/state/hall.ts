/* ---------------------------------------------------------------------------
 * THE HALL OF CAREERS
 * ---------------------------------------------------------------------------
 * A Challenge career ends and the save is gone. Without a record of it, the
 * four difficulties are just four ways to have the same evening — there is
 * nothing to come back for and no way to know whether the second attempt was
 * better than the first.
 *
 * This keeps ONE line per difficulty, outside any career save: the best legacy
 * scored on it, and the fastest climb to the PLL. That is enough to make a tier
 * a thing you beat rather than a thing you set, and it is what turns Elite into
 * a reason to play again rather than a harder version of the same run.
 *
 * Everything here is derived from careers that actually happened. Nothing is
 * seeded, invented or awarded — an empty hall is an honest hall.
 * ------------------------------------------------------------------------- */

import { load, save } from '../core/storage';
import type { ChallengeTier } from '../challenge/difficulty';

const KEY = 'lsl.hall.v1';

export interface HallEntry {
  /** Best legacy score reached on this tier. */
  bestLegacy: number;
  /** The title that went with it. */
  bestTitle: string;
  /** Seasons taken by the fastest career that WON the PLL. Null if none has. */
  fastestFinish: number | null;
  /** Highest rung reached, 0-8, for a tier nobody has finished yet. */
  bestRung: number;
  /** How many careers have been recorded on this tier. */
  careers: number;
  /** Championships won in the single best career. */
  bestTitles: number;
}

export type Hall = Partial<Record<ChallengeTier, HallEntry>>;

export function loadHall(): Hall {
  const raw = load<Hall>(KEY, {});
  return raw && typeof raw === 'object' ? raw : {};
}

export interface CareerOutcome {
  tier: ChallengeTier;
  legacy: number;
  title: string;
  /** True only when the PLL was actually won. */
  finished: boolean;
  seasons: number;
  rung: number;
  titles: number;
}

/**
 * Files a finished career. Returns what it beat, so the ending screen can say
 * "a personal best" rather than making the player compare two numbers himself.
 */
export interface HallResult {
  entry: HallEntry;
  bestLegacyEver: boolean;
  fastestEver: boolean;
  furthestEver: boolean;
  /** What the record was before this career, or null on a first attempt. */
  previous: HallEntry | null;
}

export function recordCareer(outcome: CareerOutcome): HallResult {
  const hall = loadHall();
  const previous = hall[outcome.tier] ?? null;
  const entry: HallEntry = previous
    ? { ...previous }
    : {
      bestLegacy: 0, bestTitle: '', fastestFinish: null, bestRung: 0, careers: 0, bestTitles: 0,
    };

  const bestLegacyEver = outcome.legacy > entry.bestLegacy;
  const fastestEver = outcome.finished
    && (entry.fastestFinish === null || outcome.seasons < entry.fastestFinish);
  const furthestEver = outcome.rung > entry.bestRung;

  if (bestLegacyEver) {
    entry.bestLegacy = outcome.legacy;
    entry.bestTitle = outcome.title;
  }
  if (fastestEver) entry.fastestFinish = outcome.seasons;
  if (furthestEver) entry.bestRung = outcome.rung;
  entry.bestTitles = Math.max(entry.bestTitles, outcome.titles);
  entry.careers++;

  hall[outcome.tier] = entry;
  save(KEY, hall);
  return { entry, bestLegacyEver, fastestEver, furthestEver, previous };
}
