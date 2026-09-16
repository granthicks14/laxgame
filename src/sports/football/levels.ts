import type { Position } from './data';

/* ---------------------------------------------------------------------------
 * THE PYRAMID
 * ---------------------------------------------------------------------------
 * Football is not one competition, it is a stack of them, and a coaching career
 * is the climb. This file is the shape of that stack: how good the players are
 * at each tier, how many of them there are, how long the season runs and what
 * winning it is called.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE is the same one the other two sports
 * keep: the hierarchy is REAL. Every band below is a window on the attribute
 * pool a roster is drawn from, and the bands climb — the middle, the top and the
 * bottom of each strictly above the one beneath it. They overlap at the edges
 * the way they do in life; what is never allowed is a band level with or below
 * the one under it, and `npm run gridiron-world` fails if one ever is.
 *
 * Difficulty never touches any of this. A Legend defence at a small high school
 * is a small high school defence that is well coached.
 * ------------------------------------------------------------------------- */

export type FootballLevel =
  | 'hs-small'
  | 'hs-big'
  | 'juco'
  | 'college-small'
  | 'college-big'
  | 'semipro'
  | 'pro';

export const LEVEL_ORDER: FootballLevel[] = [
  'hs-small', 'hs-big', 'juco', 'college-small', 'college-big', 'semipro', 'pro',
];

/**
 * How players arrive and leave at a tier.
 *
 *   class  Schoolboys and students: a year of eligibility, they graduate, and
 *          you replace them by recruiting the next ones.
 *   pro    Grown men on contracts: nobody graduates, they age and retire, and
 *          you replace them by signing somebody else's.
 */
export type AgeSystem = 'class' | 'pro';

export interface LevelInfo {
  key: FootballLevel;
  name: string;
  /** Six characters or fewer, for tables. */
  short: string;
  blurb: string;
  ageSystem: AgeSystem;
  /** The middle of the talent band a roster at this tier is drawn from. */
  par: number;
  /** How far the best programmes at this tier sit above the worst. */
  spread: number;
  /**
   * How many players a squad carries, and it has to agree with `shapeFor`
   * below: a level that tells recruiting it wants forty-five men while the
   * world only ever builds thirty-four of them produces a programme permanently
   * short of players and a coach who cannot work out why he is 0-11 every year.
   */
  rosterSize: number;
  /** Regular-season games. */
  games: number;
  /** How many teams make the postseason. */
  playoffTeams: number;
  /** What the trophy is called. */
  title: string;
  /** Coach Points a season at this level pays for doing the job well. */
  pointsPerWin: number;
}

export const LEVELS: Record<FootballLevel, LevelInfo> = {
  'hs-small': {
    key: 'hs-small',
    name: 'Small-school high school',
    short: '1A',
    blurb: 'Forty boys, one bus and a field with a scoreboard that sticks. '
      + 'Everybody plays both ways and half of them have never lifted.',
    ageSystem: 'class',
    par: 41, spread: 9, rosterSize: 28, games: 9, playoffTeams: 4,
    title: 'District title', pointsPerWin: 3,
  },
  'hs-big': {
    key: 'hs-big',
    name: 'Large-school high school',
    short: '5A',
    blurb: 'Friday nights in front of four thousand people. Real facilities, '
      + 'real coaching, and a quarterback who has been on a highlight reel.',
    ageSystem: 'class',
    par: 50, spread: 10, rosterSize: 31, games: 10, playoffTeams: 8,
    title: 'State championship', pointsPerWin: 4,
  },
  juco: {
    key: 'juco',
    name: 'Junior college',
    short: 'JUCO',
    blurb: 'Two years to be seen. Everybody here is somebody who did not get an '
      + 'offer, and they all know it.',
    ageSystem: 'class',
    par: 57, spread: 9, rosterSize: 31, games: 10, playoffTeams: 4,
    title: 'Bowl game', pointsPerWin: 5,
  },
  'college-small': {
    key: 'college-small',
    name: 'Small-college football',
    short: 'SMALL',
    blurb: 'Saturday afternoons, a few thousand in the stands, and a programme '
      + 'that lives or dies on developing players nobody else wanted.',
    ageSystem: 'class',
    par: 63, spread: 10, rosterSize: 31, games: 11, playoffTeams: 8,
    title: 'National championship', pointsPerWin: 6,
  },
  'college-big': {
    key: 'college-big',
    name: 'Major college football',
    short: 'MAJOR',
    blurb: 'Eighty thousand people and a television contract. The best players '
      + 'in the country who are not being paid to play.',
    ageSystem: 'class',
    par: 71, spread: 11, rosterSize: 34, games: 11, playoffTeams: 8,
    title: 'National championship', pointsPerWin: 8,
  },
  semipro: {
    key: 'semipro',
    name: 'Developmental league',
    short: 'DEV',
    blurb: 'Grown men with day jobs and one more year of believing. A league '
      + 'the professionals watch and occasionally raid.',
    ageSystem: 'pro',
    par: 76, spread: 9, rosterSize: 31, games: 11, playoffTeams: 4,
    title: 'League championship', pointsPerWin: 9,
  },
  pro: {
    key: 'pro',
    name: 'Professional football',
    short: 'PRO',
    blurb: 'The top of the sport. Every man on the field was the best player in '
      + 'his town, his county and his university, and half of them are cut by June.',
    ageSystem: 'pro',
    par: 83, spread: 9, rosterSize: 34, games: 11, playoffTeams: 8,
    title: 'Championship', pointsPerWin: 12,
  },
};

