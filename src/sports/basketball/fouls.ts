import { clamp } from '../../core/math';
import { floorDist } from './court';
import type { CourtPlayer, HoopsDifficulty } from './types';

/* ---------------------------------------------------------------------------
 * FOULS
 * ---------------------------------------------------------------------------
 * A basketball team commits about twenty personal fouls in forty-eight minutes.
 * This game was committing forty-three, because every foul in it was a dice roll
 * hung off a proximity check: a defender within three and a half feet of a layup
 * had a thirty per cent chance of a foul whatever he was doing, and a missed
 * reach had a sixteen per cent chance whether he had reached across the man or
 * simply mistimed a swipe. Routine defence produced a whistle, which is the one
 * thing that makes a basketball game unplayable.
 *
 * SO FOULS ARE NOW SITUATIONS RATHER THAN ROLLS. Each kind has its own trigger,
 * and every one of them asks the same question: DID THE DEFENDER DO SOMETHING
 * WRONG? A man who is set, upright and in front of the ball does not foul. A man
 * who is beaten and reaching across the body usually does.
 *
 *   SHOOTING     contact on a man in the act. The most common kind, and the one
 *                that costs the most, so it is the one most tied to real bad
 *                position: a defender who is late, leaning, or underneath.
 *   BLOCKING     a defender still sliding across when the drive arrives. If he
 *                got there first it is a charge instead, and that distinction is
 *                the whole of defending a drive.
 *   CHARGE       an offensive foul. The one foul the DEFENCE wants.
 *   REACH        a hand on the ball-handler, off a genuinely bad reach only:
 *                across the body, from behind, or while already beaten.
 *   LOOSE        two men going for the same ball with the ball already gone.
 *   PUSH         off-ball contact under the rim, boxing out too hard.
 *
 * DISCIPLINE IS A RATING. Two men making identical contact do not both get
 * called: basketball IQ and positional defence decide who fouls, which is what
 * makes a veteran defender worth something. Difficulty scales it too — an AI on
 * Legend does not hack you on the perimeter for nothing.
 * ------------------------------------------------------------------------- */

export type FoulKind =
  | 'shooting' | 'blocking' | 'charge' | 'reach' | 'loose' | 'push';

export const FOUL_TEXT: Record<FoulKind, string> = {
  shooting: 'Shooting foul',
  blocking: 'Blocking foul',
  charge: 'Charge',
  reach: 'Reach-in',
  loose: 'Loose-ball foul',
  push: 'Push off',
};

/**
 * How well a defender avoids fouling: 0 is a liability, 1 is a veteran who
 * never leaves his feet. Basketball IQ first, then the positional defence that
 * keeps him from needing his hands at all.
 */
export function discipline(p: CourtPlayer, perimeter: boolean): number {
  const a = p.data.attrs;
  const positional = perimeter ? a.perimeterD : a.interiorD;
  return clamp((a.iq * 0.55 + positional * 0.45 - 30) / 60, 0.05, 1);
}

/**
 * Is the defender BEATEN — behind the man he is guarding, relative to the rim he
 * is protecting? A beaten defender fouls; a defender in front does not need to.
 */
export function beaten(
  d: CourtPlayer, o: CourtPlayer, rim: { x: number; y: number },
): boolean {
  return floorDist(d.x, d.y, rim.x, rim.y) > floorDist(o.x, o.y, rim.x, rim.y) + 0.4;
}

/**
 * VERTICALITY. A defender going straight up with his hands is legal, however
 * much contact there is. A defender moving sideways or leaning into the shooter
 * is not. This is the single biggest reason the old system over-called: it never
 * looked at what the defender was doing, only at where he was.
 */
