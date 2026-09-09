/** Field geometry, in YARDS. Origin is the top-left corner of the playing field.
 *  X runs goal-to-goal (length), Y runs sideline-to-sideline (width).
 *  Dimensions follow NFHS/boys' field spec so the pitch reads as real lacrosse. */
export const FIELD = {
  length: 110,
  width: 60,
  /** Goal line X positions (goals sit 15 yd off each end line). */
  goalLineHome: 15,
  goalLineAway: 95,
  centerX: 55,
  centerY: 30,
  /** Restraining lines, 20 yd from each goal line. */
  restrainHome: 35,
  restrainAway: 75,
  /** Goal mouth is 6 ft wide = 2 yd. */
  goalWidth: 2,
  /** Crease radius, 9 ft = 3 yd. */
  creaseRadius: 3,
  /** Wing lines sit 10 yd either side of the center line, 10 yd in from each sideline. */
  wingOffset: 10,
};

export const homeGoal = { x: FIELD.goalLineHome, y: FIELD.centerY };
export const awayGoal = { x: FIELD.goalLineAway, y: FIELD.centerY };

/** Which goal a side ATTACKS. Home attacks the away goal (right), away attacks left. */
export function attackingGoal(side: Side) {
  return side === 'home' ? awayGoal : homeGoal;
}
export function defendingGoal(side: Side) {
  return side === 'home' ? homeGoal : awayGoal;
}
/** +1 if this side moves toward increasing X when attacking. */
export function attackDir(side: Side): 1 | -1 {
  return side === 'home' ? 1 : -1;
}

export type Side = 'home' | 'away';
export const otherSide = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export type Position = 'A' | 'M' | 'D' | 'G' | 'FO';
export const POSITION_LABEL: Record<Position, string> = {
  A: 'Attack',
  M: 'Midfield',
  D: 'Defense',
  G: 'Goalie',
  FO: 'FOGO',
};

/** Physics + feel tuning. All speeds are yards/second unless noted. */
export const SIM = {
  /**
   * Where the physical scale is anchored. Attribute ratings are universal
   * across the whole sport (see levels.ts), so a high schooler sits near 57 and
   * a professional near 93 — a far wider spread than when every level was rated
   * against its own peers. The centre and the per-point rates are set together
   * so that a high school game runs at exactly the speed it always has, while
   * the gap up to the professional game stays the same size it was.
   */
  ratingCentre: 35,
  /**
   * The par rating the shooting, shot-selection and save models were tuned
   * against. Everything that asks "how good is this game compared with the one
   * I was balanced on?" measures from here — the keeper re-centring in Match,
   * and the shot-quality and shot-greed curves in ai.ts. It is a single
   * constant precisely so those three can never drift apart.
   */
  parReference: 62,
  /** Base run speed at the centre rating. A 99 lands near 9.4 yd/s. */
  baseSpeed: 6.4,
  speedPerRating: 0.047,
  sprintMultiplier: 1.32,
  /** How fast a player reaches target velocity (higher = snappier). */
  accelBase: 16,
  accelPerRating: 0.101,
  turnRate: 11,

  /** Air drag while the ball is off the ground. */
  ballFriction: 0.16,
  ballGroundFriction: 3.4,
  passSpeedMin: 21,
  passSpeedMax: 34,
  shotSpeedMin: 24,
  shotSpeedMax: 48,
  /** Radius within which a player can scoop/catch a loose ball. */
  catchRadius: 1.15,
  /** Extra reach when the ball is travelling toward you (interception window). */
  interceptRadius: 1.5,

  checkRange: 2.1,
  checkCooldown: 0.7,
  checkStunTime: 0.55,

  dodgeDuration: 0.36,
  dodgeCooldown: 0.75,
  dodgeStamina: 14,
  dodgeSpeedBoost: 1.85,

  sprintStaminaDrain: 13,
  staminaRegen: 11,
  lowStaminaThreshold: 22,

  shotChargeTime: 0.85,

  /** Downward acceleration on the ball, yards/s^2. */
  gravity: 10.7,
  /** Seconds after a goal before the faceoff screen. */
  goalCelebration: 2.0,

  /** A shot clock keeps the game moving (arcade-friendly stall rule). */
  shotClock: 35,
};

export const GAME_LENGTHS = {
  short: { label: 'Short', quarterSeconds: 120, blurb: '4 x 2:00 — about 9 minutes' },
  standard: { label: 'Standard', quarterSeconds: 180, blurb: '4 x 3:00 — about 13 minutes' },
  long: { label: 'Long', quarterSeconds: 270, blurb: '4 x 4:30 — about 20 minutes' },
} as const;
export type GameLengthKey = keyof typeof GAME_LENGTHS;

export const QUARTERS = 4;
