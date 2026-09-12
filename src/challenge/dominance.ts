/* ---------------------------------------------------------------------------
 * PROVING DOMINANCE
 * ---------------------------------------------------------------------------
 * Super Challenge asks one question: can you win THREE CHAMPIONSHIPS INSIDE ANY
 * TEN CONSECUTIVE SEASONS?
 *
 * Two things about that rule are easy to get wrong, and both are the whole
 * point of the mode:
 *
 *   IT IS A ROLLING WINDOW, NOT A DEADLINE. Seasons 1-10 are not special.
 *   Seasons 4-13 count. Seasons 31-40 count. A coach who wins two titles early
 *   and a third in his fourteenth season has proved nothing — but the same
 *   coach winning in seasons 6, 9 and 13 has proved it, because 4-13 holds
 *   three.
 *
 *   THERE IS NO FAILURE. A window closing short is not a loss; the window
 *   simply moves on and the career carries on with everything intact. Nothing
 *   in this file can end a career.
 *
 * All of it is DERIVED from `state.steps`, which already records the season
 * number and whether it ended in a championship. Nothing is stored, so the
 * tracker can never drift out of step with the record book, there is nothing
 * to migrate, and changing jobs — which changes everything else about a career
 * — cannot disturb it, because a championship counts wherever it was won.
 * ------------------------------------------------------------------------- */

import type { ChallengeState } from './state';

/** Championships required inside the window. */
export const DOMINANCE_TITLES = 3;
/** How many consecutive seasons the window spans. */
export const DOMINANCE_SPAN = 10;

export interface DominanceWindow {
  /** First season in the window, 1-based. */
  from: number;
  /** Last season in the window. */
  to: number;
  /** Championships won inside it. */
  titles: number;
}

export interface Dominance {
  need: number;
  span: number;
  /** Seasons coached, including any spent out of work. */
  seasons: number;
  /** The last `span` seasons — the stretch the coach is judged on right now. */
  current: DominanceWindow;
  /** The best any window has ever been. */
  best: DominanceWindow;
  /** Every championship season, oldest first. */
  titleYears: number[];
  careerTitles: number;
  /** True the moment any window holds `need` titles. */
  achieved: boolean;
  /** The window that did it. Null until it happens. */
  achievedIn: DominanceWindow | null;
  /**
   * Seasons until the OLDEST championship in the current window rolls out of
   * it — the real clock a coach is playing against. Null when the window holds
   * no titles, or when the requirement is already met.
   */
  expiresIn: number | null;
  /** How many more titles are needed inside the current window. */
  short: number;
}

/** Championships won in [from, to], inclusive. */
function titlesIn(years: number[], from: number, to: number): number {
  let n = 0;
  for (const y of years) if (y >= from && y <= to) n++;
  return n;
}

/**
 * Reads the dominance requirement off a career.
 *
 * The search is exhaustive rather than clever: every window that ends on a
 * season actually played is checked. A career is at most a few dozen seasons,
 * so this is a handful of comparisons, and being exhaustive means there is no
 * qualifying stretch it can miss.
 */
export function dominance(
  state: ChallengeState, need = DOMINANCE_TITLES, span = DOMINANCE_SPAN,
): Dominance {
  const titleYears = state.steps.filter((s) => s.champion).map((s) => s.year).sort((a, b) => a - b);
  const seasons = Math.max(state.totalYears, ...titleYears, 0);

  const windowEndingAt = (to: number): DominanceWindow => {
    const from = Math.max(1, to - span + 1);
    return { from, to, titles: titlesIn(titleYears, from, to) };
  };

  /**
   * The stretch to SHOW. Before ten seasons have been played the honest window
   * is the first ten — a coach in his second season is playing into seasons
   * 1-10, and telling him his window is "seasons 2-2" is true but useless.
   * After that it is the last ten, which is what he is judged on.
   */
  const displayWindow = (): DominanceWindow => {
    if (seasons <= span) return { from: 1, to: span, titles: titlesIn(titleYears, 1, span) };
    return windowEndingAt(seasons);
  };

  // The best stretch anywhere in the career, and the first one to qualify.
  let best: DominanceWindow = { from: 1, to: Math.min(span, Math.max(1, seasons)), titles: 0 };
  let achievedIn: DominanceWindow | null = null;
  for (let to = 1; to <= seasons; to++) {
    const w = windowEndingAt(to);
    if (w.titles > best.titles) best = w;
    if (!achievedIn && w.titles >= need) achievedIn = w;
  }

  const current = displayWindow();
  const inWindow = titleYears.filter((y) => y >= current.from && y <= current.to);
  const oldest = inWindow[0];
  const achieved = achievedIn !== null;

  return {
    need,
    span,
    seasons,
    current,
    best,
    titleYears,
    careerTitles: titleYears.length,
    achieved,
    achievedIn,
    expiresIn: !achieved && oldest !== undefined ? Math.max(0, oldest + span - 1 - seasons) + 1 : null,
    short: Math.max(0, need - current.titles),
  };
}

/** One line for a card or a toast, always true of the career it describes. */
export function dominanceLine(d: Dominance): string {
  if (d.achieved) {
    return `Three championships in seasons ${d.achievedIn!.from}-${d.achievedIn!.to}. Dominance proved.`;
  }
  if (d.current.titles === 0) {
    return d.seasons <= d.span
      ? `No championships yet. This window runs to season ${d.current.to}.`
      : `No championships in the last ${d.span} seasons. The window is open.`;
  }
  if (d.expiresIn !== null && d.expiresIn <= 2) {
    return `${d.current.titles} of ${d.need} in this window, and your oldest title leaves it `
      + `${d.expiresIn === 1 ? 'after this season' : `in ${d.expiresIn} seasons`}.`;
  }
  return `${d.current.titles} of ${d.need} championships inside the current ten seasons.`;
}