export function vertical(d: CourtPlayer, o: CourtPlayer): number {
  const lateral = Math.hypot(d.vx, d.vy);
  const rising = d.vz > 0.5 ? 1 : d.z > 0.8 ? 0.7 : 0;
  // Moving into the shooter is the worst case; moving away is fine.
  const toward = lateral > 0.1
    ? Math.max(0, ((o.x - d.x) * d.vx + (o.y - d.y) * d.vy)
      / (Math.max(0.001, floorDist(d.x, d.y, o.x, o.y)) * lateral))
    : 0;
  const drift = clamp(lateral / 9, 0, 1) * toward;
  return clamp(rising * 0.7 + (1 - drift) * 0.3, 0, 1);
}

export interface FoulContext {
  defender: CourtPlayer;
  offense: CourtPlayer;
  /** The rim the defender is protecting. */
  rim: { x: number; y: number };
  difficulty: HoopsDifficulty;
  /** Scheme fouling multiplier: a press fouls more, a packed zone fouls less. */
  schemeFouling: number;
}

/* ---------------------------------------------------------------------------
 * HOW MANY IS THE RIGHT NUMBER OF FOULS?
 * ---------------------------------------------------------------------------
 * Not "twenty per forty-eight minutes", which is the answer for real basketball
 * and the wrong answer here. THIS GAME COMPRESSES TIME: a fourteen-minute match
 * plays about seventy possessions a side, which is two-thirds of an NBA game in
 * a quarter of the wall-clock. Judge fouls per minute and you get a whistle
 * every half-minute; judge them per possession and the real rate feels relentless
 * because the possessions arrive three times as fast.
 *
 * So the target is PER POSSESSION, and deliberately BELOW the real one: about
 * 0.12 fouls a possession against basketball's 0.20. That is roughly a whistle
 * every forty-five seconds of play rather than every twenty — frequent enough
 * that hacking is punished and the bonus matters, rare enough that defending
 * somebody is not an offence.
 * ------------------------------------------------------------------------- */

/** Base rates, per event. See the note above for what they are tuned against. */
const BASE = {
  /** Contact on a drive that the defender genuinely got wrong. */
  rimContact: 0.6,
  /** A late contest on a jump shot. */
  lateContest: 0.33,
  /** Sliding across a driver's path without getting there first. */
  blocking: 0.085,
  /** A bad reach on the handler. */
  reach: 0.245,
  /** Two men on a loose ball. */
  loose: 0.035,
  /** Going through the back of a man who had the inside position. */
  push: 0.12,
};

/**
 * Contact at the rim: a drive into a body.
 *
 * The defender only risks a foul if he has done something wrong — he is beaten,
 * or he is drifting into the shooter rather than going up with him. A big man
 * who is set, in front, and going straight up gives up a bucket or blocks it,
 * and he does not go to the line for it.
 */
export function rimContactFoul(
  ctx: FoulContext, gap: number, roll: number,
): FoulKind | null {
  const { defender: d, offense: o } = ctx;
  const late = beaten(d, o, ctx.rim);
  const upright = vertical(d, o);
  // Straight up and in front: legal, every time.
  if (!late && upright > 0.72) return null;

  const strength = (o.data.attrs.strength + o.data.attrs.finishing) / 2;
  const disc = discipline(d, false);
  const near = clamp(1 - gap / 3.4, 0, 1);

  let chance = BASE.rimContact
    * near
    * (late ? 1.85 : 1)
    * (1.35 - upright * 0.8)
    * (1 + (strength - 55) / 180)
    * (1 - disc * 0.5)
    / Math.max(0.5, ctx.difficulty.discipline)
    * ctx.schemeFouling;

  chance = clamp(chance, 0, 0.5);
  if (roll >= chance) return null;
  return late ? 'shooting' : 'blocking';
}

/**
 * A CHARGE. The foul the defence is trying to draw, and the reason playing good
 * position is worth anything at all.
 *
 * The defender must have got there FIRST — in front, set, and not moving into
 * the contact — and the driver must be going fast enough for it to be his fault.
 */
