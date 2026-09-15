import { clamp } from '../../../core/math';
import { ATTR_LABEL, computeOverall, type AttrKey, type HoopsPlayer } from '../data';
import { perksOf } from './coach';
import type { HoopsCareer } from './types';

/* ---------------------------------------------------------------------------
 * PRACTICE
 * ---------------------------------------------------------------------------
 * What a coach does with the six days between games, and the one part of roster
 * building that is not a dice roll in an offseason: he picks a man, he works on
 * one thing, and that thing is better on Saturday.
 *
 * TWO SEPARATE SYSTEMS, deliberately, because they answer different questions.
 *
 *   TRAINING is targeted and it is permanent. Coach points buy two points of one
 *   attribute on one player, up to his ceiling, and they stay bought. It is how a
 *   coach fixes the specific hole in the specific man — the centre who cannot
 *   make a free throw, the guard who cannot be trusted with the ball — instead of
 *   hoping the offseason happens to do it.
 *
 *   EMPHASIS is broad and it is temporary. The whole squad practises one area of
 *   the game; everybody gains a little in it FOR THE NEXT GAME ONLY, and the
 *   offseason's development leans the same way. It is free, it is reversible, and
 *   the cost of it is real: a week spent on shooting is a week not spent on
 *   defence, and the effect is small enough that it changes a close game rather
 *   than deciding a season.
 *
 * Neither of these is lacrosse's. The areas are basketball's own, they move
 * basketball's attributes, and the emphasis multiplies the SAME development
 * families the coaching tree already uses, so a shooting coach with a shooting
 * emphasis compounds the way a player would expect.
 * ------------------------------------------------------------------------- */

/** What one attribute point costs, in coach points. */
export const TRAIN_COST = 5;

/** How many rating points of one attribute a training session buys. */
const TRAIN_GAIN = 2;

export type TrainResult =
  | { ok: true; attr: AttrKey; from: number; to: number; overall: number }
  | { ok: false; reason: string };

/**
 * Work on one attribute of one player.
 *
 * REFUSALS ARE EXPLAINED rather than silently dropped, because from a screen
 * there is no difference between "you cannot afford this" and "the button is
 * broken", and the second is what it looks like.
 */
export function trainPlayer(
  career: HoopsCareer, playerId: string, attr: AttrKey,
): TrainResult {
  if (career.coach.points < TRAIN_COST) {
    return { ok: false, reason: `Needs ${TRAIN_COST} coach points` };
  }
  const p = career.roster.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: 'He is not on the roster' };
  if (p.attrs[attr] >= 99) {
    return { ok: false, reason: `His ${ATTR_LABEL[attr].toLowerCase()} is maxed` };
  }
  /* A CEILING IS A CEILING. Training is the coach's lever, not a way around the
   * scouting report — a limited player can be made a little less limited in one
   * specific thing, and then he is done. The four points of slack are there so
   * the last session before a ceiling is not wasted. */
  const ceiling = Math.min(99, p.potential + perksOf(career.coach).ceilingLift);
  if (p.overall >= ceiling + 4) {
    return { ok: false, reason: 'He has got everything he is going to get' };
  }

  const from = p.attrs[attr];
  p.attrs[attr] = clamp(from + TRAIN_GAIN, 1, 99);
  p.overall = computeOverall(p.pos, p.attrs);
  career.coach.points -= TRAIN_COST;
  return { ok: true, attr, from, to: p.attrs[attr], overall: p.overall };
}

/** Whether a training session on this player would be refused, and why. */
export function trainBlockedReason(
  career: HoopsCareer, p: HoopsPlayer, attr: AttrKey,
): string | null {
  if (career.coach.points < TRAIN_COST) return `Needs ${TRAIN_COST} coach points`;
  if (p.attrs[attr] >= 99) return 'Maxed';
  const ceiling = Math.min(99, p.potential + perksOf(career.coach).ceilingLift);
  if (p.overall >= ceiling + 4) return 'At his ceiling';
  return null;
}

/* ------------------------------------------------------------- the emphasis */

export type PracticeArea =
  | 'shooting' | 'finishing' | 'perimeter' | 'rebounding' | 'ballwork' | 'conditioning';

export interface PracticeInfo {
  label: string;
  blurb: string;
  /** What the week actually moves. */
  attrs: AttrKey[];
}

export const PRACTICE_INFO: Record<PracticeArea, PracticeInfo> = {
  shooting: {
    label: 'Shooting',
    blurb: 'Form work from the arc and the line. Jumpers and free throws.',
    attrs: ['shooting', 'three', 'freeThrow'],
  },
  finishing: {
    label: 'Finishing',
    blurb: 'Contact work at the rim. Layups, dunks and second chances.',
    attrs: ['finishing', 'strength'],
  },
  perimeter: {
    label: 'Perimeter defence',
    blurb: 'Slides and closeouts. Harder to get past, quicker hands.',
    attrs: ['perimeterD', 'steal'],
  },
  rebounding: {
    label: 'The glass',
    blurb: 'Boxing out and going up. Rebounds, blocks and interior defence.',
    attrs: ['rebounding', 'block', 'interiorD'],
  },
  ballwork: {
    label: 'Ball work',
    blurb: 'Handle and vision under pressure. Fewer turnovers, better passes.',
    attrs: ['handle', 'passing', 'iq'],
  },
  conditioning: {
    label: 'Conditioning',
    blurb: 'Legs for the fourth quarter. Speed, lift and stamina.',
    attrs: ['speed', 'vertical', 'stamina'],
  },
};

export const PRACTICE_ORDER: PracticeArea[] = [
  'shooting', 'finishing', 'perimeter', 'rebounding', 'ballwork', 'conditioning',
];

/**
 * The squad as it will take the floor in the next game.
 *
 * A COPY, never the roster itself: this bonus is what a week of practice is
 * worth on one night, and if it were written into the players it would compound
 * every single game until a mid-table side had six ninety-rated shooters by
 * February. It also has to be a copy because both engines read a roster and
 * neither should know or care that a practice week happened.
 */
export function matchRoster(career: HoopsCareer): HoopsPlayer[] {
  if (!career.practice) return career.roster;
  const keys = PRACTICE_INFO[career.practice].attrs;
  /* A coach who knows how to run a practice gets more out of the same six days.
   * Three points of two or three attributes is worth about a point of overall —
   * small, and it should be: a week is a week. */
  const gain = Math.round(3 * clamp(perksOf(career.coach).development, 0.8, 1.8));
  return career.roster.map((p) => {
    const attrs = { ...p.attrs };
    for (const k of keys) attrs[k] = clamp(attrs[k] + gain, 1, 99);
    const copy: HoopsPlayer = { ...p, attrs };
    copy.overall = computeOverall(copy.pos, attrs);
    return copy;
  });
}

/** What the current emphasis is worth, in words, for the hub. */
export function practiceSummary(career: HoopsCareer): string {
  if (!career.practice) return 'No emphasis this week — nobody is working on anything.';
  return PRACTICE_INFO[career.practice].blurb;
}
