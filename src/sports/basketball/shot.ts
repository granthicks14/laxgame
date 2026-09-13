import { clamp } from '../../core/math';
import type { Rng } from '../../core/rng';
import { COURT, type Side, type Vec3, attackRim, floorDist } from './court';

/* ---------------------------------------------------------------------------
 * THE SHOT
 * ---------------------------------------------------------------------------
 * The one mechanic that has to be right, because it is the sport.
 *
 * HOW A SHOT IS DECIDED. Hold to gather, release inside the window. The window's
 * WIDTH comes from the shooter — a career shooter gives you a forgiving target, a
 * centre gives you a sliver — and its POSITION is the same every time, so it can
 * be learned. That split is deliberate: timing is the part the player owns and it
 * dominates the outcome, while the rating decides how much room for error he is
 * given. It is the same principle the lacrosse faceoff is built on, applied to
 * the thing a basketball game lives or dies by.
 *
 * WHY THE OUTCOME IS DECIDED BEFORE THE BALL LANDS. The make probability is
 * computed from the shot — distance, release, contest, footing, rating — and then
 * the ball is aimed at a point that produces that result: the throat of the ring
 * for a make, a specific piece of iron for a miss. The flight itself is real
 * physics either way.
 *
 * The alternative — aim with error and let physics decide — sounds more honest
 * and plays worse: a rating would only be expressible as aim jitter, which makes
 * a 40% shooter and a 30% shooter feel identical on any single shot, and the
 * arithmetic of which jitter yields which percentage is invisible to everybody
 * including the person tuning it. Deciding first means a shooting percentage is a
 * number that can be stated, tested and balanced — see `npm run hoops` — while
 * the ball still genuinely hits the front rim and genuinely comes back to the
 * shooter, because WHERE a miss is aimed is what makes rebounding real.
 * ------------------------------------------------------------------------- */

/** Where the release window sits along the gather, as a fraction. */
export const RELEASE_CENTRE = 0.82;
/** Half-width of the window at a rating of 0 and of 99. */
const WINDOW_MIN = 0.045;
const WINDOW_MAX = 0.155;
/** How long a full gather takes, in seconds. */
export const GATHER_TIME = 0.62;

export type ShotKind = 'jumper' | 'three' | 'layup' | 'dunk' | 'freeThrow';

/** Everything that decides whether a shot goes in. */
export interface ShotInput {
  kind: ShotKind;
  /** Floor feet from the rim. */
  distance: number;
  /**
   * How well the release was timed: 1 is dead centre of the window, 0 is the
   * edge, and negative means outside it — rushed or held too long.
   */
  release: number;
  /** The relevant shooting rating, 0..99. */
  rating: number;
  /** Finishing rating, used at the rim. */
  finishing: number;
  /** Feet to the nearest defender, and how good he is. */
  contestDistance: number;
  contestRating: number;
  /** True when the defender is between the shooter and the rim. */
  contestInLine: boolean;
  /** Speed the shooter was moving at, in ft/s: a runner is off balance. */
  moving: number;
  /** True when the shooter has a hand in his face from the side or behind. */
  fading: boolean;
}

/** How wide this shooter's release window is. */
export function releaseWindow(rating: number): number {
  return WINDOW_MIN + (clamp(rating, 0, 99) / 99) * (WINDOW_MAX - WINDOW_MIN);
}

/**
 * Turn a gather fraction into a release quality.
 * 1 at the centre of the window, 0 at its edge, negative outside it.
 */
export function releaseQuality(gather: number, rating: number): number {
  const half = releaseWindow(rating);
  const err = Math.abs(gather - RELEASE_CENTRE);
  if (err <= half) return 1 - err / half;
  // Outside the window: how badly, so a near miss is not the same as a heave.
  return -Math.min(1, (err - half) / 0.25);
}

/**
 * Base percentage from distance alone, for an average shooter with a clean look.
 *
 * The curve is anchored on what basketball actually shoots, and the numbers are
 * measured against these anchors by `npm run hoops`: at the rim around 62%,
 * a fifteen-foot jumper 45%, an open three 37%, and it keeps falling beyond the
 * line rather than flattening, so a 30-footer is a bad idea and not a free one.
 */
