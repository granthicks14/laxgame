import type { DifficultyKey, FootballDifficulty } from './types';

/* ---------------------------------------------------------------------------
 * FEEL
 * ---------------------------------------------------------------------------
 * Every number the football engine runs on, in one place, in YARDS and SECONDS.
 *
 * Anchored on what the sport actually does. A fast receiver covers about nine
 * yards a second; a lineman covers five. A ball leaves a strong arm at roughly
 * twenty yards a second. A pass rush gets home in two and a half seconds against
 * an average line and in four against a good one. A play takes about six seconds
 * and a game takes about a hundred and twenty of them.
 * ------------------------------------------------------------------------- */

export const FOOTBALL = {
  /** Rating that reads as "average starter". */
  ratingCentre: 62,

  /* --- movement. Yards per second at the extremes of the rating scale. */
  baseSpeed: 5.4,
  speedPerRating: 0.052,
  /** A ball carrier at a dead sprint. */
  sprintMultiplier: 1.18,
  accelBase: 7.5,
  accelPerRating: 0.06,
  /** Stopping is faster than starting, as it is in every sport. */
  brakeMultiplier: 2.2,
  /** What a hard cut costs in speed. Agility decides how much you keep. */
  turnScrub: 0.9,
  turnRate: 11,
  /** Carrying the ball costs a little. */
  carryPenalty: 0.96,

  /* --- stamina. A football play is short and the rest between them is long,
   * so fatigue is a drive-level cost rather than a possession-level one. */
  sprintDrain: 11,
  staminaRegen: 26,

  /* --- the throw */
  /** Yards per second at a throw power of 0 and of 99. */
  throwSpeedMin: 13,
  throwSpeedMax: 26,
  /** How long the quarterback needs to set and release. */
  releaseTime: 0.34,
  /** How far a receiver's hands reach for a ball. */
  catchRadius: 1.5,
  /** How close a defender must be to contest a catch at all. */
  contestRange: 3.2,
  /** How close a defender must be to the flight line to break it up. */
  breakupRange: 1.9,

  /* --- the trenches */
  /** Seconds an average block holds an average rusher. */
  blockHoldBase: 1.9,
  blockHoldPerRating: 0.028,
  /** How quickly a free rusher closes the last yards to the quarterback. */
  rushClose: 7.4,
  /** How close a rusher has to be to bring him down. */
  sackRange: 1.5,

  /* --- tackling */
  tackleRange: 1.5,
  /** A tackle attempt that fails leaves the defender beaten for this long. */
  missedTackleStun: 0.55,
  /** How long a ball carrier is held before the whistle. */
  tackleHold: 0.35,

  /* --- kicking */
  /** The longest field goal a 99 kicker can make, in yards. */
  fieldGoalRangeMax: 62,
  fieldGoalRangeMin: 34,
  /** A punt's hang time and distance at the extremes. */
  puntDistanceMin: 32,
  puntDistanceMax: 52,
  kickoffDistance: 62,

  /* --- the clock */
  quarters: 4,
  /** Real seconds of play clock between snaps. */
  playClock: 25,
  /** How long the ball is dead between plays before the next snap is allowed. */
  huddlePause: 1.2,
  /**
   * HOW FAST THE CLOCK RUNS BETWEEN PLAYS.
   *
   * The one place this game does not run in real time, and it has to be: real
   * football burns about thirty-five seconds of clock between snaps and this
   * game burns two and a half, because nobody wants to watch a huddle. Left at
   * 1:1 a fourteen-minute game runs three hundred plays and a two-minute drill
   * is half a quarter long.
   *
   * So the clock — the game clock and the play clock together, so they still
   * agree with each other — runs at this multiple while the ball is dead, and at
   * 1:1 while it is live, which is the only part a player can actually perceive.
   * At 2.5 a huddle costs about six seconds, a team killing the clock costs
   * about forty, and a minute left is worth six or seven plays. All three of
   * those are what the real game does.
   */
  deadClockRate: 2.5,
  /** Seconds of celebration after a score. */
  scorePause: 2.2,
  overtimeSeconds: 300,

  /* --- the rules */
  downs: 4,
  yardsForFirst: 10,
  touchdown: 6,
  fieldGoal: 3,
  extraPoint: 1,
  twoPoint: 2,
  safety: 2,
} as const;

export const GAME_LENGTHS = {
  short: {
    label: 'Short',
    quarterSeconds: 120,
    blurb: '4 x 2:00 — about 8 minutes. Six or seven drives a side.',
  },
  standard: {
    label: 'Standard',
    quarterSeconds: 210,
    blurb: '4 x 3:30 — about 14 minutes. A full game in a lunch break.',
  },
  long: {
    label: 'Long',
    quarterSeconds: 330,
    blurb: '4 x 5:30 — about 22 minutes. Room for a proper comeback.',
  },
} as const;
export type GameLengthKey = keyof typeof GAME_LENGTHS;

/* ---------------------------------------------------------------- difficulty
 *
 * THE RULE THE OTHER TWO SPORTS SET AND THIS ONE KEEPS: DIFFICULTY IS NEVER A
 * BONUS ON A RATING. Every AI player plays to exactly the numbers on the roster
 * screen. What changes is how well the defence READS what you called, how fast
 * it reacts, how disciplined it is about its assignment, and how much room your
 * own throw gets. A Legend defence is not stronger. It is better coached.
 */
export const DIFFICULTIES: Record<DifficultyKey, FootballDifficulty> = {
  rookie: {
    key: 'rookie',
    label: 'Rookie',
    blurb: 'Soft cushions, slow reactions, and a rush that arrives after you have '
      + 'thrown. Room to learn the reads.',
    reaction: 1.8, discipline: 0.5, rushUrgency: 0.72, coverageTight: 0.66,
    playRead: 0.3, clockSense: 0.35, aggression: 0.4,
    throwWindow: 1.5, catchHelp: 1.2, tackleBreak: 1.14,
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    blurb: 'An honest game. They cover their man, they get home on time, and a '
      + 'throw into coverage is punished.',
    reaction: 1.2, discipline: 0.78, rushUrgency: 1, coverageTight: 1,
    playRead: 0.55, clockSense: 0.7, aggression: 0.7,
    throwWindow: 1, catchHelp: 1, tackleBreak: 1,
  },
  allpro: {
    key: 'allpro',
    label: 'All-Pro',
    blurb: 'They jump the route you keep calling, the edge comes free, and the '
      + 'window is small enough that you have to be right.',
    reaction: 0.86, discipline: 0.92, rushUrgency: 1.16, coverageTight: 1.2,
    playRead: 0.78, clockSense: 0.88, aggression: 0.88,
    throwWindow: 0.8, catchHelp: 0.88, tackleBreak: 0.92,
  },
  legend: {
    key: 'legend',
    label: 'Legend',
    blurb: 'Every leverage right, every rotation on time, and a safety waiting '
      + 'wherever you were going. You will have to earn all of it.',
    reaction: 0.66, discipline: 1, rushUrgency: 1.32, coverageTight: 1.4,
    playRead: 0.95, clockSense: 1, aggression: 1,
    throwWindow: 0.64, catchHelp: 0.8, tackleBreak: 0.86,
  },
};

export const DIFFICULTY_ORDER: DifficultyKey[] = ['rookie', 'pro', 'allpro', 'legend'];
