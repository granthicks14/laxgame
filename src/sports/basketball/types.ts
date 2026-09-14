import type { HoopsPlayer, HoopsPosition, HoopsTeam } from './data';
import type { Side } from './court';
import type { ResolvedScheme } from './schemes';

/* ---------------------------------------------------------------------------
 * WHAT A GAME IS MADE OF
 * ---------------------------------------------------------------------------
 * Types only, so the engine, the AI, the renderer and the HUD can all talk about
 * the same game without importing each other.
 * ------------------------------------------------------------------------- */

/** What a player is visibly doing. The renderer draws from this, nothing else. */
export type Pose =
  | 'idle'
  | 'run'
  | 'dribble'
  | 'gather'
  | 'shoot'
  | 'layup'
  | 'dunk'
  | 'pass'
  | 'defend'
  | 'jump'
  | 'rebound'
  | 'screen'
  | 'celebrate'
  | 'down';

/** One player's numbers for the game. */
export interface BoxLine {
  points: number;
  fga: number;
  fgm: number;
  tpa: number;
  tpm: number;
  fta: number;
  ftm: number;
  offReb: number;
  defReb: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  /** Seconds of game clock on the floor. */
  seconds: number;
}

export const emptyLine = (): BoxLine => ({
  points: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0,
  offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
  seconds: 0,
});

export interface TeamBox {
  points: number;
  fga: number;
  fgm: number;
  tpa: number;
  tpm: number;
  fta: number;
  ftm: number;
  offReb: number;
  defReb: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  /** Fouls this quarter, for the bonus. */
  quarterFouls: number;
  /** Points scored on the break. */
  fastBreak: number;
  paintPoints: number;
  /** Quarter-by-quarter, for the box score. */
  byQuarter: number[];
}

export const emptyTeamBox = (): TeamBox => ({
  points: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0,
  offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0,
  fouls: 0, quarterFouls: 0, fastBreak: 0, paintPoints: 0, byQuarter: [],
});

/** A player on the floor. */
export interface CourtPlayer {
  /** Stable within a game: side, slot and player id. */
  uid: string;
  data: HoopsPlayer;
  side: Side;
  /** 0..4 — which of the five they are. */
  slot: number;
  pos: HoopsPosition;

  x: number;
  y: number;
  /** Height off the floor. Jumping is how you shoot, block and rebound. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facing: number;

  stamina: number;
  pose: Pose;
  /** Seconds left of the current pose, for animations that must play out. */
  poseTimer: number;

  /** 0..1 gather on a shot. */
  gather: number;
  gathering: boolean;
  /** The shot being gathered, decided at the start so the pose can match. */
  gatherKind: 'jumper' | 'three' | 'layup' | 'dunk' | null;
  /**
   * Where an AI player intends to let go. A human's release is his own finger;
   * the AI's is a number it commits to when it starts the shot, so its shooting
   * runs through exactly the same release-quality model rather than a second one.
   */
  aiRelease: number | null;
  /**
   * Seconds left on a catch-and-shoot trigger.
   *
   * A shooter decides to shoot BEFORE the ball arrives — that is the whole point
   * of a pass to an open man, and it is why a closeout is a race the defence
   * usually loses by a step. An AI that re-reads the floor after the catch is an
   * AI that never gets a shot off: by the time it has decided, its man has
   * arrived, and every possession ends in a heave at the shot clock.
   */
  quickShot: number;

  /** Cooldowns, in seconds. */
  stealCool: number;
  blockCool: number;
  crossCool: number;
  /** Knocked off balance: no input for a moment. */
  stun: number;
  /** Committed to a screen, so the AI can use it. */
  screenTimer: number;

  fouls: number;
  fouledOut: boolean;
  stat: BoxLine;

  /** Who this defender is guarding, by uid. Defence only. */
  assignment: string | null;
}

export type GamePhase =
  | 'tip'
  | 'live'
  | 'inbound'
  | 'freeThrow'
  | 'madeBasket'
  | 'quarterBreak'
  | 'final';

export interface HoopsSetup {
  team: HoopsTeam;
  roster: HoopsPlayer[];
}

export type DifficultyKey = 'rookie' | 'pro' | 'allstar' | 'legend';

export interface HoopsDifficulty {
  key: DifficultyKey;
  label: string;
  blurb: string;
  /**
   * How well the AI reads the floor: the chance it takes the best option
   * available rather than a merely reasonable one. Never a rating bonus.
   */
  decision: number;
  /** How quickly help defence arrives. */
  helpSpeed: number;
  /** How patiently it works for a good shot before settling. */
  patience: number;
  /** How hard it closes out on a shooter. */
  closeout: number;
}

export interface HoopsConfig {
  home: HoopsSetup;
  away: HoopsSetup;
  /** Which side the human plays, or null for a simulated exhibition. */
  humanSide: Side | null;
  quarterSeconds: number;
  difficulty: HoopsDifficulty;
  seed: number;
  /** Shown on the HUD: "Game 14", "Conference final". */
  label?: string;
  /**
   * What the home floor is worth, as a flat edge on the home side's shots. Set
   * by a career fixture; left alone by an exhibition, which is neutral ground.
   * The fast simulator reads the same number, so a home game is worth the same
   * whether you watched it or not.
   */
  homeEdge?: number;
  /** What each side runs. Absent means the plain basketball of an exhibition. */
  schemes?: { home: ResolvedScheme; away: ResolvedScheme };
}

/** Things the engine announces, for sound, the HUD and the commentary line. */
export interface HoopsEvents {
  tip: { side: Side };
  dribble: Record<string, never>;
  pass: Record<string, never>;
  /** `quality` is the chance this shot goes in, for the HUD and the harnesses. */
  shot: { kind: string; distance: number; quality: number };
  rim: Record<string, never>;
  board: Record<string, never>;
  swish: { side: Side; points: number; shooter: string };
  bucket: { side: Side; points: number; shooter: string; assist: string | null; kind: string };
  block: { by: string };
  steal: { by: string };
  rebound: { by: string; offensive: boolean };
  turnover: { side: Side; reason: string };
  whistle: { reason: string };
  foul: { by: string; shooting: boolean };
  freeThrow: { made: boolean };
  quarterEnd: { quarter: number };
  gameEnd: Record<string, never>;
  crowd: { intensity: number };
}
