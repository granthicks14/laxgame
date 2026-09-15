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

  /**
   * Seconds before this player can respond to something new.
   *
   * REAL DEFENDERS ARE LATE. Without this a defender rotates on the frame the
   * ball leaves the passer's hand, which is faster than the pass travels — so
   * nobody is ever open, no closeout can be beaten, and the defence reads as five
   * magnets rather than five people. Reset whenever the ball changes hands; how
   * long it lasts is the man's basketball IQ and the difficulty tier.
   */
  react: number;

  /**
   * ANIMATION STATE, advanced by the engine rather than read off a wall clock.
   *
   * `stridePhase` runs at the speed the man is ACTUALLY moving, so a walk is a
   * walk and a sprint is a sprint — it used to be `performance.now()`, which gave
   * every player on the floor the same leg speed whatever they were doing, and
   * made a renderer that could not be tested.
   *
   * `lean` and `leanDir` are SMOOTHED, so a pose change bends the body into its
   * new shape over a few frames instead of snapping to it. Snapping is most of
   * what makes an animation look cheap.
   */
  stridePhase: number;
  lean: number;
  leanDir: number;

  /**
   * Seconds left of the "you are now holding this man" highlight.
   *
   * Control moves by itself — a pass hands you the receiver — so the game has to
   * SAY it moved. Without this the ball arrives, the man you were steering stops
   * answering, and it reads as the controls having broken.
   */
  flash: number;
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

/* ---------------------------------------------------------------------------
 * DIFFICULTY
 * ---------------------------------------------------------------------------
 * THE RULE: difficulty never gives anybody a rating they did not earn. Not one
 * number in here touches a player's attributes, and no team gets a secret bonus
 * on its shots. What changes is HOW WELL THE GAME IS PLAYED AROUND YOU and HOW
 * MUCH ROOM YOU GET — decisions, reactions, execution, and the size of the
 * window your own thumb has to hit.
 *
 * It used to be four numbers, all of them about the AI, which meant every tier
 * played the same game with a slightly sharper opponent. A difficulty you cannot
 * feel in your hands is not a difficulty setting.
 * ------------------------------------------------------------------------- */
export interface HoopsDifficulty {
  key: DifficultyKey;
  label: string;
  blurb: string;

  /* --- what the AI knows ------------------------------------------------ */
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

  /* --- how well the AI executes ----------------------------------------- */
  /** Multiplies how long the AI takes to react to something new. */
  reaction: number;
  /** Multiplies the chance an AI pass is sloppy enough to be picked off. */
  passError: number;
  /** Multiplies how often the AI simply makes a mess of a possession. */
  mistake: number;
  /** How well AI defenders pick the right man to rotate to. */
  rotation: number;
  /** How hard the AI boxes out and goes after the glass. */
  glass: number;
  /** How disciplined AI defence is: lower means more cheap fouls. */
  discipline: number;

  /* --- what the human gets ---------------------------------------------- */
  /**
   * Multiplies the size of the release window on the human's shots. Bigger is
   * more forgiving. This is the single number a player feels most.
   */
  window: number;
  /** Multiplies how much a contest takes off a shot. */
  contest: number;
  /** Multiplies how harshly a bad release is punished. */
  timingBite: number;
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
