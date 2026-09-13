import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import type { Side } from '../data/constants';
import type { DifficultyProfile } from '../data/difficulty';

export type FaceoffStage = 'set' | 'down' | 'sweep' | 'result';
export type FaceoffResult = 'win' | 'scrum' | 'violation';

/* ---------------------------------------------------------------------------
 * The faceoff is a timing contest, and the two inputs matter in different ways:
 *
 *  - YOUR FOGO'S RATING sets how wide the clamp window is. A great faceoff man
 *    gives you a forgiving target; a poor one gives you a sliver.
 *  - YOUR TIMING sets how well you hit it. Dead centre is a clean clamp.
 *  - THE OPPONENT'S FOGO rolls a clamp quality of his own, and the better clamp
 *    wins. Two bad clamps mean a scrum at X and a live ground ball.
 *
 * The upshot: timing is what you control and it dominates, but a faceoff
 * specialist is worth having, which is the point of the rating.
 * ------------------------------------------------------------------------- */

export interface FaceoffState {
  stage: FaceoffStage;
  timer: number;
  /** 0..1 position of the sweeping clamp marker. */
  marker: number;
  markerSpeed: number;
  /** Target window, 0..1. Its width comes from the faceoff rating differential. */
  zoneStart: number;
  zoneEnd: number;
  /** Where the AI commits, 0..1 along the sweep — purely cosmetic timing. */
  aiCommit: number;
  aiDone: boolean;
  /** 0..1 quality of the opponent's clamp, rolled from his rating. */
  aiQuality: number;
  /** 0..1 quality of the other AI in an AI-vs-AI draw. */
  autoQuality: number;
  /** 0..1 quality of the human's clamp; null until he commits. */
  humanQuality: number | null;
  humanDone: boolean;
  result: FaceoffResult | null;
  winner: Side | null;
  /** Human-readable outcome for the HUD. */
  message: string;
  /** Set when the human side is not playing this faceoff (AI vs AI). */
  auto: boolean;
  /** Seconds between "set" and the whistle, rolled with the rest of the draw. */
  downDelay: number;
}

const SWEEP_TIME = 1.05;
/** Below this, a clamp is a whiff rather than a losing clamp. */
const SCRUM_THRESHOLD = 0.22;

/** Rolls how cleanly a rated faceoff man clamps. Can exceed 1, which is how a
 *  genuine specialist occasionally beats a perfectly timed clamp. */
function clampQuality(rng: Rng, rating: number, skillMul = 1): number {
  const skill = clamp((rating / 99) * skillMul, 0.1, 1.1);
  return clamp(rng.gauss(skill * 0.8, 0.24), 0, 1.15);
}

/** Turns a timing error into a clamp quality. Forgiving near the centre of the
 *  window and falling away past its edge, so being close still counts. */
function timingQuality(error: number, halfWidth: number): number {
  const ratio = Math.abs(error) / Math.max(1e-4, halfWidth);
  return clamp(1 - (ratio / 1.5) ** 1.5, 0, 1);
}

export function createFaceoff(
  rng: Rng,
  humanFo: number,
  aiFo: number,
  diff: DifficultyProfile,
  humanInvolved: boolean,
): FaceoffState {
  // The window is your FOGO's rating expressed as a target: better man, bigger
  // target. The differential swings it hard, so a specialist is felt.
  const width = clamp(0.22 + (humanFo - aiFo) / 190, 0.075, 0.42);
  const start = rng.range(0.13, 0.87 - width);

  return {
    stage: 'set',
    timer: 0.5,
    marker: 0,
    markerSpeed: 1 / SWEEP_TIME,
    zoneStart: start,
    zoneEnd: start + width,
    aiCommit: clamp(start + width / 2 + rng.gauss(0, 0.09), 0.03, 0.97),
    aiDone: false,
    aiQuality: clampQuality(rng, aiFo, humanInvolved ? diff.faceoffSkill : 1),
    autoQuality: clampQuality(rng, humanFo),
    humanQuality: null,
    humanDone: false,
    result: null,
    winner: null,
    message: 'SET',
    auto: !humanInvolved,
    downDelay: rng.range(0.35, 0.95),
  };
}

/** Advance the faceoff. Returns true once a result has been decided. */
export function stepFaceoff(
  fo: FaceoffState,
  dt: number,
  pressed: boolean,
  humanSide: Side,
  aiSide: Side,
): boolean {
  if (fo.stage === 'result') return true;

  fo.timer -= dt;

  if (fo.stage === 'set') {
    if (!fo.auto && pressed) {
      finish(fo, 'violation', aiSide, 'FALSE START');
      return true;
    }
    if (fo.timer <= 0) {
      fo.stage = 'down';
      // Drawn when the faceoff was created, from the match's own seeded
      // stream. It used to be a live Math.random() here, which made every
      // faceoff — and therefore everything after it — unrepeatable: the same
      // game from the same seed produced different scores, and no measurement
      // of the engine could be trusted to a tenth of a goal. The delay is
      // still unpredictable to the player, who cannot see the seed.
      fo.timer = fo.downDelay;
      fo.message = 'DOWN';
    }
    return false;
  }

  if (fo.stage === 'down') {
    if (!fo.auto && pressed) {
      finish(fo, 'violation', aiSide, 'FALSE START');
      return true;
    }
    if (fo.timer <= 0) {
      fo.stage = 'sweep';
      fo.marker = 0;
      fo.message = 'CLAMP!';
    }
    return false;
  }

  // --- sweep
  const center = (fo.zoneStart + fo.zoneEnd) / 2;
  const halfWidth = Math.max(1e-4, (fo.zoneEnd - fo.zoneStart) / 2);

  if (!fo.aiDone && fo.marker >= fo.aiCommit) fo.aiDone = true;

  if (!fo.auto && pressed && !fo.humanDone) {
    fo.humanDone = true;
    fo.humanQuality = timingQuality(fo.marker - center, halfWidth);
  }

  fo.marker += fo.markerSpeed * dt;

  const swept = fo.marker >= 1;
  const bothCommitted = fo.aiDone && (fo.humanDone || fo.auto);
  if (!swept && !bothCommitted) return false;

  if (fo.auto) {
    const winner = fo.autoQuality >= fo.aiQuality ? humanSide : aiSide;
    finish(fo, 'win', winner, 'CLAMP WON');
    return true;
  }

  // Never pressed at all counts as a whiff.
  const hq = fo.humanQuality ?? 0;
  const aq = fo.aiQuality;

  if (hq < SCRUM_THRESHOLD && aq < SCRUM_THRESHOLD) {
    finish(fo, 'scrum', null, 'SCRUM!');
  } else if (hq >= aq) {
    finish(fo, 'win', humanSide, 'CLAMP WON');
  } else {
    finish(fo, 'win', aiSide, 'CLAMP LOST');
  }
  return true;
}

function finish(fo: FaceoffState, result: FaceoffResult, winner: Side | null, message: string): void {
  fo.stage = 'result';
  fo.result = result;
  fo.winner = winner;
  fo.message = message;
  fo.timer = 0.6;
}
