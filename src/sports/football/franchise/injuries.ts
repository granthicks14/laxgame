import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import type { Player, Position } from '../data';
import { medicalMult } from './club';
import type { Franchise } from './types';

/* ---------------------------------------------------------------------------
 * WHO IS HURT
 * ---------------------------------------------------------------------------
 * Four kinds of injury and nothing else, because the brief is right that this is
 * a place where detail is the enemy:
 *
 *   A KNOCK          he is sore. He plays.
 *   A WEEK OR TWO    somebody else starts, and you find out what your depth is.
 *   A MONTH          a real hole in the season.
 *   THE SEASON       rare, and it should be devastating when it happens.
 *
 * A player who cannot play does not play — see `gameRoster`. That is the whole
 * cost, and it is enough: an injury that only shows up as a number on a screen
 * is not an injury.
 *
 * The medical wing is the one lever, and it works on both halves: fewer of them,
 * and shorter when they come.
 * ------------------------------------------------------------------------- */

interface Kind {
  label: string;
  weeks: [number, number];
  severity: number;
  weight: number;
}

/* The list is ordered from "he is fine" to "he is gone", and the weights are
 * chosen so about three in five are nothing and one in forty ends a season. */
const KINDS: Kind[] = [
  { label: 'Knock', weeks: [0, 0], severity: 0.18, weight: 0.5 },
  { label: 'Bruised ribs', weeks: [1, 1], severity: 0.3, weight: 0.16 },
  { label: 'Hamstring', weeks: [2, 3], severity: 0.4, weight: 0.14 },
  { label: 'High ankle sprain', weeks: [3, 5], severity: 0.45, weight: 0.1 },
  { label: 'Shoulder', weeks: [4, 6], severity: 0.5, weight: 0.06 },
  { label: 'Knee', weeks: [9, 14], severity: 0.6, weight: 0.03 },
  { label: 'Achilles', weeks: [17, 20], severity: 0.7, weight: 0.01 },
];

/** How exposed a position is. The trenches and the backs take the punishment. */
const RISK: Record<Position, number> = {
  QB: 0.85, RB: 1.35, WR: 0.95, TE: 1.1, OL: 1.15,
  DL: 1.2, LB: 1.15, CB: 0.95, S: 0.95, K: 0.2, P: 0.2,
};

/** Base chance a man who played a full game comes out of it hurt. */
const BASE = 0.075;

export interface NewInjury {
  player: Player;
  label: string;
  weeks: number;
}

/**
 * ROLL FOR EVERYBODY WHO PLAYED, once, after the game.
 *
 * Deliberately not rolled per play: an injury model that fires inside the
 * engine has to be tuned against play count, and a game with a hundred and
 * forty snaps in it would put half the roster in the building.
 */
export function rollInjuries(
  fr: Franchise, snaps: Record<string, number>, teamSnaps: number, rng: Rng,
): NewInjury[] {
  const guard = medicalMult(fr.facilities.medical);
  const out: NewInjury[] = [];

  for (const p of fr.roster) {
    if (p.injury && p.injury.weeks >= 1) continue;
    const share = teamSnaps > 0 ? clamp((snaps[p.id] ?? 0) / teamSnaps, 0, 1.2) : 0.5;
    if (share <= 0.02) continue;
    /* AN OLDER PLAYER BREAKS MORE EASILY, which is the other half of why a
     * thirty-three-year-old is a decision. */
    const age = 1 + clamp(p.age - 28, 0, 9) * 0.07;
    if (rng.next() > BASE * share * RISK[p.pos] * age * guard) continue;

    const kind = pick(rng);
    const weeks = Math.round(rng.range(kind.weeks[0], kind.weeks[1]) * guard);
    p.injury = { label: kind.label, weeks, severity: kind.severity };
    if (weeks >= 1) out.push({ player: p, label: kind.label, weeks });
  }
  return out;
}

function pick(rng: Rng): Kind {
  let total = 0;
  for (const k of KINDS) total += k.weight;
  let t = rng.next() * total;
  for (const k of KINDS) {
    t -= k.weight;
    if (t <= 0) return k;
  }
  return KINDS[0];
}

/** A week goes by. Called once between rounds of fixtures. */
export function tickInjuries(fr: Franchise): Player[] {
  const back: Player[] = [];
  for (const p of fr.roster) {
    if (!p.injury) continue;
    p.injury.weeks -= 1;
    if (p.injury.weeks <= 0) {
      p.injury = null;
      back.push(p);
    }
  }
  return back;
}

/** Everybody healthy again, which is what a summer is for. */
export function healAll(fr: Franchise): void {
  for (const p of fr.roster) p.injury = null;
}

export const injuryText = (p: Player): string => {
  if (!p.injury) return '';
  if (p.injury.weeks <= 0) return `${p.injury.label} — fit`;
  if (p.injury.weeks === 1) return `${p.injury.label} — out a week`;
  if (p.injury.weeks >= 12) return `${p.injury.label} — out for the season`;
  return `${p.injury.label} — out ${p.injury.weeks} weeks`;
};