function baseByDistance(distance: number, kind: ShotKind): number {
  // Low enough that a perfect release lands near the three-in-four a real
  // free-throw shooter makes, rather than on top of it.
  if (kind === 'freeThrow') return 0.62;
  if (kind === 'dunk') return 0.88;
  if (kind === 'layup') return clamp(0.58 - Math.max(0, distance - 3) * 0.028, 0.36, 0.64);
  if (distance <= 8) return clamp(0.47 - (distance - 4) * 0.012, 0.4, 0.5);
  if (distance <= 16) return clamp(0.42 - (distance - 8) * 0.0075, 0.35, 0.42);
  if (distance <= COURT.threeRadius) return clamp(0.365 - (distance - 16) * 0.006, 0.31, 0.365);
  return clamp(0.315 - (distance - COURT.threeRadius) * 0.0135, 0.08, 0.315);
}

/**
 * The probability this shot goes in.
 *
 * Every term is a real basketball consideration and each one is separable, so a
 * balance pass can move one without guessing at the others.
 */
export function makeChance(s: ShotInput): number {
  let p = baseByDistance(s.distance, s.kind);

  // THE SHOOTER. A rating is worth roughly fourteen points of percentage across
  // its whole range, which is about the spread between a league's best shooter
  // and its worst rotation player.
  const skill = s.kind === 'layup' || s.kind === 'dunk' ? s.finishing : s.rating;
  p += ((clamp(skill, 0, 99) - 55) / 44) * 0.115;

  // THE RELEASE. The largest single term, because it is the part the player is
  // actually doing. A perfect release is worth a lot; a bad one is fatal. It
  // applies at the free-throw line too — a free throw is a pure timing shot.
  p += s.release >= 0
    ? s.release * 0.13 - 0.035
    : s.release * 0.34;

  /* THE CONTEST. A hand in the face is worth more than a body nearby, and a
   * defender who is actually between you and the rim is worth more again.
   *
   * The size of this term is the single most consequential number in the file.
   * Real basketball shoots about forty per cent on a wide-open three and about
   * thirty on a tightly contested one — a ten point gap, not a thirty point one.
   * At more than double this value a defender within two feet took a three from
   * 38% to 12%, which meant no shot on a guarded floor was ever worth taking:
   * the AI offence correctly passed the ball around the arc for twenty-four
   * seconds and then heaved it, every possession, and the league scored eleven
   * points a game. */
  if (s.kind !== 'freeThrow') {
    const pressure = clamp(1 - s.contestDistance / 7.5, 0, 1);
    const quality = 0.6 + (clamp(s.contestRating, 0, 99) / 99) * 0.8;
    p -= pressure * pressure * 0.105 * quality * (s.contestInLine ? 1.3 : 0.85);
    if (s.fading) p -= 0.02;
  }

  // FOOTING. Set feet are worth real percentage, which is why a good offence
  // works to get them.
  if (s.kind === 'jumper' || s.kind === 'three') {
    p -= clamp(s.moving / 14, 0, 1) * 0.05;
  }

  return clamp(p, 0.02, 0.97);
}

export type MissKind = 'short' | 'long' | 'left' | 'right' | 'board';

export interface ShotSolution {
  make: boolean;
  /** Where the ball is aimed. */
  target: Vec3;
  /** Extra hang time, so a heave arcs like a heave. */
  extraArc: number;
  miss: MissKind | null;
}

/**
 * Aim the shot.
 *
 * A make is aimed at the centre of the ring at rim height, so the ball crosses
 * the plane through the throat and drops. A miss is aimed at a specific piece of
 * iron, and which piece is not cosmetic — it is what decides where the rebound
 * goes, and therefore who gets the ball. Short misses come back to the shooter,
 * long ones carry past the rim, and a shot off the side of the ring kicks out to
 * the wing. Getting that distribution right is the difference between rebounding
 * being a phase of the sport and being a coin toss.
 */
