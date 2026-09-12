import { FIELD } from '../data/constants';
import type { MatchPlayer } from './types';

/* ---------------------------------------------------------------------------
 * REPLAY BUFFER
 *
 * A fixed-size circular buffer of flat Float32Arrays. Nothing is allocated
 * after construction and nothing is copied on write, so recording costs a
 * handful of array stores per sample and produces no garbage — it can run for
 * a whole game on a phone without touching the frame budget.
 *
 * At 20 Hz for 8 seconds with 20 players that is 160 samples x 84 floats,
 * about 54 KB. Playback interpolates between samples, so 20 Hz looks smooth.
 * ------------------------------------------------------------------------- */

export const REPLAY_HZ = 20;
export const REPLAY_SECONDS = 8;

/** ball: x, y, z, carried ; player: x, y, facing, pose */
const BALL_FIELDS = 4;
const PLAYER_FIELDS = 4;

export type PoseId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const POSE_TO_ID: Record<MatchPlayer['animPose'], PoseId> = {
  idle: 0, run: 1, wind: 2, throw: 3, check: 4, dive: 5, down: 6,
};
const ID_TO_POSE: MatchPlayer['animPose'][] = ['idle', 'run', 'wind', 'throw', 'check', 'dive', 'down'];

export interface ReplayFrame {
  ballX: number;
  ballY: number;
  ballZ: number;
  ballCarried: boolean;
}

export class ReplayBuffer {
  private readonly stride: number;
  private readonly capacity: number;
  private readonly data: Float32Array;
  /** Next slot to write. */
  private head = 0;
  /** How many samples are valid, capped at capacity. */
  private filled = 0;
  private acc = 0;
  readonly playerCount: number;

  constructor(playerCount: number, seconds = REPLAY_SECONDS, hz = REPLAY_HZ) {
    this.playerCount = playerCount;
    this.stride = BALL_FIELDS + playerCount * PLAYER_FIELDS;
    this.capacity = Math.max(2, Math.ceil(seconds * hz));
    this.data = new Float32Array(this.stride * this.capacity);
  }

  get length(): number {
    return this.filled;
  }

  /** Seconds of footage currently held. */
  get seconds(): number {
    return this.filled / REPLAY_HZ;
  }

  clear(): void {
    this.head = 0;
    this.filled = 0;
    this.acc = 0;
  }

  /** Call every simulation step; samples at the fixed rate on its own. */
  record(dt: number, ball: { x: number; y: number; z: number; state: string }, players: MatchPlayer[]): void {
    this.acc += dt;
    const step = 1 / REPLAY_HZ;
    if (this.acc < step) return;
    // Never sample more than a couple of times for one long frame.
    this.acc = Math.min(this.acc - step, step);

