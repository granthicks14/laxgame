import { POSITIONS, type HoopsPlayer, type HoopsPosition } from '../data';
import { LEVELS, graduates, type HoopsLevel } from '../levels';

/* ---------------------------------------------------------------------------
 * WHAT THE SQUAD IS SHORT OF
 * ---------------------------------------------------------------------------
 * Two different questions that a recruiting screen has to answer separately,
 * because they have different answers and confusing them is how a coach ends up
 * with fourteen guards:
 *
 *   NEED           how badly this position needs somebody who can PLAY. A team
 *                  with three point guards who are all terrible has a high need
 *                  and no room.
 *   AVAILABLE      how many places are actually open once the seniors have gone
 *                  and the players already committed have arrived. A team with
 *                  one point guard and one place has room and, if he is good, no
 *                  need at all.
 *
 * Having no need does NOT stop a coach recruiting a position. If there are
 * places and he wants four wings, he may have four wings — the system reports
 * the truth and lets him decide. What it will not do is let him sign a
 * fifteenth player onto a fourteen-man roster.
 * ------------------------------------------------------------------------- */

export type NeedLevel = 0 | 1 | 2 | 3 | 4;

export const NEED_LABEL: Record<NeedLevel, string> = {
  0: 'Set',
  1: 'Depth only',
  2: 'Moderate need',
  3: 'High need',
  4: 'Urgent need',
};

export interface PositionNeed {
  pos: HoopsPosition;
  /** On the roster today. */
  have: number;
  /** Of those, how many will not be back next season. */
  leaving: number;
  returning: number;
  /** Already committed to arrive — recruits and transfers alike. */
  incoming: number;
  /** Where the position lands once the class is in. */
  projected: number;
  /** What the level's squad shape asks for here. */
  slots: number;
  /** Places still to fill at this position. */
  open: number;
  /** Average overall of the men there now. */
  avgOverall: number;
  /** The projected starter's overall — the bar a recruit has to clear to play. */
  starterLine: number;
  /** How far that starter sits below the standard of the level. */
  shortfall: number;
  need: NeedLevel;
  needLabel: string;
}

export interface RosterNeeds {
  level: HoopsLevel;
  byPos: Record<HoopsPosition, PositionNeed>;
  list: PositionNeed[];
  /** Places open across the whole squad. This is the hard limit on signing. */
  openSpots: number;
  size: number;
  projectedSize: number;
  cap: number;
  incoming: number;
}

/** Will this player still be here next season? Mirrors the offseason rule. */
export function isLeaving(p: HoopsPlayer, level: HoopsLevel): boolean {
  if (!graduates(level)) {
    // A professional might move on; that is a decision in the offseason and not
    // something to present to a coach as a fact. A projection counts him staying.
    return false;
  }
  return p.years >= LEVELS[level].eligibility;
}

const avg = (xs: number[]): number =>
  (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : 0);

export interface Incoming {
  pos: HoopsPosition;
  overall: number;
}

/**
 * The whole picture, recomputed from the squad. Cheap enough to call from a
 * render: one pass over a roster of fourteen.
 */
export function computeNeeds(
  roster: HoopsPlayer[], level: HoopsLevel, incoming: Incoming[] = [], par = 0,
): RosterNeeds {
  const info = LEVELS[level];
  const shape = info.shape;
  const standard = par || info.par + 6;
  const byPos = {} as Record<HoopsPosition, PositionNeed>;

  for (const pos of POSITIONS) {
    const at = roster.filter((p) => p.pos === pos);
    const leaving = at.filter((p) => isLeaving(p, level));
    const returning = at.filter((p) => !isLeaving(p, level));
    const arriving = incoming.filter((i) => i.pos === pos);
    const projectedList = [
      ...returning.map((p) => p.overall),
      ...arriving.map((i) => i.overall),
    ].sort((a, b) => b - a);
    const slots = shape[pos];
    const projected = projectedList.length;
    const open = Math.max(0, slots - projected);

    // The bar a new arrival has to clear to play: the man who would start here
    // next season. Zero when the position would be empty, which is the most
    // urgent thing a roster can say.
    const starterLine = projectedList[0] ?? 0;
    const shortfall = starterLine === 0 ? 99 : Math.max(0, standard - starterLine);

    // NEED is about the standard of the position, not the number of bodies.
    let need: NeedLevel;
    if (projected === 0) need = 4;
    else if (shortfall >= 12) need = 4;
    else if (shortfall >= 7) need = 3;
    else if (shortfall >= 3) need = 2;
    else if (open > 0) need = 1;
    else need = 0;

    byPos[pos] = {
      pos,
      have: at.length,
      leaving: leaving.length,
      returning: returning.length,
      incoming: arriving.length,
      projected,
      slots,
      open,
      avgOverall: avg(at.map((p) => p.overall)),
      starterLine,
      shortfall: starterLine === 0 ? 0 : shortfall,
      need,
      needLabel: NEED_LABEL[need],
    };
  }

  const list = POSITIONS.map((p) => byPos[p]);
  const projectedSize = roster.filter((p) => !isLeaving(p, level)).length + incoming.length;
  return {
    level,
    byPos,
    list,
    // The squad-wide limit. A coach may recruit over a positional need; he may
    // not recruit over the roster.
    openSpots: Math.max(0, info.rosterSize - projectedSize),
    size: roster.length,
    projectedSize,
    cap: info.rosterSize,
    incoming: incoming.length,
  };
}

/** A one-line summary of a position's situation, for the recruiting board. */
export function needSummary(n: PositionNeed): string {
  if (n.projected === 0) return 'Nobody here at all next season';
  if (n.need === 0) return `Set: ${n.projected} back, starter at ${n.starterLine}`;
  if (n.need === 1) return `${n.open} place${n.open === 1 ? '' : 's'} for depth`;
  return `Starter at ${n.starterLine}, ${n.shortfall} below the standard here`;
}

/* --------------------------------------------------------- playing time */

export interface Opportunity {
  /** 0..1 — how likely this player is to start here. */
  starting: number;
  /** What to tell the player, in his words. */
  text: string;
  /** How much this pitch is worth to him, -1..1. */
  appeal: number;
}

/**
 * What a player would actually get if he came.
 *
 * This is the single most important thing a recruit wants to know, and the one
 * a programme is most tempted to lie about. He compares what he is told against
 * the roster he can see, so the answer has to be the truth: a five-star being
 * promised minutes behind two returning starters is not fooled.
 */
export function playingTimeOutlook(
  need: PositionNeed, overall: number, potential: number,
): Opportunity {
  const line = need.starterLine;
  if (need.projected === 0) {
    return { starting: 1, text: 'The job is yours from day one', appeal: 1 };
  }
  const gap = overall - line;
  if (gap >= 4) {
    return { starting: 0.95, text: 'You start, and the position is yours', appeal: 0.9 };
  }
  if (gap >= -1) {
    return { starting: 0.7, text: 'You compete for the starting job immediately', appeal: 0.6 };
  }
  if (gap >= -6) {
    return {
      starting: 0.35,
      text: potential - overall >= 8
        ? 'Minutes off the bench, and the job when you are ready'
        : 'Real minutes off the bench',
      appeal: 0.2,
    };
  }
  if (need.open > 0) {
    return { starting: 0.12, text: 'A place on the roster and a year to develop', appeal: -0.2 };
  }
  return { starting: 0.05, text: 'You would be behind everybody here', appeal: -0.6 };
}