export function solveShot(s: ShotInput, side: Side, from: Vec3, rng: Rng): ShotSolution {
  const rim = attackRim(side);
  const make = rng.next() < makeChance(s);

  if (make) {
    // Small jitter, well inside the throat, so no two makes are identical and
    // none of them can clip out.
    return {
      make: true,
      target: {
        // The ring gives a basketball about four inches of clearance either
        // side, so the jitter that keeps two makes from being identical has to
        // stay well inside it — a shot the model decided goes in must not clip
        // out on an oblique approach.
        x: rim.x + rng.range(-0.11, 0.11),
        y: rim.y + rng.range(-0.11, 0.11),
        z: rim.z,
      },
      extraArc: s.kind === 'three' ? 0.04 : 0,
      miss: null,
    };
  }

  // WHICH MISS. A rushed release is short; holding too long and heaving is long;
  // a hard contest knocks it sideways or into the board. Distance stretches all
  // of it, because a long miss from deep is a long way off.
  const rushed = s.release < 0 && s.release > -0.6;
  const heaved = s.release <= -0.6;
  const pressed = s.contestDistance < 3.2;
  const roll = rng.next();

  let miss: MissKind;
  if (heaved) miss = roll < 0.6 ? 'long' : 'board';
  else if (rushed) miss = roll < 0.62 ? 'short' : roll < 0.82 ? 'left' : 'right';
  else if (pressed) miss = roll < 0.34 ? 'short' : roll < 0.55 ? 'left' : roll < 0.76 ? 'right' : 'board';
  // A clean look that misses is mostly a touch off either way, which is what
  // a real shot chart looks like.
  else if (roll < 0.34) miss = 'short';
  else if (roll < 0.58) miss = 'long';
  else if (roll < 0.74) miss = 'left';
  else if (roll < 0.9) miss = 'right';
  else miss = 'board';

  // Direction from the shooter to the rim, so "short" means short from where he
  // is standing rather than short in world coordinates.
  const dx = rim.x - from.x;
  const dy = rim.y - from.y;
  const d = Math.max(0.001, Math.hypot(dx, dy));
  const ux = dx / d;
  const uy = dy / d;
  // Perpendicular, for the side misses.
  const px = -uy;
  const py = ux;

  const spread = 0.55 + Math.min(1.5, s.distance * 0.022);
  const target: Vec3 = { x: rim.x, y: rim.y, z: rim.z };
  let extraArc = 0;

  switch (miss) {
    case 'short':
      target.x -= ux * (COURT.rimRadius + spread * rng.range(0.35, 0.8));
      target.y -= uy * (COURT.rimRadius + spread * rng.range(0.35, 0.8));
      break;
    case 'long':
      target.x += ux * (COURT.rimRadius + spread * rng.range(0.4, 1.0));
      target.y += uy * (COURT.rimRadius + spread * rng.range(0.4, 1.0));
      break;
    case 'left':
      target.x += px * (COURT.rimRadius + spread * rng.range(0.3, 0.9));
      target.y += py * (COURT.rimRadius + spread * rng.range(0.3, 0.9));
      break;
    case 'right':
      target.x -= px * (COURT.rimRadius + spread * rng.range(0.3, 0.9));
      target.y -= py * (COURT.rimRadius + spread * rng.range(0.3, 0.9));
      break;
    case 'board': {
      // Off the glass. Aimed above the ring so it comes back down off the board.
      const boardX = rim.x > COURT.centerX
        ? COURT.length - COURT.boardInset
        : COURT.boardInset;
      target.x = boardX;
      target.y = rim.y + rng.range(-1.6, 1.6);
      target.z = COURT.boardBottom + rng.range(0.8, 2.6);
      break;
    }
  }

  if (heaved) extraArc += 0.12;
  return { make: false, target, extraArc, miss };
}

/** A free throw is taken from a fixed spot, so the spot is worth naming. */
export function freeThrowSpot(side: Side): Vec3 {
  const rim = attackRim(side);
  const dir = rim.x > COURT.centerX ? -1 : 1;
  return { x: rim.x + dir * (COURT.freeThrowX - COURT.rimInset), y: COURT.centerY, z: 6.2 };
}

/** Where the ball leaves a shooter's hands. Taller release from a jump shot. */
export function releasePoint(x: number, y: number, kind: ShotKind): Vec3 {
  const z = kind === 'dunk' ? 10.3
    : kind === 'layup' ? 8.4
      : kind === 'freeThrow' ? 6.9
        : 7.6;
  return { x, y, z };
}

/** How far out a shot from here is worth attempting, for the AI's shot selection. */
export function expectedPoints(s: ShotInput, value: 2 | 3): number {
  return makeChance(s) * value;
}

/** Floor distance from a spot to the rim it attacks. */
export const distanceToRim = (x: number, y: number, side: Side): number => {
  const rim = attackRim(side);
  return floorDist(x, y, rim.x, rim.y);
};
