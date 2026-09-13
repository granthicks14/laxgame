/* ---------------------------------------------------------------------------
 * THE COURT
 * ---------------------------------------------------------------------------
 * Everything in FEET, which is how basketball is actually measured and argued
 * about — a fifteen-foot free throw line, a three-point line at twenty-two in the
 * corners, a rim ten feet up. Using yards here to match the lacrosse field would
 * mean converting every number a reader already knows.
 *
 * The axes: X runs baseline to baseline along the length, Y runs sideline to
 * sideline, and Z is height off the floor. Z matters in a way it never did for
 * lacrosse: the target is ten feet in the air, so a shot is an arc through space
 * rather than a line across a plane, and the rim can be hit from above, from
 * below and from the side.
 *
 * Dimensions follow the NBA/FIBA-scale professional court, because that is the
 * geometry the three-point shot and the driving lane are balanced around.
 * ------------------------------------------------------------------------- */

export const COURT = {
  /** Baseline to baseline. */
  length: 94,
  /** Sideline to sideline. */
  width: 50,
  centerX: 47,
  centerY: 25,

  /** Centre-circle radius. */
  centerCircle: 6,

  /**
   * The rim's centre, measured in from the baseline. The backboard face sits 4ft
   * from the baseline and the rim's centre 15in beyond it.
   */
  rimInset: 5.25,
  /** Rim height. The whole reason this sport needs a Z axis. */
  rimHeight: 10,
  /** Rim radius — 18in across, so 0.75ft. */
  rimRadius: 0.75,
  /** Backboard: 6ft wide, 3.5ft tall, its face 4ft in from the baseline. */
  boardInset: 4,
  boardWidth: 6,
  boardBottom: 9,
  boardTop: 12.5,

  /** The key (paint): 16ft wide, 19ft deep from the baseline. */
  keyWidth: 16,
  keyDepth: 19,
  /** Free throw line, 15ft from the backboard face. */
  freeThrowX: 19,
  /** Radius of the arc at the top of the key. */
  freeThrowCircle: 6,

  /** Three-point line: 23.75ft arc from the rim centre, 22ft straight in the corners. */
  threeRadius: 23.75,
  /** How far in from each sideline the corner three sits. */
  cornerInset: 3,
  /** Where the arc meets the straight corner section, measured from the baseline. */
  cornerBreakX: 14,

  /** Restricted area under the basket. */
  restrictedRadius: 4,
} as const;

export type Side = 'home' | 'away';
export const otherSide = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The basket a side is attacking. Home attacks the far end (increasing X). */
export function attackRim(side: Side): Vec3 {
  return side === 'home'
    ? { x: COURT.length - COURT.rimInset, y: COURT.centerY, z: COURT.rimHeight }
    : { x: COURT.rimInset, y: COURT.centerY, z: COURT.rimHeight };
}

export function defendRim(side: Side): Vec3 {
  return attackRim(side === 'home' ? 'away' : 'home');
}

/** +1 if this side moves toward increasing X when attacking. */
export function attackDir(side: Side): 1 | -1 {
  return side === 'home' ? 1 : -1;
}

/** Distance on the floor, ignoring height. */
export function floorDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** How far a spot is from the rim it is shooting at, along the floor. */
export function shotDistance(x: number, y: number, side: Side): number {
  const rim = attackRim(side);
  return floorDist(x, y, rim.x, rim.y);
}

/**
 * Is a shot from here worth three?
 *
 * The line is an arc from the rim except in the corners, where it runs straight
 * so it can stay inside the sideline. Getting that right is not pedantry: the
 * corner three is the shortest three on the floor, and an engine that models the
 * line as a pure circle either deletes the corner three or pushes it out of
 * bounds.
 */
export function isThree(x: number, y: number, side: Side): boolean {
  const rim = attackRim(side);
  const fromBaseline = side === 'home' ? COURT.length - x : x;
  if (fromBaseline <= COURT.cornerBreakX) {
    // Corner: the straight section, measured from the sideline.
    return y <= COURT.cornerInset + 0.001 || y >= COURT.width - COURT.cornerInset - 0.001;
  }
  return floorDist(x, y, rim.x, rim.y) >= COURT.threeRadius;
}

export const shotValue = (x: number, y: number, side: Side): 2 | 3 =>
  (isThree(x, y, side) ? 3 : 2);

/** Is this spot inside the attacking key? Used for the paint and three seconds. */
export function inPaint(x: number, y: number, side: Side): boolean {
  const fromBaseline = side === 'home' ? COURT.length - x : x;
  return fromBaseline >= 0 && fromBaseline <= COURT.keyDepth
    && Math.abs(y - COURT.centerY) <= COURT.keyWidth / 2;
}

/** Is this spot in the side's own half? Backcourt violations need this. */
export function inOwnHalf(x: number, side: Side): boolean {
  return side === 'home' ? x < COURT.centerX : x > COURT.centerX;
}

/** Clamp a position to the floor, with a small margin so nobody stands on a line. */
export function clampToCourt(x: number, y: number, margin = 0.6): { x: number; y: number } {
  return {
    x: Math.min(COURT.length - margin, Math.max(margin, x)),
    y: Math.min(COURT.width - margin, Math.max(margin, y)),
  };
}

export function outOfBounds(x: number, y: number): boolean {
  return x < 0 || x > COURT.length || y < 0 || y > COURT.width;
}

/**
 * Where an inbound is taken after the ball goes out at (x, y). Real basketball
 * puts it at the nearest point on the boundary, moved clear of the baseline
 * under the basket.
 */
export function inboundSpot(x: number, y: number): { x: number; y: number } {
  let ix = Math.min(COURT.length - 1.5, Math.max(1.5, x));
  let iy = Math.min(COURT.width - 1.5, Math.max(1.5, y));
  const dLeft = x;
  const dRight = COURT.length - x;
  const dTop = y;
  const dBottom = COURT.width - y;
  const nearest = Math.min(dLeft, dRight, dTop, dBottom);
  if (nearest === dTop) iy = 1.2;
  else if (nearest === dBottom) iy = COURT.width - 1.2;
  else if (nearest === dLeft) { ix = 1.2; iy = Math.max(6, Math.min(COURT.width - 6, iy)); }
  else { ix = COURT.length - 1.2; iy = Math.max(6, Math.min(COURT.width - 6, iy)); }
  return { x: ix, y: iy };
}
