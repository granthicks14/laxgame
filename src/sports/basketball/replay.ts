import { COURT } from './court';
import type { Pose } from './types';

/* ---------------------------------------------------------------------------
 * THE REPLAY BUFFER
 * ---------------------------------------------------------------------------
 * The last few seconds of a basketball game, kept so the best of them can be
 * watched again.
 *
 * THE SHAPE OF IT IS THE POINT. A circular buffer of one flat Float32Array,
 * allocated once and never grown. Recording is a handful of array stores, it
 * produces NO GARBAGE, and it can run for forty minutes on a phone without ever
 * appearing in a frame budget. A ring of objects would allocate a hundred and
 * twenty small objects a second and hand the collector a bill in the fourth
 * quarter, which is exactly when the game is least able to pay it.
 *
 * At 20Hz for five seconds with ten players that is a hundred samples of a
 * hundred and thirty-four floats — about 54KB, once, for the life of the game.
 * Playback interpolates between samples, so twenty a second looks smooth; only
 * the pose is snapped, because a pose is a state and half a shooting motion is
 * not a shape anybody has.
 * ------------------------------------------------------------------------- */

export const REPLAY_HZ = 20;
export const REPLAY_SECONDS = 5;

/** x, y, z, state. */
const BALL_FIELDS = 4;
/**
 * x, y, z, vx, vy, pose, lean, leanDir, stride, armAngleL, armAngleR,
 * armReachL, armReachR.
 */
const PLAYER_FIELDS = 13;

/* Poses go in and out as numbers, because the buffer is floats. The order is
 * fixed forever: a new pose is appended, never inserted. */
const POSES: Pose[] = [
  'idle', 'run', 'dribble', 'gather', 'shoot', 'layup', 'dunk', 'pass',
  'defend', 'jump', 'rebound', 'screen', 'celebrate', 'down',
];
const POSE_ID = new Map<Pose, number>(POSES.map((p, i) => [p, i]));

/** Ball states, same rule. */
const STATES = ['held', 'dribble', 'pass', 'shot', 'loose', 'dead'] as const;
export type ReplayBallState = (typeof STATES)[number];
const STATE_ID = new Map<string, number>(STATES.map((s, i) => [s, i]));

/** What a player looked like at one instant. */
export interface ReplayPlayer {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  pose: Pose;
  lean: number;
  leanDir: number;
  stridePhase: number;
  armAngleL: number;
  armAngleR: number;
  armReachL: number;
  armReachR: number;
}

export interface ReplayFrame {
  ball: { x: number; y: number; z: number; state: ReplayBallState };
  players: ReplayPlayer[];
}

/** What the buffer needs from a live player. Kept structural so nothing imports
 *  the engine's own types in order to be recorded. */
export interface Recordable {
  x: number; y: number; z: number; vx: number; vy: number;
  pose: Pose;
  lean: number; leanDir: number; stridePhase: number;
  armAngleL: number; armAngleR: number; armReachL: number; armReachR: number;
}

export class ReplayBuffer {
  private readonly stride: number;
  private readonly capacity: number;
  private readonly data: Float32Array;
  private head = 0;
  private filled = 0;
  private acc = 0;
  readonly playerCount: number;

  constructor(playerCount: number) {
    this.playerCount = playerCount;
    this.stride = BALL_FIELDS + playerCount * PLAYER_FIELDS;
    this.capacity = REPLAY_HZ * REPLAY_SECONDS;
    this.data = new Float32Array(this.stride * this.capacity);
  }

  /** How many seconds are actually in the buffer. */
  get seconds(): number {
    return this.filled / REPLAY_HZ;
  }

  reset(): void {
    this.head = 0;
    this.filled = 0;
    this.acc = 0;
  }

