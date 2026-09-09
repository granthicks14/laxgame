/* ---------------------------------------------------------------------------
 * LEVELS OF THE LACROSSE WORLD
 * ---------------------------------------------------------------------------
 * Six tiers, from a struggling high school programme to the professional game,
 * and ONE rating scale across all of them.
 *
 * That last part matters and used to be wrong. A team's `overall` was a rating
 * WITHIN its own level, so Division III ran 38-95 and the PLL ran 83-96 — which
 * let a college team be rated 94 while a professional team was 88. Nonsense on
 * its face, and the kind of nonsense that quietly makes the whole world feel
 * fake. `overallBand` fixes it: every level occupies a fixed slice of one
 * universal 0-99 scale, and a programme's standing WITHIN its level (its `tier`)
 * decides where in that slice it lands.
 *
 *   Level         overall   players    what it feels like
 *   ------------  --------  ---------  ---------------------------------------
 *   High school   40-80     38-84      raw and wildly uneven
 *   Division III  55-83     52-88      organised, deep in the middle
 *   Division II   65-87     62-92      athletic, deeper, fewer easy nights
 *   Division I    75-92     72-96      fast and skilled everywhere
 *   Semi-pro      80-94     77-97      finished players, no weak spots
 *   PLL           88-99     85-99      the best in the world, and they all are
 *
 * The bands OVERLAP on purpose, because reality does: the best high school team
 * in Texas would be a competitive Division III side, and the worst team in the
 * PLL would still beat any college programme. What is not allowed, ever, is an
 * inversion of the middles — `npm run hierarchy` fails the build if the average
 * team at one level outranks the average team at the level above it.
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
   * Where this level sits on the ONE universal team-rating scale. A programme's
   * standing within its own level is mapped onto this, so `overall` means the
   * same thing in Class D as it does in the PLL and the two can be compared.
   */
  overallBand: { lo: number; hi: number };
  /**
   * Player attribute endpoints — a little wider than `overallBand` at both
   * ends, because a squad contains players better and worse than the team it
   * adds up to. A star at a weak programme is the point of scouting.
   */
  band: { lo: number; hi: number };
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
}

export const LEVELS: Record<Level, LevelInfo> = {
  hs: {
    key: 'hs',
    name: 'High School',
    short: 'HS',
    blurb: 'Where every coach starts. Uneven rosters, raw players, and a home crowd of parents.',
    overallBand: { lo: 40, hi: 80 },
    band: { lo: 38, hi: 84 },
    ageSystem: 'hs',
    rosterSize: 20,
    minDifficulty: 'rookie',
    gameLength: 'short',
    crowdScale: 1,
    intakeLabel: 'Freshmen',
  },
  d3: {
    key: 'd3',
    name: 'NCAA Division III',
    short: 'D-III',
    blurb: 'No scholarships and a hundred programmes. Coaching and recruiting are the whole game.',
    overallBand: { lo: 55, hi: 83 },
    band: { lo: 52, hi: 88 },
    ageSystem: 'college',
    rosterSize: 26,
    minDifficulty: 'varsity',
    gameLength: 'standard',
    crowdScale: 1.15,
    intakeLabel: 'Recruits',
  },
  d2: {
    key: 'd2',
    name: 'NCAA Division II',
    short: 'D-II',
    blurb: 'Fewer programmes, real scholarships, and a step up in speed everywhere on the field.',
    overallBand: { lo: 65, hi: 87 },
    band: { lo: 62, hi: 92 },
    ageSystem: 'college',
    rosterSize: 26,
    minDifficulty: 'varsity',
    gameLength: 'standard',
    crowdScale: 1.3,
    intakeLabel: 'Recruits',
  },
  d1: {
    key: 'd1',
    name: 'NCAA Division I',
    short: 'D-I',
    blurb: 'Full houses, national television, and programmes where a winning season gets you fired.',
    overallBand: { lo: 75, hi: 92 },
    band: { lo: 72, hi: 96 },
    ageSystem: 'college',
    rosterSize: 28,
    minDifficulty: 'allstate',
    gameLength: 'standard',
    crowdScale: 1.7,
    intakeLabel: 'Recruits',
  },
  semipro: {
    key: 'semipro',
    name: 'Continental Lacrosse League',
    short: 'CLL',
    blurb: 'Grown men with day jobs and unfinished business. The last stop before the professional game.',
    overallBand: { lo: 80, hi: 94 },
    band: { lo: 77, hi: 97 },
    ageSystem: 'pro',
    rosterSize: 22,
    minDifficulty: 'allstate',
    gameLength: 'standard',
    crowdScale: 1.35,
    intakeLabel: 'Signings',
  },
  pll: {
    key: 'pll',
    name: 'Premier Lacrosse League',
    short: 'PLL',
    blurb: 'Eight teams, the best players alive, and nowhere left to climb.',
    overallBand: { lo: 88, hi: 99 },
    band: { lo: 85, hi: 99 },
    ageSystem: 'pro',
    rosterSize: 20,
    minDifficulty: 'elite',
    gameLength: 'long',
    crowdScale: 2.1,
    intakeLabel: 'Draft picks',
  },
};

/**
 * Puts a programme's WITHIN-LEVEL standing onto the universal scale.
 *
 * This is the one function that makes the world coherent. `tier` (or, for the
 * high school district, an authored rating) says how a programme ranks against
 * its own peers; `span` is the range those peer values actually occupy. The
 * result is an `overall` that means the same thing at every level, so a PLL
 * club is never rated below a college side.
 */
export function universalOverall(
  level: Level, tier: number, span: { min: number; max: number },
): number {
  const { lo, hi } = LEVELS[level].overallBand;
  const width = Math.max(1, span.max - span.min);
  const t = Math.max(0, Math.min(1, (tier - span.min) / width));
  return lo + t * (hi - lo);
}

/**
 * Maps a team rating onto the level's player pool. Ratings are already
 * universal by the time this is called, so this is close to the identity — it
 * only stretches the level's team range across the slightly wider player range,
 * because a squad contains players better and worse than its own team rating.
 */
export function bandFor(
  level: Level, rating: number, span: { min: number; max: number },
): number {
  const band = LEVELS[level].band;
  const width = Math.max(1, span.max - span.min);
  const t = (rating - span.min) / width;
  // Ratings either side of the level's overall range (a great defence on a poor
  // team) are allowed a little room outside the band rather than being clipped.
  return Math.max(band.lo - 5, Math.min(band.hi + 3, band.lo + t * (band.hi - band.lo)));
}

/**
 * The inverse of `universalOverall`: how a team ranks AMONG ITS OWN PEERS,
 * on a 0-99 scale. Prestige, recruiting pull and staff quality are all
 * within-level ideas — the best programme in Class D has enormous pull in
 * Class D — so they are read back off the universal rating with this.
 */
export function withinLevelStanding(level: Level, overall: number): number {
  const { lo, hi } = LEVELS[level].overallBand;
  const t = (overall - lo) / Math.max(1, hi - lo);
  return Math.max(0, Math.min(99, t * 99));
}

/** The middle of a level on the universal scale, for "is this good for here?". */
export function levelMidpoint(level: Level): number {
  const { lo, hi } = LEVELS[level].overallBand;
  return (lo + hi) / 2;
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
