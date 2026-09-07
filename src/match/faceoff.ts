import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import type { Side } from '../data/constants';
import type { DifficultyProfile } from '../data/difficulty';

export type FaceoffStage = 'set' | 'down' | 'sweep' | 'result';
export type FaceoffResult = 'win' | 'scrum' | 'violation';

export interface FaceoffState {
  stage: FaceoffStage;
  timer: number;
  /** 0..1 position of the sweeping clamp marker. */
  marker: number;
  markerSpeed: number;
  /** Target window, 0..1. */
  zoneStart: number;
  zoneEnd: number;
  /** Where the AI will commit, 0..1 along the sweep. */
  aiCommit: number;
  aiDone: boolean;
  aiError: number;
  humanError: number | null;
  /** In an AI-vs-AI faceoff, the error rolled for the non-AI-labelled side. */
  autoError: number;
  humanDone: boolean;
  result: FaceoffResult | null;
  winner: Side | null;
  /** Human-readable outcome for the HUD. */
  message: string;
  /** Set when the human side is not playing this faceoff (AI vs AI). */
  auto: boolean;
}

const SWEEP_TIME = 1.05;

export function createFaceoff(
  rng: Rng,
  humanFo: number,
  aiFo: number,
  diff: DifficultyProfile,
  humanInvolved: boolean,
): FaceoffState {
  // The clamp window grows with your faceoff rating relative to the opponent.
  const edge = (humanFo - aiFo) / 320;
  const width = clamp(0.2 + edge, 0.09, 0.42);
  const start = rng.range(0.14, 0.86 - width);

  // The AI commits with an error derived from its rating and the difficulty profile.
  const aiSkill = clamp(aiFo / 99, 0.2, 1) * (humanInvolved ? diff.faceoffSkill : 1);
  const aiError = Math.abs(rng.gauss(0, 0.135 / Math.max(0.35, aiSkill)));
  const homeSkill = clamp(humanFo / 99, 0.2, 1);
  const autoError = Math.abs(rng.gauss(0, 0.135 / Math.max(0.35, homeSkill)));

  return {
    stage: 'set',
    timer: 0.5,
    marker: 0,
    markerSpeed: 1 / SWEEP_TIME,
    zoneStart: start,
    zoneEnd: start + width,
    aiCommit: clamp(start + width / 2 + rng.gauss(0, 0.12) * (1.3 - aiSkill), 0.02, 0.98),
    aiDone: false,
    aiError,
    autoError,
    humanError: null,
    humanDone: false,
    result: null,
    winner: null,
    message: 'SET',
    auto: !humanInvolved,
  };
}

/** Advance the faceoff. Returns true once a result has been decided. */
export function stepFaceoff(
  fo: FaceoffState,
  dt: number,
  pressed: boolean,
  rng: Rng,
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
      fo.timer = rng.range(0.35, 0.95);
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

  // sweep
  const zoneCenter = (fo.zoneStart + fo.zoneEnd) / 2;
  const halfWidth = (fo.zoneEnd - fo.zoneStart) / 2;

  if (!fo.aiDone && fo.marker >= fo.aiCommit) fo.aiDone = true;

  if (!fo.auto && pressed && !fo.humanDone) {
    fo.humanDone = true;
    fo.humanError = Math.abs(fo.marker - zoneCenter);
  }

  fo.marker += fo.markerSpeed * dt;

  const swept = fo.marker >= 1;
  const bothCommitted = fo.aiDone && (fo.humanDone || fo.auto);
  if (!swept && !bothCommitted) return false;

  if (fo.auto) {
    // AI vs AI: both sides roll against their own faceoff rating.
    const winner = fo.autoError < fo.aiError ? humanSide : aiSide;
    finish(fo, 'win', winner, 'CLAMP WON');
    return true;
  }

  const hErr = fo.humanError ?? 1;
  // A miss outside the window by a lot is a scrum, not an automatic loss.
  const humanClean = hErr <= halfWidth;
  const aiClean = fo.aiError <= halfWidth;

  if (humanClean && !aiClean) finish(fo, 'win', humanSide, 'CLAMP WON');
  else if (!humanClean && aiClean) finish(fo, 'win', aiSide, 'CLAMP LOST');
  else if (humanClean && aiClean) {
    finish(fo, 'win', hErr <= fo.aiError ? humanSide : aiSide,
      hErr <= fo.aiError ? 'CLAMP WON' : 'CLAMP LOST');
  } else {
    finish(fo, 'scrum', null, 'SCRUM!');
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
