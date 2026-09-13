import type { Rng } from '../../core/rng';
import { COURT, type Side, type Vec3, attackRim, floorDist } from './court';

/* ---------------------------------------------------------------------------
 * THE BALL
 * ---------------------------------------------------------------------------
 * A basketball is not a lacrosse ball with a different sprite, and this is where
 * that stops being a slogan.
 *
 * The target is ten feet in the air and eighteen inches across, mounted on a
 * ring that can be struck from underneath, from the side and from behind. So the
 * ball needs a genuine third axis, and the interesting physics all happens in a
 * two-foot cube around the rim: front rim, back iron, in and out, the soft
 * shooter's bounce that drops, the flat one that hammers away. Rebounding — a
 * whole phase of the sport lacrosse has no equivalent of — is downstream of
 * getting those collisions right, because where a miss goes decides who gets it.
 *
 * Units are FEET and SECONDS throughout, matching court.ts.
 * ------------------------------------------------------------------------- */

/** Feet per second squared. Real gravity, because the arcs have to look right. */
export const GRAVITY = 32.17;
/** A basketball is 9.5in across. */
export const BALL_RADIUS = 0.4;
/** How much speed survives a bounce off the floor. */
const FLOOR_RESTITUTION = 0.74;
/** The rim is stiffer than the floor but far from perfectly elastic. */
const RIM_RESTITUTION = 0.52;
const BOARD_RESTITUTION = 0.55;
/** Rolling and air drag, per second. */
const FLOOR_FRICTION = 1.9;
const AIR_DRAG = 0.06;

export type BallState =
  /** In a player's hands: the ball follows them and cannot be stolen cleanly. */
  | 'held'
  /** Being dribbled: bouncing beside the handler, and pokeable. */
  | 'dribble'
  | 'pass'
  | 'shot'
  /** Live on the floor or in the air with nobody's name on it. */
  | 'loose'
  /** Dead: a whistle has blown and the ball is waiting to be put back in play. */
  | 'dead';

/** Why a shot went up, kept with the ball so the result can be scored properly. */
export interface ShotMeta {
  shooterId: string;
  side: Side;
  /** 2 or 3, decided from where the feet were. */
  value: 2 | 3;
  /** Floor distance at release. */
  distance: number;
  /** True if the model decided this one goes in. */
  intendedMake: boolean;
  /** Set once the ball has passed through or been rebounded, so it scores once. */
  resolved: boolean;
  /** Who fed him, if the pass was recent enough to be an assist. */
  assistId: string | null;
  /** A dunk or layup at the rim, which is finished rather than shot. */
  kind: 'jumper' | 'three' | 'layup' | 'dunk' | 'freeThrow';
  /**
   * Whether the shot was taken from the paint, recorded AT RELEASE. Asking where
   * the shooter is standing when the ball finally drops credits a
   * twenty-seven-foot three as a paint bucket, because by then he has run in to
   * rebound it — which is how the box score came to report more points in the
   * paint than the team scored in total.
   */
  fromPaint: boolean;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: BallState;
  /** Player id holding or dribbling it. */
  carrier: string | null;
  /** Last player to have it, for turnovers, rebounds and assists. */
  lastTouch: string | null;
  /** Side that last had possession, so a loose ball can be credited. */
  lastSide: Side | null;
  shot: ShotMeta | null;
  /** Seconds since the state last changed, for pass-interception windows. */
  age: number;
  /** Dribble phase, 0..1, driving the bounce height. */
  dribblePhase: number;
  /** Who a pass is meant for — a receiver leads toward it. */
  target: string | null;
  /** True once a shot has hit the ring or the board: it can no longer be a swish. */
  touchedIron: boolean;
}

export function createBall(): Ball {
  return {
    x: COURT.centerX, y: COURT.centerY, z: BALL_RADIUS,
    vx: 0, vy: 0, vz: 0,
    state: 'dead',
    carrier: null, lastTouch: null, lastSide: null,
    shot: null, age: 0, dribblePhase: 0, target: null, touchedIron: false,
  };
}