    const base = this.head * this.stride;
    const d = this.data;
    d[base] = ball.x;
    d[base + 1] = ball.y;
    d[base + 2] = ball.z;
    d[base + 3] = ball.state === 'carried' ? 1 : 0;
    for (let i = 0; i < this.playerCount; i++) {
      const p = players[i];
      const o = base + BALL_FIELDS + i * PLAYER_FIELDS;
      d[o] = p.x;
      d[o + 1] = p.y;
      d[o + 2] = p.facing;
      d[o + 3] = POSE_TO_ID[p.animPose];
    }
    this.head = (this.head + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  /** Index of the sample `n` steps back from the newest (0 = newest). */
  private slot(n: number): number {
    return (this.head - 1 - n + this.capacity * 2) % this.capacity;
  }

  /**
   * Writes the state at `t` seconds into the clip onto the live entities.
   * `t` runs from 0 (start of the clip) to `duration`. Interpolates between
   * samples so playback is smooth at any speed.
   */
  apply(t: number, duration: number, players: MatchPlayer[], ball: ReplayFrame): void {
    if (this.filled === 0) return;
    const total = Math.min(this.filled, Math.ceil(duration * REPLAY_HZ));
    const pos = Math.max(0, Math.min(total - 1, t * REPLAY_HZ));
    const i0 = Math.floor(pos);
    const i1 = Math.min(total - 1, i0 + 1);
    const f = pos - i0;

    // Newest sample is 0 steps back, so walking forward through the clip means
    // walking backwards through the ring.
    const a = this.slot(total - 1 - i0) * this.stride;
    const b = this.slot(total - 1 - i1) * this.stride;
    const d = this.data;
    const lerp = (x: number, y: number) => x + (y - x) * f;

    ball.ballX = lerp(d[a], d[b]);
    ball.ballY = lerp(d[a + 1], d[b + 1]);
    ball.ballZ = lerp(d[a + 2], d[b + 2]);
    ball.ballCarried = (f < 0.5 ? d[a + 3] : d[b + 3]) > 0.5;

    const n = Math.min(this.playerCount, players.length);
    for (let i = 0; i < n; i++) {
      const p = players[i];
      const oa = a + BALL_FIELDS + i * PLAYER_FIELDS;
      const ob = b + BALL_FIELDS + i * PLAYER_FIELDS;
      p.x = lerp(d[oa], d[ob]);
      p.y = lerp(d[oa + 1], d[ob + 1]);
      // Facing is an angle: interpolate the short way round.
      const fa = d[oa + 2];
      let delta = d[ob + 2] - fa;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      p.facing = fa + delta * f;
      p.animPose = ID_TO_POSE[d[oa + 3]] ?? 'idle';
      // Keep the run cycle moving so legs animate during playback.
      p.animPhase += 0.12;
      p.vx = 0;
      p.vy = 0;
    }
  }

  /** Approximate memory footprint, for the performance notes. */
  get bytes(): number {
    return this.data.byteLength;
  }
}

/* ---------------------------------------------------------------------------
 * REPLAY CAMERAS
 *
 * A goal replay that always frames the ball the same way stops being worth
 * watching after the second one. These are seven framings of the same recorded
 * footage — the clip is identical, the camera is not.
 *
 * The functions are pure: a subject (where the ball, the shooter, the beaten
 * keeper and the cage are, right now in the clip) goes in, a camera target
 * comes out. That keeps them testable without a canvas, and keeps the choice
 * out of the simulation's random stream so replays never change what happens
 * next on the field.
 * ------------------------------------------------------------------------- */

export type ReplayAngle =
  | 'broadcast' | 'sideline' | 'shooter' | 'behind' | 'goalie' | 'ball' | 'closeup';

export const REPLAY_ANGLES: readonly ReplayAngle[] =
  ['broadcast', 'sideline', 'shooter', 'behind', 'goalie', 'ball', 'closeup'];

/** Shown on the REC tag so the viewer knows what they are looking at. */
export const ANGLE_LABELS: Record<ReplayAngle, string> = {
  broadcast: 'Broadcast',
  sideline: 'Sideline',
  shooter: 'Shooter cam',
  behind: 'End line',
  goalie: 'Goalie cam',
  ball: 'Ball cam',
  closeup: 'Close up',
};

/** Who and what the current clip is about. Set when the goal is scored. */
export interface ReplayCut {
  scorer: MatchPlayer | null;
  keeper: MatchPlayer;
  goalX: number;
  goalY: number;
}

/** Live positions during playback — the buffer writes history onto the entities. */
export interface ReplaySubject {
  ballX: number;
  ballY: number;
  shooterX: number;
  shooterY: number;
  goalieX: number;
  goalieY: number;
  goalX: number;
  goalY: number;
  /** 0..1 through the clip. */
  t: number;
  /** True once playback has dropped into slow motion for the finish. */
  slow: boolean;
}

export interface ReplayCameraShot {
  /** World point to keep centred. */
  x: number;
  y: number;
  /** 1 = no crop. The renderer crops the buffer, so this stays modest. */
  zoom: number;
  /** Camera follow rate; higher is snappier. */
  rate: number;
}

/** Cropping past this turns the pixel grid to mush. */
export const MAX_REPLAY_ZOOM = 1.95;

/**
 * Picks the framing for a goal. Deterministic in the game seed and the goal
 * number — the same goal always replays the same way — and never the same
 * framing twice running, which is the whole point.
 */
export function pickAngle(seed: number, index: number, previous?: ReplayAngle | null): ReplayAngle {
  let h = (Math.abs(Math.trunc(seed)) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  const pool = previous ? REPLAY_ANGLES.filter((a) => a !== previous) : REPLAY_ANGLES;
  return pool[h % pool.length];
}

const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

export function replayCamera(angle: ReplayAngle, s: ReplaySubject): ReplayCameraShot {
  const t = s.t < 0 ? 0 : s.t > 1 ? 1 : s.t;
  // Squared, so the clip opens on a wide frame and tightens late.
  const push = t * t;
  const finish = s.slow ? 1 : 0;
  // Whichever end the cage is at, this is the direction of the end line.
  const out = s.goalX >= FIELD.centerX ? 1 : -1;
  const tight = (base: number, gain: number): number =>
    Math.min(MAX_REPLAY_ZOOM, base + push * gain + finish * 0.12);

  switch (angle) {
    // Pulled back, ball and cage both in frame: the angle a broadcast opens on.
    case 'broadcast':
      return {
        x: mix(s.ballX, s.goalX, 0.22 + finish * 0.34),
        y: mix(s.ballY, s.goalY, 0.18 + finish * 0.34),
        zoom: tight(1.04, 0.18),
        rate: 4,
      };
    // Sat down the near touchline, so play runs across the frame rather than
    // through the middle of it.
    case 'sideline': {
      const near = s.ballY < FIELD.centerY ? 5 : FIELD.width - 5;
      return {
        x: mix(s.ballX, s.goalX, 0.12 + finish * 0.4),
        y: mix(mix(s.ballY, near, 0.3), s.goalY, finish * 0.5),
        zoom: tight(1.26, 0.2),
        rate: 5,
      };
    }
    // Stays with the man who scored it, drifting onto the ball as it leaves him.
    case 'shooter':
      return {
        x: mix(s.shooterX, s.ballX, 0.3 + finish * 0.45),
        y: mix(s.shooterY, s.ballY, 0.3 + finish * 0.45),
        zoom: tight(1.38, 0.22),
        rate: 7,
      };
    // Behind the cage looking back up the field.
    case 'behind':
      return {
        x: mix(s.goalX + out * 2.5, s.ballX, 0.24 * (1 - finish)),
        y: mix(s.goalY, s.ballY, 0.3 * (1 - finish)),
        zoom: tight(1.42, 0.2),
        rate: 5,
      };
    // Over the keeper's shoulder: the ball comes at the camera.
    case 'goalie':
      return {
        x: mix(s.goalieX, s.ballX, 0.32 * (1 - finish * 0.5)),
        y: mix(s.goalieY, s.ballY, 0.32 * (1 - finish * 0.5)),
        zoom: tight(1.56, 0.22),
        rate: 8,
      };
    // Hard in on the finish.
    case 'closeup':
      return {
        x: mix(s.ballX, s.goalX, finish * 0.5),
        y: mix(s.ballY, s.goalY, finish * 0.5),
        zoom: tight(1.5, 0.3),
        rate: 10,
      };
    case 'ball':
    default:
      return {
        x: mix(s.ballX, s.goalX, finish * 0.25),
        y: mix(s.ballY, s.goalY, finish * 0.25),
        zoom: tight(1.18, 0.24),
        rate: 9,
      };
  }
}
