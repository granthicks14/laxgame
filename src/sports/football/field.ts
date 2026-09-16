/* ---------------------------------------------------------------------------
 * THE FIELD
 * ---------------------------------------------------------------------------
 * Everything in YARDS, because that is the only unit American football is ever
 * discussed in: a third and four, a forty-yard line, a twenty-two yard field
 * goal. Converting to feet the way basketball does would mean translating every
 * number a reader already knows.
 *
 * THE AXES, and they are chosen for the screen rather than for tradition:
 *
 *   Y runs GOAL LINE TO GOAL LINE, 0 at the home end zone's back line and 120
 *     at the away one's. The playing field is y = 10 to y = 110.
 *   X runs SIDELINE TO SIDELINE, 0 to 53.33.
 *   Z is height, and it matters for exactly two things: a pass in the air and a
 *     kick over the bar.
 *
 * Y is the long axis because the camera stands the field UP. A football field is
 * 120 by 53.3 — proportionally far longer than any screen — so laid down it
 * either shows twelve yards of width or ants. Stood up, a phone holds the full
 * width and about thirty-five yards of length, which is the whole area a play
 * happens in.
 *
 * DIRECTION. The home side attacks toward increasing y, the away side toward
 * decreasing y, and they swap at half time the way the real game does. Every
 * piece of code that needs "which way is forward" asks `attackDir`.
 * ------------------------------------------------------------------------- */

export const FIELD = {
  /** Back of one end zone to the back of the other. */
  length: 120,
  /** Sideline to sideline. NFL and college are both 53 1/3 yards. */
  width: 53.33,
  /** Ten yards deep at each end. */
  endZone: 10,
  /** The home goal line and the away goal line, in field coordinates. */
  homeGoal: 10,
  awayGoal: 110,
  centerX: 26.67,

  /** Hash marks, where the ball is spotted when a play ends outside them. */
  hashLeft: 23.58,
  hashRight: 29.75,

  /** Goalposts: uprights 18.5ft apart, crossbar 10ft up, on the end line. */
  postWidth: 6.17,
  crossbarHeight: 3.33,

  /** How far behind the line of scrimmage a quarterback sets up in the gun. */
  shotgunDepth: 5,
  /** Where the offensive line sets, relative to the ball. */
  lineSplit: 1.1,
} as const;

export type Side = 'home' | 'away';
export const otherSide = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** +1 when this side attacks up the field, -1 when it attacks down. */
export const attackDir = (s: Side): 1 | -1 => (s === 'home' ? 1 : -1);

/** The goal line this side is attacking. */
export const attackGoal = (s: Side): number => (s === 'home' ? FIELD.awayGoal : FIELD.homeGoal);

/** The goal line this side is defending. */
export const ownGoal = (s: Side): number => (s === 'home' ? FIELD.homeGoal : FIELD.awayGoal);

export interface Vec3 { x: number; y: number; z: number; }

export const clampToField = (x: number): number => Math.max(0.6, Math.min(FIELD.width - 0.6, x));

/** True when this point is off the side of the field. */
export const outOfBounds = (x: number): boolean => x < 0 || x > FIELD.width;

/** True when a ball at this y is in the end zone this side is attacking. */
export function inAttackingEndZone(y: number, side: Side): boolean {
  return side === 'home' ? y >= FIELD.awayGoal : y <= FIELD.homeGoal;
}

/** True when a ball at this y is in the end zone this side is defending. */
export function inOwnEndZone(y: number, side: Side): boolean {
  return side === 'home' ? y <= FIELD.homeGoal : y >= FIELD.awayGoal;
}

/**
 * How a spot on the field is SAID: "own 34", "opponent 12", "midfield".
 *
 * This is not decoration. A player reads the down-and-distance bar forty times a
 * game and it is how he knows whether he is in field goal range, whether a punt
 * makes sense, and whether the drive is going anywhere. Getting it wrong makes
 * the whole scoreboard unreadable.
 */
export function spotText(y: number, side: Side): string {
  const fromOwnGoal = side === 'home' ? y - FIELD.homeGoal : FIELD.awayGoal - y;
  const yard = Math.round(fromOwnGoal);
  if (yard === 50) return 'midfield';
  if (yard < 50) return `own ${Math.max(1, yard)}`;
  return `opp ${Math.max(1, 100 - yard)}`;
}

/** Yards from this spot to the goal line the side is attacking. */
export function yardsToGoal(y: number, side: Side): number {
  return side === 'home' ? FIELD.awayGoal - y : y - FIELD.homeGoal;
}

/** Distance of a field goal attempt from this spot: the snap plus the end zone. */
export function fieldGoalDistance(y: number, side: Side): number {
  // Seven yards back for the hold, plus the ten yards of end zone behind the bar.
  return yardsToGoal(y, side) + 17;
}

/** Where the ball is spotted after a play that ended out of bounds or in the middle. */
export function hashSpot(x: number): number {
  if (x < FIELD.hashLeft) return FIELD.hashLeft;
  if (x > FIELD.hashRight) return FIELD.hashRight;
  return x;
}

export const dist2 = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay);
