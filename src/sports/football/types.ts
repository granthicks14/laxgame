import type { Player, Team } from './data';
import type { CoverageKind, DefensiveSlot, OffensivePlay, OffensiveSlot, RouteSpec } from './playbook';
import type { Side } from './field';

/* ---------------------------------------------------------------------------
 * WHAT A FOOTBALL GAME IS MADE OF
 * ---------------------------------------------------------------------------
 * Types only, so the engine, the AI, the renderer and the career can all talk
 * about the same game without importing each other's machinery.
 * ------------------------------------------------------------------------- */

export type DifficultyKey = 'rookie' | 'pro' | 'allpro' | 'legend';

export interface FootballDifficulty {
  key: DifficultyKey;
  label: string;
  blurb: string;

  /* --- how the computer THINKS ------------------------------------------- */
  /**
   * Multiplier on how long a defender takes to react to what he sees. Above 1 is
   * slower. This is the single biggest difference between the tiers and it is
   * not a rating: a slow defender covers his man exactly as well once he has
   * started moving.
   */
  reaction: number;
  /** How well a defender stays with his assignment instead of chasing the ball. */
  discipline: number;
  /** How hard the rush works to get home. */
  rushUrgency: number;
  /** How close coverage plays to the receiver's actual break. */
  coverageTight: number;
  /**
   * How well the defence reads a tendency. At 0.95 it notices you have run six
   * times in a row and loads the box; at 0.3 it does not.
   */
  playRead: number;
  /** Clock management: timeouts, the two-minute drill, going for it. */
  clockSense: number;
  /** How often the AI offence takes a risk rather than the safe play. */
  aggression: number;

  /* --- how much room the HUMAN gets -------------------------------------- */
  /** Multiplier on the size of a good throwing window. */
  throwWindow: number;
  /** Multiplier on a receiver's chance of hauling in a contested ball. */
  catchHelp: number;
  /** Multiplier on the ball carrier's chance of breaking a tackle. */
  tackleBreak: number;
}

export interface TeamSetup {
  team: Team;
  roster: Player[];
}

/**
 * HOW THE DEFENCE IS COACHED.
 *
 * The person plays offence. When the other lot have the ball he is a coach
 * rather than a player, and this is the lever: press and blitz and live with
 * what gets behind you, sit back and make them earn it, or stay in the middle.
 * It is one decision before the drive instead of eleven every snap.
 */
export type GamePlan = 'aggressive' | 'balanced' | 'conservative';

export const GAME_PLANS: { key: GamePlan; label: string; blurb: string }[] = [
  {
    key: 'aggressive',
    label: 'Attack',
    blurb: 'Press, blitz, and go and get the ball. More sacks and more takeaways, '
      + 'and more of them behind you when it goes wrong.',
  },
  {
    key: 'balanced',
    label: 'Balanced',
    blurb: 'Play the down and distance. Nothing given away, nothing forced.',
  },
  {
    key: 'conservative',
    label: 'Bend',
    blurb: 'Deep help, soft cushions, keep it in front. They will move it; '
      + 'they will have to do it eleven plays at a time.',
  },
];

export interface FootballConfig {
  home: TeamSetup;
  away: TeamSetup;
  /** Which side the person is coaching, or null for a game nobody is playing. */
  humanSide: Side | null;
  quarterSeconds: number;
  difficulty: FootballDifficulty;
  seed: number;
  /** What the scoreboard calls this one. */
  label?: string;
  /** A small edge to the home side, as the sport has. */
  homeEdge?: number;
  /**
   * THE PERSON PLAYS OFFENCE.
   *
   * With this set he calls and plays every snap his side has the ball, and when
   * the other lot have it his eleven play it out on their own ratings, his
   * coordinator's coaching and his game plan. He is not asked to steer a safety.
   * The one exception is the one that would be absurd to take away: a ball his
   * defence has just taken off them is his to run.
   */
  offenseOnly?: boolean;
  /** How he wants the defence played while he is not playing it. */
  gamePlan?: GamePlan;
}

/* ------------------------------------------------------------- the players */

export type Pose =
  | 'idle' | 'stance' | 'run' | 'sprint'
  | 'throw' | 'catch' | 'block' | 'rush' | 'tackle' | 'down'
  | 'kick' | 'celebrate';

/** One man on the field for one play. */
export interface FieldPlayer {
  uid: string;
  data: Player;
  side: Side;
  /** Which job he is doing on this snap. */
  slot: OffensiveSlot | DefensiveSlot;
  /** On offence, the route he was given. */
  route: RouteSpec | null;

  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * Where the call says he lines up. He WALKS to it during the play clock
   * rather than appearing on it, because twenty-two men teleporting into
   * position between every down is the single most artificial thing a football
   * game can put on screen.
   */
  setX: number;
  setY: number;
  /** Which way he is facing, radians. */
  facing: number;

  pose: Pose;
  poseTimer: number;
  /** Stride phase, advanced by pace so legs churn at the speed he is running. */
  stridePhase: number;
  /** How far along a route he is, in yards from the snap. */
  routeProgress: number;

  /** Seconds before he may act on what he has just seen. */
  react: number;
  stamina: number;
  /** Beaten on a missed tackle or a broken block; cannot act until it runs out. */
  stunned: number;