/** What happened to the ball during one step, for sound, scoring and the AI. */
export interface BallEvents {
  /** Passed cleanly down through the hoop. */
  through: boolean;
  /** Struck the ring. */
  rim: boolean;
  /** Struck the backboard. */
  board: boolean;
  /** Hit the floor. */
  floor: boolean;
  /** Left the court. */
  out: boolean;
}

const noEvents = (): BallEvents => ({
  through: false, rim: false, board: false, floor: false, out: false,
});

/* ------------------------------------------------------------------ launching */

/**
 * Put a shot up on a real arc toward a chosen point.
 *
 * The flight time sets the arc, and it grows with distance: a floater from six
 * feet hangs for well under a second, a deep three for the better part of one and
 * a half. Solving for the launch velocity from a time rather than picking an
 * angle keeps the apex sensible at every distance and can never produce the flat
 * line-drive three that gives a physics engine away.
 */
export function launchAt(
  ball: Ball, from: Vec3, target: Vec3, extraArc = 0,
): void {
  const dist = floorDist(from.x, from.y, target.x, target.y);
  const time = Math.max(0.42, 0.52 + dist * 0.0295 + extraArc);
  ball.x = from.x;
  ball.y = from.y;
  ball.z = from.z;
  ball.vx = (target.x - from.x) / time;
  ball.vy = (target.y - from.y) / time;
  ball.vz = (target.z - from.z) / time + 0.5 * GRAVITY * time;
  ball.age = 0;
  ball.touchedIron = false;
}

/** A pass: flatter and faster than a shot, and it still has to clear traffic. */
export function launchPass(
  ball: Ball, from: Vec3, target: Vec3, speed: number, targetId: string | null,
): void {
  const dist = floorDist(from.x, from.y, target.x, target.y);
  const time = Math.max(0.16, dist / Math.max(6, speed));
  ball.x = from.x;
  ball.y = from.y;
  ball.z = from.z;
  ball.vx = (target.x - from.x) / time;
  ball.vy = (target.y - from.y) / time;
  // A touch of loft so a long pass is not a flat laser, and so it can be picked.
  ball.vz = (target.z - from.z) / time + 0.5 * GRAVITY * time * 0.55;
  ball.state = 'pass';
  ball.target = targetId;
  ball.carrier = null;
  ball.shot = null;
  ball.age = 0;
  ball.touchedIron = false;
}

/* ------------------------------------------------------------------ stepping */

/** Rim centre nearest the ball, and which end it belongs to. */
function nearestRim(ball: Ball): { rim: Vec3; side: Side } {
  const home = attackRim('home');
  const away = attackRim('away');
  return Math.abs(ball.x - home.x) < Math.abs(ball.x - away.x)
    ? { rim: home, side: 'home' }
    : { rim: away, side: 'away' };
}

/**
 * One step of free flight: gravity, the rim, the board, the floor, the lines.
 * Only called when the ball is nobody's — held and dribbled balls follow their
 * handler instead.
 */