/** The band this level's rosters are drawn from, lowest to highest programme. */
export function levelBand(level: FootballLevel): { low: number; mid: number; high: number } {
  const info = LEVELS[level];
  return { low: info.par - info.spread / 2, mid: info.par, high: info.par + info.spread / 2 };
}

/**
 * The talent pool a specific programme draws from: the level's middle, moved
 * within the band by how strong the programme is and by nothing else.
 *
 * @param standing 0-99 WITHIN the level. The best high school and the best
 *                 professional club are both 95 — the pyramid does the rest.
 */
export function teamPar(level: FootballLevel, standing: number): number {
  const info = LEVELS[level];
  return info.par + ((standing - 50) / 50) * (info.spread / 2);
}

export const levelAbove = (l: FootballLevel): FootballLevel | null =>
  LEVEL_ORDER[LEVEL_ORDER.indexOf(l) + 1] ?? null;
export const levelBelow = (l: FootballLevel): FootballLevel | null =>
  LEVEL_ORDER[LEVEL_ORDER.indexOf(l) - 1] ?? null;

/**
 * How many at each position a squad carries at this tier.
 *
 * A high school squad is thin everywhere and a professional one carries a
 * third quarterback nobody will ever see play, and the difference is felt in
 * exactly one place: what happens when somebody in front gets hurt.
 */
export function shapeFor(level: FootballLevel): Record<Position, number> {
  const big = level === 'pro' || level === 'college-big';
  const mid = level === 'college-small' || level === 'semipro' || level === 'juco'
    || level === 'hs-big';
  return {
    QB: 2,
    RB: 3,
    WR: big ? 5 : 4,
    TE: big || mid ? 2 : 1,
    OL: big ? 6 : 5,
    DL: big ? 5 : 4,
    LB: 4,
    CB: big ? 4 : 3,
    S: big ? 3 : 2,
    K: 1,
    P: 1,
  };
}

/** How many men the shape adds up to, which is what `rosterSize` has to match. */
export const shapeSize = (level: FootballLevel): number =>
  Object.values(shapeFor(level)).reduce((a, b) => a + b, 0);

/**
 * THE FEWEST MEN A SQUAD CAN TAKE THE FIELD WITH.
 *
 * Not a target — a FLOOR, and it is the ENGINE'S requirement rather than a
 * roster-management opinion: the offence lines up three receivers and five
 * linemen, the defence lines up four down, three linebackers, two corners and
 * two safeties, and somebody has to kick it. A squad short of any of these
 * cannot field a play, and what it actually does is field the same man twice.
 *
 * Measured consequence of not enforcing it: a programme nine seasons in with no
 * linebackers at all, a run defence reading forty, and a coach with no way to
 * work out why he was losing.
 */
export const MINIMUM_SHAPE: Record<Position, number> = {
  QB: 1, RB: 2, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1,
};
