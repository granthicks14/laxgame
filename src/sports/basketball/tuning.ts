import type { DifficultyKey, HoopsDifficulty } from './types';

/* ---------------------------------------------------------------------------
 * FEEL
 * ---------------------------------------------------------------------------
 * Every number the basketball engine runs on, in one place, in feet and seconds.
 *
 * These are not lacrosse's numbers scaled. A basketball court is a fifth of the
 * area of a lacrosse field with the same number of players on it, so spacing is
 * tight, contact is constant, and the difference between a good shot and a bad
 * one is two feet rather than fifteen yards. Everything below is set against
 * what the sport actually does: a top speed near twenty feet per second, a
 * twenty-four second clock, and a possession that ends in about nine.
 * ------------------------------------------------------------------------- */

export const HOOPS = {
  /** Rating that reads as "average professional". */
  ratingCentre: 62,

  /* --- movement. Anchored on real running speeds: a quick guard tops out near
   * twenty feet per second, a centre nearer fifteen. */
  baseSpeed: 12.4,
  speedPerRating: 0.062,
  sprintMultiplier: 1.26,
  /** How fast a player reaches target velocity. Basketball is all first step. */
  accelBase: 26,
  accelPerRating: 0.16,
  turnRate: 13,
  /** Carrying the ball costs you a little speed; so does being tired. */
  dribblePenalty: 0.9,

  /* --- stamina */
  sprintDrain: 9,
  staminaRegen: 7.5,
  lowStamina: 25,

  /* --- the shot */
  /** Inside this, a shot becomes a layup or a dunk rather than a jumper. */
  rimRange: 4.2,
  /** Dunk instead of a layup above this finishing+vertical, and with a lane. */
  dunkThreshold: 74,
  /** Seconds a jump shot hangs before release. */
  jumpTime: 0.55,
  /** Vertical launch speed of a shooting jump, ft/s. */
  jumpSpeed: 7.4,

  /* --- defence */
  /** A steal attempt reaches this far. */
  stealRange: 4.6,
  stealCooldown: 0.85,
  /** Reaching in and missing leaves you beaten for this long. */
  stealWhiffStun: 0.42,
  blockRange: 5.4,
  blockCooldown: 0.9,
  /** How close a defender must be to contest a shot at all. */
  contestRange: 7.5,
  /** Bumping a driver slows them; this is how much. */
  bodyCheck: 0.62,

  /* --- fouls */
  /**
   * Chance a failed steal in tight is called, before ratings. Kept low: a real
   * team commits about twenty fouls in forty-eight minutes, and every one of them
   * stops the clock, so a generous whistle turns the game into a foul-shooting
   * contest.
   */
  reachFoulBase: 0.16,
  /** Chance a block attempt that arrives late is a foul. */
  blockFoulBase: 0.26,
  foulOutAt: 6,
  /** Team fouls in a quarter before non-shooting fouls award free throws. */
  bonusAt: 5,

  /* --- the ball */
  passSpeedMin: 26,
  passSpeedMax: 46,
  /** How close you must be to collect a loose ball. */
  catchRadius: 2.0,
  /**
   * How close a defender must be to a pass to get a hand on it.
   *
   * This has to be SMALLER than the clearance a passer demands of a lane, or
   * every pass the offence judges safe is stolen anyway: at 2.6ft against a
   * 2.2ft lane check, teams were giving up fifty steals a game. A real
   * deflection needs a hand genuinely in the flight path.
   */
  interceptRadius: 1.4,
  /**
   * The clearance a passer wants either side of a passing lane.
   *
   * Measured, not guessed: at 3ft, on a fifty-foot floor with five defenders on
   * it, there was no clear lane to anybody on fifty-seven per cent of frames, and
   * the offence could not swing the ball at all. A real chest pass threads a
   * considerably tighter gap than that — and it stays above the 1.4ft a defender
   * needs to get a hand on it, so a lane judged clear can still be picked off if
   * somebody closes while the ball is in the air. That margin is the risk in a
   * pass, and it should be small.
   */
  laneClearance: 2.0,

  /* --- rebounding */
  /** How far from the rim a miss can be collected from. */
  reboundRange: 15,
  /** How much box-out position is worth against pure rebounding rating. */
  positionWeight: 0.55,

  /* --- the clock */
  shotClock: 24,
  /** A new shot clock after an offensive rebound, as the real rule has it. */
  shotClockOffReb: 14,
  quarters: 4,
  overtimeSeconds: 60,
  /** Seconds of real celebration before the ball is inbounded after a basket. */
  madeBasketPause: 1.15,
  inboundPause: 1.0,
  freeThrowPause: 1.25,
  /** How long the ball must be dead before a quarter break ends. */
  breakPause: 2.4,
} as const;

export const GAME_LENGTHS = {
  short: {
    label: 'Short',
    quarterSeconds: 120,
    blurb: '4 x 2:00 — about 9 minutes. Expect a score in the thirties.',
  },
  standard: {
    label: 'Standard',
    quarterSeconds: 210,
    blurb: '4 x 3:30 — about 16 minutes. Expect a score in the fifties.',
  },
  long: {
    label: 'Long',
    quarterSeconds: 300,
    blurb: '4 x 5:00 — about 23 minutes. Expect a score in the seventies.',
  },
} as const;
export type GameLengthKey = keyof typeof GAME_LENGTHS;

/* ---------------------------------------------------------------- difficulty
 *
 * The rule the lacrosse game set and this one keeps: DIFFICULTY IS NEVER A BONUS
 * ON THE OPPONENT'S RATING. Every AI player plays to exactly the ratings the
 * roster screen shows. What changes is how well the AI DECIDES — whether it
 * takes the best available shot or a merely acceptable one, how fast help
 * arrives, how long it is willing to work for a better look, and how hard it
 * closes out. A Legend defence is not stronger, it is better coached.
 */
export const DIFFICULTIES: Record<DifficultyKey, HoopsDifficulty> = {
  rookie: {
    key: 'rookie',
    label: 'Rookie',
    blurb: 'Help arrives late and the closeouts are soft. Room to learn the release.',
    decision: 0.45, helpSpeed: 0.55, patience: 0.4, closeout: 0.55,
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    blurb: 'An honest game. The defence rotates, and a bad shot is punished.',
    decision: 0.68, helpSpeed: 0.8, patience: 0.7, closeout: 0.8,
  },
  allstar: {
    key: 'allstar',
    label: 'All-Star',
    blurb: 'They find the open man and they are already there when you drive.',
    decision: 0.85, helpSpeed: 1.0, patience: 0.88, closeout: 1.0,
  },
  legend: {
    key: 'legend',
    label: 'Legend',
    blurb: 'Every rotation on time, every mistake taken. You will have to run offence.',
    decision: 0.96, helpSpeed: 1.15, patience: 1.0, closeout: 1.15,
  },
};

export const DIFFICULTY_ORDER: DifficultyKey[] = ['rookie', 'pro', 'allstar', 'legend'];
