/* ---------------------------------------------------------------------------
 * LEVELS OF THE LACROSSE WORLD
 * ---------------------------------------------------------------------------
 * The game used to know about one league. It now knows about six tiers, from a
 * struggling high school programme to the professional game, and the thing that
 * separates them is not a label — it is the players.
 *
 * A team's `overall` is a rating WITHIN ITS OWN LEVEL: a 90 in Class D means the
 * best team in Class D, and a 90 in the PLL means the best team in the world.
 * What turns that into a squad is the level's PLAYER BAND, which is the range of
 * actual attribute values the level's players are drawn from. The band is what
 * makes a step up feel like a step up: the same coach, in the same engine, now
 * facing men who are quicker, sharper and harder to score past.
 *
 *   Level         band     what it feels like
 *   ------------  -------  --------------------------------------------------
 *   High school   scale    raw and wildly uneven; the scale everything else
 *                          is measured against
 *   Division III  62-93    organised, deep in the middle, thin at the top
 *   Division II   68-95    athletic, deeper, fewer easy nights
 *   Division I    74-99    fast and skilled everywhere on the field
 *   Semi-pro      78-97    finished players; no weak spots to attack
 *   PLL           84-99    the best in the world, and they all are
 *
 * The second lever is the AI: every level sets a floor on decision quality, so
 * professional opponents genuinely think better than high schoolers rather than
 * simply having better numbers.
 * ------------------------------------------------------------------------- */

import type { DifficultyKey } from './difficulty';
import type { GameLengthKey } from './constants';

export type Level = 'hs' | 'd3' | 'd2' | 'd1' | 'semipro' | 'pll';

export const LEVEL_ORDER: Level[] = ['hs', 'd3', 'd2', 'd1', 'semipro', 'pll'];

export interface LevelInfo {
  key: Level;
  name: string;
  short: string;
  blurb: string;
  /**
   * Attribute pool endpoints. The level's own weakest and strongest teams are
   * stretched across this range, so a level always uses all of its band and
   * the tiers stack: the floor of each is well above the floor below it.
   * `null` means identity — high school ratings ARE the player scale, which is
   * where the rest of the ladder is measured from.
   */
  band: { lo: number; hi: number } | null;
  /** How players are aged and labelled. */
  ageSystem: 'hs' | 'college' | 'pro';
  /** Squad size a programme carries at this level. */
  rosterSize: number;
  /** Nobody plays a professional game on rookie AI. */
  minDifficulty: DifficultyKey;
  /** Default quarter length for the tier. */
  gameLength: GameLengthKey;
  /** Multiplies the venue's crowd, so a PLL stadium is not a school field. */
  crowdScale: number;
  /** What the level calls its incoming players. */
  intakeLabel: string;
  /** Roughly where this level sits against the others, for cross-level talk. */
  strengthOffset: number;
}

export const LEVELS: Record<Level, LevelInfo> = {
  hs: {
    key: 'hs',
    name: 'High School',
    short: 'HS',
    blurb: 'Where every coach starts. Uneven rosters, raw players, and a home crowd of parents.',
    band: null,
    ageSystem: 'hs',
    rosterSize: 20,
    minDifficulty: 'rookie',
    gameLength: 'short',
    crowdScale: 1,
    intakeLabel: 'Freshmen',
    strengthOffset: 0,
  },
  d3: {
    key: 'd3',
    name: 'NCAA Division III',
    short: 'D-III',
    blurb: 'No scholarships and a hundred programmes. Coaching and recruiting are the whole game.',
    band: { lo: 62, hi: 93 },
    ageSystem: 'college',
    rosterSize: 26,
    minDifficulty: 'varsity',
    gameLength: 'standard',
    crowdScale: 1.15,
    intakeLabel: 'Recruits',
    strengthOffset: 14,
  },
  d2: {
    key: 'd2',
    name: 'NCAA Division II',
    short: 'D-II',
    blurb: 'Fewer programmes, real scholarships, and a step up in speed everywhere on the field.',
    band: { lo: 68, hi: 95 },
    ageSystem: 'college',
    rosterSize: 26,
    minDifficulty: 'varsity',
    gameLength: 'standard',
    crowdScale: 1.3,
    intakeLabel: 'Recruits',
    strengthOffset: 20,
  },
  d1: {
    key: 'd1',
    name: 'NCAA Division I',
    short: 'D-I',
    blurb: 'Full houses, national television, and programmes where a winning season gets you fired.',
    band: { lo: 74, hi: 99 },
    ageSystem: 'college',
    rosterSize: 28,
    minDifficulty: 'allstate',
    gameLength: 'standard',
    crowdScale: 1.7,
    intakeLabel: 'Recruits',
    strengthOffset: 28,
  },
  semipro: {
    key: 'semipro',
    name: 'Continental Lacrosse League',
    short: 'CLL',
    blurb: 'Grown men with day jobs and unfinished business. The last stop before the professional game.',
    band: { lo: 78, hi: 97 },
    ageSystem: 'pro',
    rosterSize: 22,
    minDifficulty: 'allstate',
    gameLength: 'standard',
    crowdScale: 1.35,
    intakeLabel: 'Signings',
    strengthOffset: 33,
  },
  pll: {
    key: 'pll',
    name: 'Premier Lacrosse League',
    short: 'PLL',
    blurb: 'Eight teams, the best players alive, and nowhere left to climb.',
    band: { lo: 84, hi: 99 },
    ageSystem: 'pro',
    rosterSize: 20,
    minDifficulty: 'elite',
    gameLength: 'long',
    crowdScale: 2.1,
    intakeLabel: 'Draft picks',
    strengthOffset: 40,
  },
};

/**
 * Maps a within-level rating onto the level's player band, given the range of
 * team ratings that actually exist at that level. See data/world.ts, which
 * measures the range and calls this — the two are split so this file stays a
 * table of constants with no dependencies.
 */
export function bandFor(
  level: Level, rating: number, span: { min: number; max: number },
): number {
  const band = LEVELS[level].band;
  if (!band) return rating;
  const width = Math.max(1, span.max - span.min);
  const t = (rating - span.min) / width;
  // Ratings either side of the level's overall range (a great defence on a poor
  // team) are allowed a little room outside the band rather than being clipped.
  return Math.max(band.lo - 5, Math.min(band.hi + 3, band.lo + t * (band.hi - band.lo)));
}

/** Rough cross-level strength, only for comparing teams in different tiers. */
export function worldStrength(level: Level, overall: number): number {
  return overall * 0.6 + LEVELS[level].strengthOffset;
}

/** Difficulty actually used at a level: the player's choice, floored by the tier. */
export function difficultyFor(level: Level, chosen: DifficultyKey): DifficultyKey {
  const order: DifficultyKey[] = ['rookie', 'varsity', 'allstate', 'elite'];
  const floor = LEVELS[level].minDifficulty;
  return order.indexOf(chosen) >= order.indexOf(floor) ? chosen : floor;
}

/** Class years at this level, oldest last. */
export function gradeLabels(level: Level): string[] {
  return LEVELS[level].ageSystem === 'hs'
    ? ['Fr', 'So', 'Jr', 'Sr']
    : LEVELS[level].ageSystem === 'college'
      ? ['Fr', 'So', 'Jr', 'Sr']
      : ['R', '2yr', '3yr', 'Vet'];
}
