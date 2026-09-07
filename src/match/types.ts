import type { PlayerData, PlayerStats } from '../data/players';
import type { Position, Side } from '../data/constants';
import type { TeamData } from '../data/teams';
import type { Tactics } from '../data/tactics';
import type { DifficultyKey } from '../data/difficulty';

/** Where a player lines up in the 2-3-1 offensive set / matching defensive set. */
export type SlotKey = 'G' | 'D1' | 'D2' | 'D3' | 'M1' | 'M2' | 'M3' | 'A1' | 'A2' | 'A3';

export interface MatchPlayer {
  uid: string;
  data: PlayerData;
  side: Side;
  pos: Position;
  slot: SlotKey;
  /** Index within the on-field ten. */
  index: number;

  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;

  stamina: number;
  /** >0 means knocked off balance and unable to act. */
  stun: number;
  /** >0 means recently beaten by a dodge: reduced acceleration. */
  beaten: number;
  checkCd: number;
  dodgeTimer: number;
  dodgeCd: number;
  dodgeX: number;
  dodgeY: number;
  /** 0..1 charge on a shot being wound up. */
  windup: number;
  windupIsPass: boolean;
  /** Cooldown before this player can pick the ball back up after releasing it. */
  pickupLock: number;

  // --- AI scratch state ---
  aiThink: number;
  aiTargetX: number;
  aiTargetY: number;
  aiCut: number;
  aiMark: number;
  aiSliding: boolean;
  aiIntent: 'idle' | 'drive' | 'pass' | 'shoot' | 'reset';

  // --- animation ---
  animPhase: number;
  animPose: 'idle' | 'run' | 'wind' | 'throw' | 'check' | 'dive' | 'down';
  poseTimer: number;
  /** Visual-only: last frame the player did something worth a flash. */
  flash: number;

  /** Stats accumulated in this match only. Merged into season totals afterwards. */
  stat: PlayerStats;
}

/** Everything the simulation needs from a controller, human or otherwise. */
export interface InputState {
  moveX: number;
  moveY: number;
  sprint: boolean;
  /** Edge-triggered: pass on offense, check on defense, clamp at a faceoff. */
  actionPressed: boolean;
  /** Held state of the shoot button (charges a shot). */
  shootHeld: boolean;
  shootReleased: boolean;
  dodgePressed: boolean;
  switchPressed: boolean;
}

export const neutralInput = (): InputState => ({
  moveX: 0, moveY: 0, sprint: false, actionPressed: false,
  shootHeld: false, shootReleased: false, dodgePressed: false, switchPressed: false,
});

export type BallState = 'carried' | 'pass' | 'shot' | 'loose';

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: BallState;
  carrier: MatchPlayer | null;
  /** Player who last had possession — used for turnover / assist bookkeeping. */
  lastCarrier: MatchPlayer | null;
  /** Passer credited with a potential assist. */
  assistCandidate: MatchPlayer | null;
  assistTimer: number;
  intendedTarget: MatchPlayer | null;
  /** Team that most recently had clean possession. */
  lastSide: Side | null;
  /** Time since the ball was released — used for interception windows. */
  age: number;
  /** True once this shot has been recorded as on goal, so a deflection that
   *  trickles in is not counted twice. */
  onGoalCounted: boolean;
}

export interface TeamMatchStats {
  goals: number;
  shots: number;
  shotsOnGoal: number;
  saves: number;
  groundBalls: number;
  turnovers: number;
  faceoffWins: number;
  faceoffTakes: number;
  clears: number;
  clearAttempts: number;
  possessionTime: number;
  checks: number;
}

export const emptyTeamStats = (): TeamMatchStats => ({
  goals: 0, shots: 0, shotsOnGoal: 0, saves: 0, groundBalls: 0, turnovers: 0,
  faceoffWins: 0, faceoffTakes: 0, clears: 0, clearAttempts: 0, possessionTime: 0, checks: 0,
});

export interface ScoreEntry {
  side: Side;
  quarter: number;
  clock: number;
  scorerId: string;
  scorerName: string;
  assistId: string | null;
  assistName: string | null;
  /** Shot distance in yards, for the highlight text. */
  distance: number;
}

export type MatchPhase =
  | 'pregame'
  | 'faceoff'
  | 'live'
  | 'goal'
  | 'quarterbreak'
  | 'restart'
  | 'final';

export interface TeamSetup {
  team: TeamData;
  roster: PlayerData[];
  tactics: Tactics;
  human: boolean;
}

export type PracticeKind = 'shoot' | 'defend' | 'faceoff' | 'clear' | 'free';

export interface PracticeConfig {
  kind: PracticeKind;
  /** Stop after this many reps (faceoff drill). */
  reps?: number;
  /** Stop after this many seconds (timed drills). */
  seconds?: number;
  title: string;
  goal: string;
}

export interface MatchConfig {
  home: TeamSetup;
  away: TeamSetup;
  difficulty: DifficultyKey;
  quarterSeconds: number;
  /** Extra presentation flags. */
  rivalry?: boolean;
  contextLabel?: string;
  /** Playoff / championship games cannot end in a tie. */
  suddenVictory?: boolean;
  seed?: number;
  practice?: PracticeConfig;
}

export interface MatchEvents {
  goal: { side: Side; scorer: MatchPlayer; assist: MatchPlayer | null; distance: number };
  save: { side: Side; goalie: MatchPlayer; power: number };
  post: { x: number; y: number };
  shot: { side: Side; shooter: MatchPlayer; power: number };
  pass: { side: Side; power: number };
  catch: { side: Side };
  groundBall: { side: Side; player: MatchPlayer };
  check: { hit: boolean; x: number; y: number; power: number };
  dodge: { side: Side; player: MatchPlayer };
  turnover: { side: Side; reason: string };
  faceoff: { side: Side | null; result: 'win' | 'scrum' | 'violation' };
  whistle: Record<string, never>;
  quarterEnd: { quarter: number };
  gameEnd: Record<string, never>;
  commentary: { text: string; tone: 'big' | 'normal' };
  shake: { amount: number };
}
