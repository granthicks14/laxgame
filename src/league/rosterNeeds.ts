/* ---------------------------------------------------------------------------
 * ROSTER NEEDS
 * ---------------------------------------------------------------------------
 * What a squad is actually short of, worked out from the squad itself.
 *
 * Recruiting used to ask one question — "how many bodies do we have at his
 * position?" — and answer it from the CURRENT roster. That produced the thing
 * this module exists to stop: three goalies committing to a programme that
 * needed one, because none of the three knew about the other two, and a
 * programme with a 95-90-88 attack line still looking like a good place for a
 * fourth attacker.
 *
 * Everything here is derived. Nothing is stored on the save, so there is no
 * counter to drift and no migration to write: the needs are recomputed from the
 * roster, the recruiting class and the transfer market every time they are
 * asked for, which is also what makes them update the moment a player commits.
 *
 * One module answers it for every consumer — the offseason screen, the
 * recruiting board, the transfer market and the interest models — so what a
 * coach is shown and what a recruit is weighing are the same numbers.
 * ------------------------------------------------------------------------- */

import { LEVELS, type Level } from '../data/levels';
import { POSITION_LABEL, type Position } from '../data/constants';
import { rosterShape, type PlayerData } from '../data/players';
import { levelPar } from '../scouting/prospects';
import type { Career } from './types';

export const POSITIONS: Position[] = ['A', 'M', 'D', 'G', 'FO'];

/** How many of each position are on the field at once. */
export const ON_FIELD: Record<Position, number> = { A: 3, M: 3, D: 3, G: 1, FO: 1 };

export type NeedLevel = 0 | 1 | 2 | 3 | 4;

export const NEED_LABEL: Record<NeedLevel, string> = {
  0: 'Full',
  1: 'Depth only',
  2: 'Moderate need',
  3: 'High need',
  4: 'Urgent need',
};

export interface PositionNeed {
  pos: Position;
  label: string;
  /** On the roster today. */
  have: number;
  /** Of those, how many will not be back next season. */
  leaving: number;
  /** Back next season. */
  returning: number;
  /** Already committed to join — recruits and transfers both. */
  incoming: number;
  /** Where the position lands once the class arrives. */
  projected: number;
  /** What the level's roster shape asks for here. */
  slots: number;
  /** Places still to fill. */
  open: number;
  /** Average overall of the players there now. 0 when the position is empty. */
  avgOverall: number;
  /** Average of the ones who actually play — the starting line. */
  starterOverall: number;
  /** The weakest projected starter's overall, which is the bar a recruit clears
   *  to play. 0 when a starting place is unfilled. */
  starterLine: number;
  /** How far the starting line sits below the standard of the level. */
  shortfall: number;
  need: NeedLevel;
  needLabel: string;
}

export interface RosterNeeds {
  level: Level;
  byPos: Record<Position, PositionNeed>;
  list: PositionNeed[];
  /** Places open across the whole squad. */
  openSpots: number;
  /** Squad size now, and where it lands with the class in. */
  size: number;
  projectedSize: number;
  /** The squad the level carries. */
  cap: number;
  /** Committed and yet to arrive. */
  incoming: number;
}

/** Will this player still be here next season? Mirrors the offseason rule. */
function isLeaving(p: PlayerData, level: Level): boolean {
  // At high school and college the twelfth-graders graduate, and that is
  // certain. A professional veteran MIGHT move on; that is a dice roll in the
  // offseason and not something to present to a coach as a fact, so a
  // projection counts him as staying.
  return LEVELS[level].ageSystem !== 'pro' && p.grade >= 12;
}

/** Players committed to join, from the recruiting class and the portal alike. */
export function incomingPlayers(career: Career): { pos: Position; overall: number }[] {
  const out: { pos: Position; overall: number }[] = [];
  for (const p of career.recruiting?.prospects ?? []) {
    if (p.committedTo === career.teamId) out.push({ pos: p.player.pos, overall: p.player.overall });
  }
  for (const c of career.market) {
    if (c.status === 'committed') out.push({ pos: c.player.pos, overall: c.player.overall });
  }
  return out;
}

const avg = (xs: number[]): number =>
  (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : 0);

/**
 * The whole picture, recomputed from the squad. Cheap enough to call from a
 * render: one pass over a roster of two dozen.
 */
export function rosterNeeds(career: Career): RosterNeeds {
  return computeNeeds(career.roster, career.level, incomingPlayers(career));
}

/**
 * The same thing from raw parts, for anything that has a squad but not a career
 * — the balance harnesses, and any future screen that wants to show what a
 * roster would look like before it exists.
 */