export function stepBall(ball: Ball, dt: number, rng: Rng): BallEvents {
  const ev = noEvents();
  if (ball.state === 'held' || ball.state === 'dead') return ev;

  ball.age += dt;

  const prevZ = ball.z;
  const prevX = ball.x;
  const prevY = ball.y;

  /* Integrate, and integrate EXACTLY.
   *
   * A shot is aimed by solving for the velocity that puts the ball at a chosen
   * point after a chosen flight time, so any error between that solution and
   * what the integrator actually does lands the ball somewhere else. Plain
   * Euler drops the ball about four inches short over a twenty-four foot
   * three, and air drag took another foot and a half off the top — so every
   * shot in the game arrived on the front rim, and nothing ever went in.
   *
   * Stepping the height with the AVERAGE velocity over the step is exact for
   * constant acceleration, and a shot in flight is not dragged: a real
   * basketball loses a couple of per cent over a jump shot, which is well
   * inside the four inches of clearance the ring gives it, and paying for that
   * realism with a shot model that cannot hit what it aims at is a bad trade.
   * A loose ball and a pass still feel the air.
   */
  const vzMid = ball.vz - 0.5 * GRAVITY * dt;
  ball.vz -= GRAVITY * dt;
  if (ball.state !== 'shot' && ball.z > BALL_RADIUS + 0.01) {
    const drag = Math.max(0, 1 - AIR_DRAG * dt);
    ball.vx *= drag;
    ball.vy *= drag;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += vzMid * dt;

  const { rim } = nearestRim(ball);

  /* --- the backboard. Checked before the ring: a shot long off the board comes
   * back toward the shooter, which is where half of all rebounds go. */
  const boardX = rim.x > COURT.centerX
    ? COURT.length - COURT.boardInset
    : COURT.boardInset;
  const towardBoard = rim.x > COURT.centerX ? 1 : -1;
  const crossedBoard = towardBoard === 1
    ? prevX <= boardX && ball.x + BALL_RADIUS >= boardX
    : prevX >= boardX && ball.x - BALL_RADIUS <= boardX;
  if (crossedBoard
      && ball.z + BALL_RADIUS >= COURT.boardBottom && ball.z - BALL_RADIUS <= COURT.boardTop
      && Math.abs(ball.y - COURT.centerY) <= COURT.boardWidth / 2 + BALL_RADIUS) {
    ball.x = boardX - towardBoard * (BALL_RADIUS + 0.02);
    ball.vx = -ball.vx * BOARD_RESTITUTION;
    ball.vy *= 0.86;
    ball.vz *= 0.9;
    ev.board = true;
    ball.touchedIron = true;
    if (ball.state === 'pass') ball.state = 'loose';
  }

  /* --- the ring.
   *
   * The rim is a torus and has to be treated as one. The first version tested a
   * horizontal band at roughly rim height, which fired while the ball was still
   * a foot ABOVE the ring and heading for the middle of it: every shot in the
   * game clanged off the front iron, and the league shot six per cent.
   *
   * Two tests, and between them they give front rim, back iron, the in-and-out,
   * and the clean drop, without any of them being special-cased:
   *
   *  1. CROSSING THE PLANE. Interpolate where the ball actually crossed z = 10.
   *     A basketball is 9.5in across and the ring is 18in, so the centre has
   *     about four inches of clearance on each side — and at twenty feet a
   *     second the ball moves further than that in one step, which is exactly
   *     why the crossing point has to be interpolated rather than sampled.
   *  2. TOUCHING THE RING ANYWHERE ELSE. The distance from the ball's centre to
   *     the ring itself, in three dimensions, which catches a ball that clips
   *     the iron on the way up or comes in flat off the glass.
   */
  const dRim = floorDist(ball.x, ball.y, rim.x, rim.y);
  const clearance = COURT.rimRadius - BALL_RADIUS;
  let ringHit = false;

  if (prevZ > rim.z && ball.z <= rim.z && ball.vz < 0) {
    const span = prevZ - ball.z;
    const t = span > 1e-6 ? (prevZ - rim.z) / span : 0;
    const cx = prevX + (ball.x - prevX) * t;
    const cy = prevY + (ball.y - prevY) * t;
    const dCross = floorDist(cx, cy, rim.x, rim.y);
    if (dCross <= clearance) {
      ev.through = true;
    } else if (dCross <= COURT.rimRadius + BALL_RADIUS) {
      ringHit = true;
    }
  }

  if (!ev.through && !ringHit) {
    // Anywhere else on the ring: the real three-dimensional distance from the
    // ball's centre to the nearest point of the circle.
    const radial = dRim - COURT.rimRadius;
    const vert = ball.z - rim.z;
    if (Math.hypot(radial, vert) <= BALL_RADIUS) ringHit = true;
  }

  if (ringHit) {
    // Bounce off the nearest point of the ring. The normal has a radial part and
    // a vertical part, which is what makes a ball off the front rim come back
    // toward the shooter and one off the back iron carry long.
    const nxy = dRim < 1e-4 ? 1 : (ball.x - rim.x) / dRim;
    const nyy = dRim < 1e-4 ? 0 : (ball.y - rim.y) / dRim;
    const radial = dRim - COURT.rimRadius;
    const vert = ball.z - rim.z;
    const len = Math.max(1e-4, Math.hypot(radial, vert));
    const nr = radial / len;
    const nz = vert / len;
    const nx = nxy * nr;
    const ny = nyy * nr;

    // Push clear of the ring so the next step cannot re-collide.
    const push = BALL_RADIUS - len + 0.02;
    ball.x += nx * push;
    ball.y += ny * push;
    ball.z += nz * push;

    const along = ball.vx * nx + ball.vy * ny + ball.vz * nz;
    if (along < 0) {
      ball.vx -= (1 + RIM_RESTITUTION) * along * nx;
      ball.vy -= (1 + RIM_RESTITUTION) * along * ny;
      ball.vz -= (1 + RIM_RESTITUTION) * along * nz;
    }
    // Iron is unpredictable, and the unpredictability is the point: it is what
    // makes a rebound worth contesting rather than worth calculating.
    ball.vx += rng.range(-1.4, 1.4);
    ball.vy += rng.range(-1.4, 1.4);
    ball.vz += rng.range(0.2, 1.8);
    ev.rim = true;
    ball.touchedIron = true;
    if (ball.state === 'pass') ball.state = 'loose';
  }

  /* --- the floor */
  if (ball.z <= BALL_RADIUS) {
    ball.z = BALL_RADIUS;
    if (ball.vz < -0.4) {
      ball.vz = -ball.vz * FLOOR_RESTITUTION;
      ev.floor = true;
    } else {
      ball.vz = 0;
    }
    const f = Math.max(0, 1 - FLOOR_FRICTION * dt);
    ball.vx *= f;
    ball.vy *= f;
    if (ball.state === 'pass' || ball.state === 'shot') ball.state = 'loose';
  }

  /* --- the lines. Out of bounds is judged on the ball, as it is in the sport. */
  if (ball.x < -0.2 || ball.x > COURT.length + 0.2
      || ball.y < -0.2 || ball.y > COURT.width + 0.2) {
    ev.out = true;
  }

  return ev;
}

/**
 * The dribble.
 *
 * Worth simulating rather than animating: the ball spends real time near the
 * floor and out in front of the handler, which is what makes a poke-away a
 * matter of position and timing rather than a dice roll on contact.
 */
/** @returns true on the frame the ball touches the floor, so it can be heard. */
export function stepDribble(
  ball: Ball, handX: number, handY: number, facing: number, speed: number, dt: number,
): boolean {
  // A moving handler pushes the ball further out in front of himself.
  const lead = 0.9 + Math.min(1.5, speed * 0.16);
  ball.x = handX + Math.cos(facing) * lead;
  ball.y = handY + Math.sin(facing) * lead;
  // Faster dribble when moving, and a low hard one when really moving.
  const rate = 2.1 + Math.min(2.6, speed * 0.3);
  const was = ball.dribblePhase;
  ball.dribblePhase = (ball.dribblePhase + rate * dt) % 1;
  // The phase wrapping past 1 is the ball reaching the floor.
  const bounced = ball.dribblePhase < was;
  const peak = Math.max(1.6, 3.4 - speed * 0.14);
  // |sin| gives the bounce its shape: quick at the floor, hanging at the top.
  ball.z = BALL_RADIUS + Math.abs(Math.sin(ball.dribblePhase * Math.PI)) * (peak - BALL_RADIUS);
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  return bounced;
}

/** How exposed the ball is right now: low in the dribble is where it gets taken. */
export function dribbleExposure(ball: Ball): number {
  if (ball.state !== 'dribble') return 0;
  const low = 1 - Math.min(1, (ball.z - BALL_RADIUS) / 2.2);
  return low;
}

/** Follows the handler's hands while held. */
export function stepHeld(ball: Ball, x: number, y: number, z: number): void {
  ball.x = x;
  ball.y = y;
  ball.z = z;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
}