export function chargeCall(
  ctx: FoulContext, gap: number, roll: number,
): boolean {
  const { defender: d, offense: o } = ctx;
  if (gap > 3) return false;
  if (beaten(d, o, ctx.rim)) return false;
  // Set means stopped: a defender still sliding is blocking, not taking a charge.
  if (Math.hypot(d.vx, d.vy) > 2.4) return false;
  const speed = Math.hypot(o.vx, o.vy);
  if (speed < 9) return false;

  const read = clamp((d.data.attrs.iq - 45) / 70, 0, 1);
  const reckless = clamp((speed - 9) / 9, 0, 1);
  const chance = clamp(0.3 * (0.4 + read) * (0.5 + reckless)
    * (0.6 + ctx.difficulty.rotation * 0.6), 0, 0.5);
  return roll < chance;
}

/**
 * A late contest on a jump shot. Landing in a shooter's space, or arriving after
 * the ball has gone, with the body rather than the hands.
 */
export function lateContestFoul(
  ctx: FoulContext, gap: number, roll: number,
): boolean {
  const { defender: d, offense: o } = ctx;
  if (gap > 2.8) return false;
  const upright = vertical(d, o);
  if (upright > 0.8) return false;
  // Coming down on somebody, or still closing hard when the shot went up.
  const falling = d.vz < -3;
  const closing = Math.hypot(d.vx, d.vy) > 7;
  if (!falling && !closing) return false;

  const disc = discipline(d, true);
  const chance = clamp(
    BASE.lateContest * (1.3 - upright) * (1 - disc * 0.55)
    / Math.max(0.5, ctx.difficulty.discipline) * ctx.schemeFouling,
    0, 0.35,
  );
  return roll < chance;
}

/**
 * A reach-in, and it is only a foul when the reach was actually bad: across the
 * body, from behind, or by a man already beaten. A clean swipe at the ball that
 * misses is a missed swipe, not a whistle — which is what the old code called it
 * every sixth time and why the game never stopped blowing.
 */
export function reachFoul(
  ctx: FoulContext, gap: number, roll: number,
): boolean {
  const { defender: d, offense: o } = ctx;
  if (gap > 3.2) return false;
  const late = beaten(d, o, ctx.rim);
  // Reaching across the handler's body: the defender's hand crosses the line
  // between the handler and where the handler is going.
  const handlerSpeed = Math.hypot(o.vx, o.vy);
  const across = handlerSpeed > 3
    ? clamp(((d.x - o.x) * o.vx + (d.y - o.y) * o.vy)
      / (Math.max(0.001, gap) * handlerSpeed), -1, 1) < -0.15
    : false;
  if (!late && !across) return false;

  const disc = discipline(d, true);
  const chance = clamp(
    BASE.reach * (late ? 1.7 : 1) * (across ? 1.4 : 1) * (1 - disc * 0.6)
    / Math.max(0.5, ctx.difficulty.discipline) * ctx.schemeFouling,
    0, 0.4,
  );
  return roll < chance;
}

/** Two men arriving at a loose ball together. */
export function looseBallFoul(ctx: FoulContext, roll: number): boolean {
  const disc = discipline(ctx.defender, false);
  return roll < clamp(BASE.loose * (1 - disc * 0.5) * ctx.schemeFouling, 0, 0.1);
}

/**
 * A PUSH-OFF ON THE GLASS, and it is the offence that commits it: an offensive
 * rebounder going through the back of a man who had the inside position. An
 * offensive foul, so the ball goes the other way and the second chance is gone.
 *
 * `defender` here is the man doing the pushing, which for this one call is the
 * offensive player — the argument is the man at fault, as it is everywhere else
 * in this file.
 */
export function pushOffFoul(ctx: FoulContext, roll: number): boolean {
  const disc = discipline(ctx.defender, false);
  const strength = clamp((ctx.defender.data.attrs.strength - 50) / 60, -0.5, 1);
  return roll < clamp(
    BASE.push * (1 + strength) * (1 - disc * 0.5) / Math.max(0.5, ctx.difficulty.discipline),
    0, 0.08,
  );
}
