import { clamp } from '../../../core/math';
import { POSITIONS, POSITION_LABEL, depthAt, type Position } from '../data';
import { shapeFor, MINIMUM_SHAPE } from '../levels';
import { rosterFor, worldTeam } from '../world';
import type { FootballCareer } from './types';

/**
 * WHERE THE PROGRAMME ACTUALLY STANDS, which is not where it was written.
 *
 * A coach who has won for a decade is recruiting for a different programme from
 * the one he took over. Without this a dynasty has no compounding in it: the
 * twentieth season recruits exactly as well as the first.
 */
export function standingOf(career: FootballCareer): number {
  const club = worldTeam(career.teamId);
  return clamp((club?.standing ?? 50) + (career.standingDrift[career.teamId] ?? 0), 1, 99);
}

/* ---------------------------------------------------------------------------
 * WHAT THE ROSTER IS SHORT OF
 * ---------------------------------------------------------------------------
 * One answer, used by recruiting, by the harness and by the screen, so a coach
 * being told he needs a tight end and the recruiting board acting on it are the
 * same opinion.
 *
 * NEED IS NOT ONLY A HEADCOUNT, and getting that wrong is what left programmes
 * playing a walk-on at punter for twenty years: the position was "full", so
 * nothing ever recruited one, so it stayed full of the same bad player for ever.
 * A position is a need when it is SHORT or when the man there is well below
 * what the rest of the programme is — which is exactly when a real coach goes
 * looking.
 * ------------------------------------------------------------------------- */

export type NeedLevel = 'critical' | 'need' | 'thin' | 'set' | 'deep';

export interface Need {
  pos: Position;
  label: string;
  have: number;
  want: number;
  /** The best man there, or 0 if there is nobody. */
  best: number;
  /** What a starter at this programme should read. */
  par: number;
  level: NeedLevel;
  /** How badly, 0..1, for sorting a recruiting board. */
  weight: number;
  /** One line, for the screen. */
  note: string;
}

export function rosterNeeds(career: FootballCareer): Need[] {
  const shape = shapeFor(career.level);

  /* THE BENCHMARK IS THE SAME CLUB, UNMANAGED.
   *
   * "What would be standing here if nobody had ever coached this programme" is
   * the only comparison available in the same units as a player's overall — and
   * getting that wrong is not academic. The first version compared an OVERALL
   * against a PAR, which live in different scales entirely: a par of seventy-one
   * generates players who read eighty-five, so every position on every roster
   * came out comfortably above its benchmark, nothing was ever a need, and a
   * programme carried the same walk-on punter for twenty seasons.
   */
  const club = worldTeam(career.teamId);
  const benchmark = club ? rosterFor(club, career.year) : [];
  const parAt = (pos: Position): number => {
    const at = depthAt(benchmark, pos);
    return at[0]?.overall ?? 55;
  };

  return POSITIONS.map((pos) => {
    const men = depthAt(career.roster, pos);
    const have = men.length;
    const want = shape[pos];
    const floor = MINIMUM_SHAPE[pos];
    const best = men[0]?.overall ?? 0;
    const par = parAt(pos);
    // How far below the benchmark the man there is, whatever the headcount says.
    const under = Math.max(0, par - best);

    let level: NeedLevel;
    let note: string;
    if (have < floor) {
      level = 'critical';
      note = `Cannot field one — ${floor - have} short of a legal unit.`;
    } else if (have < want) {
      level = 'need';
      note = `${want - have} short of a full group.`;
    } else if (under > 5) {
      level = 'need';
      note = `Full, but the best man there is ${Math.round(under)} under what this `
        + 'programme should be starting.';
    } else if (under > 1 || have === want) {
      level = 'thin';
      note = have === want ? 'Exactly enough, and no cover.' : 'Playable, and could be better.';
    } else if (have > want + 2) {
      level = 'deep';
      note = 'More than enough.';
    } else {
      level = 'set';
      note = 'Set.';
    }

    const weight = clamp(
      (have < floor ? 1 : 0)
      + Math.max(0, want - have) * 0.3
      + under * 0.05,
      0, 1,
    );

    return { pos, label: POSITION_LABEL[pos], have, want, best, par, level, weight, note };
  });
}

export const NEED_ORDER: Record<NeedLevel, number> = {
  critical: 0, need: 1, thin: 2, set: 3, deep: 4,
};

/** Worst first, which is the order a recruiting board should be read in. */
export const byNeed = (career: FootballCareer): Need[] =>
  rosterNeeds(career).sort((a, b) =>
    NEED_ORDER[a.level] - NEED_ORDER[b.level] || b.weight - a.weight);