export function computeNeeds(
  roster: PlayerData[], level: Level, incoming: { pos: Position; overall: number }[] = [],
): RosterNeeds {
  const shape = rosterShape(level);
  const par = levelPar(level);

  const byPos = {} as Record<Position, PositionNeed>;
  const list: PositionNeed[] = [];

  for (const pos of POSITIONS) {
    const here = roster.filter((p) => p.pos === pos);
    const leavingList = here.filter((p) => isLeaving(p, level));
    const returning = here.filter((p) => !isLeaving(p, level));
    const joining = incoming.filter((p) => p.pos === pos);
    const slots = shape.find((s) => s.pos === pos)?.count ?? 0;
    const projected = returning.length + joining.length;
    const open = Math.max(0, slots - projected);

    // The starting line as it will be next season: who is back, plus who is on
    // the way in. This is the bar a recruit is really looking at.
    const line = [...returning.map((p) => p.overall), ...joining.map((p) => p.overall)]
      .sort((a, b) => b - a);
    const plays = ON_FIELD[pos];
    const starters = line.slice(0, plays);
    const starterOverall = avg(starters);
    // An unfilled starting place is an open door, not a high bar.
    const starterLine = starters.length >= plays ? starters[starters.length - 1] : 0;
    const shortfall = starterOverall > 0 ? Math.round(par - starterOverall) : Math.round(par);

    // Pressure combines the two things that make a position a priority: places
    // to fill, and a starting line that is not good enough.
    //
    // Open places count as a SHARE of the position, not as a count. A squad
    // that has just graduated a third of itself has holes everywhere, and a
    // panel that shouts URGENT at all five positions tells a coach nothing
    // about which one to fix first — which is the entire job of this number.
    // Quality is what separates them: four places open in front of a good line
    // is depth to find, four in front of a bad one is the season.
    const pressure = (open / Math.max(1, slots)) * 4.2
      + Math.max(0, shortfall) / 3.5
      + Math.min(0, shortfall) / 10;
    const need: NeedLevel = pressure <= 0.1 ? 0
      : pressure < 1 ? 1
        : pressure < 2 ? 2
          : pressure < 3.2 ? 3 : 4;

    const info: PositionNeed = {
      pos,
      label: POSITION_LABEL[pos],
      have: here.length,
      leaving: leavingList.length,
      returning: returning.length,
      incoming: joining.length,
      projected,
      slots,
      open,
      avgOverall: avg(here.map((p) => p.overall)),
      starterOverall,
      starterLine,
      shortfall,
      need,
      needLabel: NEED_LABEL[need],
    };
    byPos[pos] = info;
    list.push(info);
  }

  const cap = shape.reduce((n, s) => n + s.count, 0);
  const projectedSize = list.reduce((n, p) => n + p.projected, 0);
  return {
    level,
    byPos,
    list,
    openSpots: list.reduce((n, p) => n + p.open, 0),
    size: roster.length,
    projectedSize,
    cap,
    incoming: incoming.length,
  };
}

/* --------------------------------------------------------------- opportunity
 * What a player at a given position, of a given quality, is actually walking
 * into. This is the term that stops a fourth goalie committing behind three
 * others, and it is the same function on both sides of the market so a recruit
 * and a transfer read a depth chart the same way.
 * ------------------------------------------------------------------------ */

export interface Opportunity {
  /** Interest points, positive or negative. */
  delta: number;
  /** What the player would say about it. */
  label: string;
  /** True when he would walk into the starting line-up. */
  starts: boolean;
}

export function playingTimeOutlook(
  needs: RosterNeeds, pos: Position, overall: number,
): Opportunity {
  const n = needs.byPos[pos];
  if (!n) return { delta: 0, label: '', starts: false };
  const plays = ON_FIELD[pos];
  const spot = POSITION_LABEL[pos].toLowerCase();

  // A place in the starting line-up that nobody is standing in.
  if (n.projected < plays) {
    return { delta: 20, label: `A starting ${spot} place is open`, starts: true };
  }
  // He is clearly better than the man who would be last in the line-up.
  if (overall >= n.starterLine + 4) {
    const behind = n.projected - plays;
    const crowded = behind >= 4 ? -5 : 0;
    return {
      delta: 15 + crowded,
      label: crowded ? 'He would start, in a crowded room' : 'He would start from day one',
      starts: true,
    };
  }
  if (overall >= n.starterLine - 3) {
    return { delta: 4, label: 'He would have to win a place', starts: false };
  }
  // Behind the line, and the squad has no room for him either.
  if (n.open <= 0) {
    const stack = n.projected - n.slots;
    return {
      delta: stack >= 2 ? -30 : -22,
      label: `You are already full at ${spot}`,
      starts: false,
    };
  }
  return { delta: -12, label: `He would sit behind your ${spot}s`, starts: false };
}

/** A short line for a screen: what this position needs, in words. */
export function needSummary(n: PositionNeed): string {
  if (n.need === 0) {
    return n.shortfall > 4
      ? `Full, but ${n.shortfall} below the standard of the level`
      : `Full — ${n.projected} of ${n.slots}`;
  }
  const bits: string[] = [];
  if (n.projected < ON_FIELD[n.pos]) bits.push('Not enough bodies to field a line');
  else if (n.shortfall > 6) bits.push(`Starters ${n.shortfall} below the standard here`);
  else if (n.shortfall > 0) bits.push('Starters about the standard here');
  else bits.push('Starters are good; this is depth');
  if (n.incoming) bits.push(`${n.incoming} already committed`);
  return bits.join(' · ');
}