  /* --- assignments ------------------------------------------------------- */
  /** The man this defender is covering, by uid. */
  assignment: string | null;
  /** The zone this defender is responsible for, if he is playing one. */
  zone: { x: number; y: number; radius: number } | null;
  /** True while a blocker and a rusher are engaged with each other. */
  engagedWith: string | null;
  /** How much longer this block holds. */
  blockTimer: number;

  /** Set for the man carrying the ball. */
  hasBall: boolean;
  /** Flashes when control moves to him, so a player can see it happen. */
  flash: number;
}

/* ---------------------------------------------------------------- the ball */

export type BallState = 'held' | 'thrown' | 'loose' | 'kicked' | 'dead';

export interface FootballBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: BallState;
  /** Who is holding it, by uid. */
  carrier: string | null;
  /** Who threw or kicked it. */
  from: string | null;
  /** Who it was aimed at. */
  target: string | null;
  /** Where it was aimed, so a receiver can adjust to a badly placed ball. */
  aimX: number;
  aimY: number;
  /** Seconds since the state last changed. */
  age: number;
}

/* --------------------------------------------------------------- the game */

export type GamePhase =
  /** Between plays: the coach is choosing. */
  | 'playcall'
  /** Lined up, play clock running, waiting for the snap. */
  | 'presnap'
  /** The ball is live. */
  | 'live'
  /** The whistle has gone; the result is being shown. */
  | 'dead'
  /** A score, a change of possession, a kick — something with its own beat. */
  | 'special'
  | 'quarterBreak'
  | 'final';

/** Why the last play ended, which is what the result banner says. */
export type PlayOutcome =
  | 'tackle' | 'outOfBounds' | 'incomplete' | 'sack' | 'touchdown'
  | 'interception' | 'fumble' | 'fieldGoal' | 'fieldGoalMiss' | 'punt'
  | 'safety' | 'kickoff' | 'extraPoint' | 'extraPointMiss'
  | 'twoPoint' | 'twoPointFail' | 'turnoverOnDowns' | 'touchback' | 'kneel';

export interface PlayResult {
  outcome: PlayOutcome;
  /** Net yards, from the line of scrimmage. Negative on a sack. */
  yards: number;
  /** Who had the ball at the end of it. */
  side: Side;
  /** The man who made the play, for the ticker. */
  by: string | null;
  /** And the man it happened to. */
  on: string | null;
  /** The sentence the ticker shows. */
  text: string;
  /** True when possession changed on this play. */
  turnover: boolean;
  /** Points scored on the play, if any. */
  points: number;
  /** True when the clock should keep running after it. */
  clockRuns: boolean;
}

/** A player's line for a game. */
export interface StatLine {
  /* passing */
  passAttempts: number;
  completions: number;
  passYards: number;
  passTD: number;
  interceptions: number;
  sacked: number;
  /* rushing */
  carries: number;
  rushYards: number;
  rushTD: number;
  /* receiving */
  targets: number;
  catches: number;
  recYards: number;
  recTD: number;
  /* defence */
  tackles: number;
  sacks: number;
  picks: number;
  passesDefended: number;
  forcedFumbles: number;
  /* kicking */
  fgMade: number;
  fgAttempts: number;
  punts: number;
  puntYards: number;
  /* everything */
  fumbles: number;
  snaps: number;
}

export const emptyStatLine = (): StatLine => ({
  passAttempts: 0, completions: 0, passYards: 0, passTD: 0, interceptions: 0, sacked: 0,
  carries: 0, rushYards: 0, rushTD: 0,
  targets: 0, catches: 0, recYards: 0, recTD: 0,
  tackles: 0, sacks: 0, picks: 0, passesDefended: 0, forcedFumbles: 0,
  fgMade: 0, fgAttempts: 0, punts: 0, puntYards: 0,
  fumbles: 0, snaps: 0,
});

export interface TeamBox {
  points: number;
  firstDowns: number;
  totalYards: number;
  passYards: number;
  rushYards: number;
  turnovers: number;
  sacksAllowed: number;
  penalties: number;
  thirdDownConv: number;
  thirdDownAtt: number;
  /** Quarter by quarter, for the box score. */
  byQuarter: number[];
  /** Seconds of possession. */
  timeOfPossession: number;
}

export const emptyTeamBox = (): TeamBox => ({
  points: 0, firstDowns: 0, totalYards: 0, passYards: 0, rushYards: 0,
  turnovers: 0, sacksAllowed: 0, penalties: 0,
  thirdDownConv: 0, thirdDownAtt: 0,
  byQuarter: [0, 0, 0, 0], timeOfPossession: 0,
});

/** Things the engine announces, for sound, the HUD and the commentary line. */
export interface FootballEvents {
  snap: { play: OffensivePlay; defense: CoverageKind };
  throw: { by: string; distance: number };
  catch: { by: string; yards: number; contested: boolean };
  incomplete: { reason: 'overthrown' | 'defended' | 'dropped' };
  tackle: { by: string; on: string; yards: number };
  sack: { by: string; on: string; yards: number };
  interception: { by: string; on: string };
  fumble: { by: string; recovered: Side };
  firstDown: { side: Side };
  touchdown: { side: Side; by: string; yards: number; kind: 'pass' | 'run' | 'return' };
  fieldGoal: { side: Side; made: boolean; distance: number };
  punt: { side: Side; distance: number };
  kickoff: { side: Side };
  safety: { side: Side };
  turnoverOnDowns: { side: Side };
  quarterEnd: { quarter: number };
  gameEnd: Record<string, never>;
  crowd: { intensity: number };
  whistle: Record<string, never>;
}