  /**
   * Take a sample, at most `REPLAY_HZ` times a second.
   *
   * Called every frame with the frame's own dt; the accumulator decides whether
   * this one is a sample. That keeps the recording rate independent of the
   * display's, so a 120Hz phone and a 30Hz one record the same five seconds.
   */
  record(
    dt: number,
    ball: { x: number; y: number; z: number; state: string },
    players: readonly Recordable[],
  ): void {
    this.acc += dt;
    const step = 1 / REPLAY_HZ;
    if (this.acc < step) return;
    // Never more than one sample per call, however long the frame was: a tab
    // that was in the background for a minute must not fill the whole ring with
    // one instant.
    this.acc = Math.min(this.acc - step, step);

    const d = this.data;
    let i = this.head * this.stride;
    d[i++] = ball.x;
    d[i++] = ball.y;
    d[i++] = ball.z;
    d[i++] = STATE_ID.get(ball.state) ?? 5;
    for (let n = 0; n < this.playerCount; n++) {
      const p = players[n];
      if (!p) { i += PLAYER_FIELDS; continue; }
      d[i++] = p.x;
      d[i++] = p.y;
      d[i++] = p.z;
      d[i++] = p.vx;
      d[i++] = p.vy;
      d[i++] = POSE_ID.get(p.pose) ?? 0;
      d[i++] = p.lean;
      d[i++] = p.leanDir;
      d[i++] = p.stridePhase;
      d[i++] = p.armAngleL;
      d[i++] = p.armAngleR;
      d[i++] = p.armReachL;
      d[i++] = p.armReachR;
    }
    this.head = (this.head + 1) % this.capacity;
    this.filled = Math.min(this.filled + 1, this.capacity);
  }

  /**
   * Read the buffer at `t` seconds BEFORE the newest sample.
   *
   * Interpolated, except the pose and the ball's state, which are states rather
   * than quantities: half a dunk is not a shape, and half of 'shot' is not a
   * thing the ball can be doing. Returns null when the buffer does not reach
   * that far back yet, which a caller should treat as "there is no replay".
   */
  sample(t: number, into: ReplayFrame): boolean {
    if (this.filled < 3) return false;
    const back = t * REPLAY_HZ;
    if (back < 0 || back > this.filled - 1) return false;

    const newest = (this.head - 1 + this.capacity) % this.capacity;
    const exact = newest - back;
    const lo = Math.floor(exact);
    const frac = exact - lo;
    const a = ((lo % this.capacity) + this.capacity) % this.capacity;
    const b = ((lo + 1) % this.capacity + this.capacity) % this.capacity;

    const d = this.data;
    const ia = a * this.stride;
    const ib = b * this.stride;
    const mix = (o: number): number => d[ia + o] + (d[ib + o] - d[ia + o]) * frac;

    into.ball.x = mix(0);
    into.ball.y = mix(1);
    into.ball.z = mix(2);
    into.ball.state = STATES[Math.round(d[ia + 3])] ?? 'dead';

    for (let n = 0; n < this.playerCount; n++) {
      const o = BALL_FIELDS + n * PLAYER_FIELDS;
      const p = into.players[n];
      p.x = mix(o);
      p.y = mix(o + 1);
      p.z = mix(o + 2);
      p.vx = mix(o + 3);
      p.vy = mix(o + 4);
      p.pose = POSES[Math.round(d[ia + o + 5])] ?? 'idle';
      p.lean = mix(o + 6);
      /* AN ANGLE CANNOT BE AVERAGED NAIVELY. Interpolating between 179 degrees
       * and -179 spins a body the long way round, which is how a man crossing
       * the wrap point in a replay ends up pirouetting. */
      p.leanDir = mixAngle(d[ia + o + 7], d[ib + o + 7], frac);
      p.stridePhase = mixAngle(d[ia + o + 8], d[ib + o + 8], frac);
      p.armAngleL = mix(o + 9);
      p.armAngleR = mix(o + 10);
      p.armReachL = mix(o + 11);
      p.armReachR = mix(o + 12);
    }
    return true;
  }
}

function mixAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** A blank frame to read into, so playback allocates nothing either. */
export function emptyFrame(playerCount: number): ReplayFrame {
  return {
    ball: { x: COURT.centerX, y: COURT.centerY, z: 0, state: 'dead' },
    players: Array.from({ length: playerCount }, () => ({
      x: COURT.centerX, y: COURT.centerY, z: 0, vx: 0, vy: 0,
      pose: 'idle' as Pose, lean: 0, leanDir: 0, stridePhase: 0,
      armAngleL: 0, armAngleR: 0, armReachL: 0, armReachR: 0,
    })),
  };
}
