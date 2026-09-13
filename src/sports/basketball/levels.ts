import type { HoopsPosition } from './data';

/* ---------------------------------------------------------------------------
 * THE PYRAMID
 * ---------------------------------------------------------------------------
 * Basketball is not one competition, it is a stack of them, and a coaching
 * career is the climb up it. This file is the shape of that stack: how good the
 * players are at each tier, how big the squads are, how long the season runs,
 * and what winning at that tier is called.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: the hierarchy is real. Every band
 * below is a window on the attribute pool a roster is drawn from, and the bands
 * climb — mean, best and worst all strictly increasing up the pyramid. They
 * OVERLAP at the edges, the way they do in life: the best team in college would
 * be competitive with the worst professional club and would still lose the
 * series. What is not allowed is a band that sits level with or below the one
 * beneath it, and `npm run hoops-world` fails the build if one ever does.
 *
 * Nothing else in the game may bend this. Difficulty tiers change decisions and
 * resources; they never change the standard of the basketball being played.
 * ------------------------------------------------------------------------- */

export type HoopsLevel =
  | 'hs-small'
  | 'hs-big'
  | 'juco'
  | 'd3'
  | 'd2'
  | 'd1-mid'
  | 'd1-high'
  | 'dev'
  | 'pro';

export const LEVEL_ORDER: HoopsLevel[] = [
  'hs-small', 'hs-big', 'juco', 'd3', 'd2', 'd1-mid', 'd1-high', 'dev', 'pro',
];

/**
 * How players arrive and leave at a tier.
 *
 *   class   Schoolboys and students. They have a year of eligibility, they
 *           graduate, and you replace them by recruiting the next ones.
 *   pro     Grown men on contracts. Nobody graduates; they age, decline and
 *           retire, and you replace them by signing somebody else's.
 */
export type AgeSystem = 'class' | 'pro';

export interface LevelInfo {
  key: HoopsLevel;
  /** Full name, as it would be said out loud. */
  name: string;
  /** Four to six characters, for tables. */
  short: string;
  /** What playing here is like. */
  blurb: string;
  ageSystem: AgeSystem;
  /**
   * The middle of the talent band: the attribute pool a roster at this tier is
   * drawn from. A team's prestige moves it up or down within the band by up to
   * `spread`; nothing else does.
   */
  par: number;
  /** How far the best programmes at this tier sit above the worst. */
  spread: number;
  /** Squad size. A high school keeps twelve; a professional roster is fifteen. */
  rosterSize: number;
  /** How many at each position a squad of that size should carry. */
  shape: Record<HoopsPosition, number>;
  /** Regular-season games. */
  games: number;
  /** How many of those are inside the conference. */
  conferenceGames: number;
  /** What the trophy is called. */
  trophy: string;
  /** What the postseason is called. */
  postseason: string;
  /** How many teams reach it, as a share of the level. */
  playoffShare: number;
  /** Quarter length in seconds for a played game at this tier. */
  quarterSeconds: number;
  /**
   * Years a player has at this tier before he is gone. Four at a school or a
   * four-year college, two at a junior college, and meaningless in a
   * professional league, where nobody graduates.
   */
  eligibility: number;
  /** Does this tier recruit (schoolboys) or sign (professionals)? */
  market: 'recruiting' | 'signing';
  /** What a new arrival is called here. */
  arrivalWord: string;
}

/**
 * The nine tiers.
 *
 * `par` climbs six or seven points a rung at the bottom and tightens at the top,
 * which is how basketball actually narrows: the gap between a small high school
 * and a big one is enormous, and the gap between a good professional club and a
 * great one is a few rating points and a lot of money. The top tier's band is
 * the one the twelve original clubs were already built to, so Play Now and the
 * standalone Season are exactly the competition they always were.
 */
export const LEVELS: Record<HoopsLevel, LevelInfo> = {
  'hs-small': {
    key: 'hs-small',
    name: 'Small-school high school',
    short: 'HS-S',
    blurb: 'A gym with one basket that works and twelve boys, eight of whom also play football.',
    ageSystem: 'class',
    par: 27,
    spread: 7,
    rosterSize: 12,
    shape: { PG: 2, SG: 3, SF: 3, PF: 2, C: 2 },
    games: 20,
    conferenceGames: 12,
    trophy: 'State Small-School Championship',
    postseason: 'the state tournament',
    playoffShare: 0.5,
    quarterSeconds: 120,
    eligibility: 4,
    market: 'recruiting',
    arrivalWord: 'freshman',
  },
  'hs-big': {
    key: 'hs-big',
    name: 'Large-school high school',
    short: 'HS-L',
    blurb: 'Packed Friday gyms, a booster club with opinions, and college coaches in the third row.',
    ageSystem: 'class',
    par: 34,
    spread: 7,
    rosterSize: 12,
    shape: { PG: 2, SG: 3, SF: 3, PF: 2, C: 2 },
    games: 24,
    conferenceGames: 14,
    trophy: 'State Championship',
    postseason: 'the state tournament',
    playoffShare: 0.5,
    quarterSeconds: 120,
    eligibility: 4,
    market: 'recruiting',
    arrivalWord: 'freshman',
  },
  juco: {
    key: 'juco',
    name: 'Junior college',
    short: 'JUCO',
    blurb: 'Two years to get somebody noticed, and a roster that turns over completely while you do it.',
    ageSystem: 'class',
    par: 40,
    spread: 7,
    rosterSize: 13,
    shape: { PG: 3, SG: 3, SF: 3, PF: 2, C: 2 },
    games: 26,
    conferenceGames: 16,
    trophy: 'National Junior College Championship',
    postseason: 'the national tournament',
    playoffShare: 0.4,
    quarterSeconds: 150,
    eligibility: 2,
    market: 'recruiting',
    arrivalWord: 'recruit',
  },
  d3: {
    key: 'd3',
    name: 'NCAA Division III',
    short: 'D-III',
    blurb: 'No scholarships, a bus, and players who are there because they want to be.',
    ageSystem: 'class',
    par: 44,
    spread: 6,
    rosterSize: 14,
    shape: { PG: 3, SG: 3, SF: 3, PF: 3, C: 2 },
    games: 26,
    conferenceGames: 16,
    trophy: 'Division III National Championship',
    postseason: 'the national tournament',
    playoffShare: 0.32,
    quarterSeconds: 150,
    eligibility: 4,
    market: 'recruiting',
    arrivalWord: 'recruit',
  },
  d2: {
    key: 'd2',
    name: 'NCAA Division II',
    short: 'D-II',
    blurb: 'Scholarships, athletes, and enough television to get you noticed or found out.',
    ageSystem: 'class',
    par: 48,
    spread: 6,
    rosterSize: 14,
    shape: { PG: 3, SG: 3, SF: 3, PF: 3, C: 2 },
    games: 28,
    conferenceGames: 18,
    trophy: 'Division II National Championship',
    postseason: 'the national tournament',
    playoffShare: 0.3,
    quarterSeconds: 150,
    eligibility: 4,
    market: 'recruiting',
    arrivalWord: 'recruit',
  },
  'd1-mid': {
    key: 'd1-mid',
    name: 'Division I mid-major',
    short: 'MID',
    blurb: 'One good March away from being remembered forever, and one bad January from being replaced.',
    ageSystem: 'class',
    par: 52,
    spread: 6,
    rosterSize: 14,
    shape: { PG: 3, SG: 3, SF: 3, PF: 3, C: 2 },
    games: 30,
    conferenceGames: 18,
    trophy: 'National Championship',
    postseason: 'the national tournament',
    playoffShare: 0.24,
    quarterSeconds: 180,
    eligibility: 4,
    market: 'recruiting',
    arrivalWord: 'recruit',
  },
  'd1-high': {
    key: 'd1-high',
    name: 'Division I high-major',
    short: 'HIGH',
    blurb: 'Twenty thousand people, a shoe contract and a fanbase that has already decided about you.',
    ageSystem: 'class',
    par: 56,
    spread: 6,
    rosterSize: 14,
    shape: { PG: 3, SG: 3, SF: 3, PF: 3, C: 2 },
    games: 30,
    conferenceGames: 18,
    trophy: 'National Championship',
    postseason: 'the national tournament',
    playoffShare: 0.25,
    quarterSeconds: 180,
    eligibility: 4,
    market: 'recruiting',
    arrivalWord: 'recruit',
  },
  dev: {
    key: 'dev',
    name: 'Development League',
    short: 'DEV',
    blurb: 'Professionals, most of them one phone call from the top league and one bad month from Europe.',
    ageSystem: 'pro',
    par: 59,
    spread: 5,
    rosterSize: 14,
    shape: { PG: 3, SG: 3, SF: 3, PF: 3, C: 2 },
    games: 32,
    conferenceGames: 20,
    trophy: 'Development League Championship',
    postseason: 'the playoffs',
    playoffShare: 0.5,
    quarterSeconds: 210,
    eligibility: 0,
    market: 'signing',
    arrivalWord: 'signing',
  },
  pro: {
    key: 'pro',
    name: 'The professional league',
    short: 'PRO',
    blurb: 'The best players alive, twelve clubs, and nowhere left to climb.',
    ageSystem: 'pro',
    par: 62,
    spread: 7,
    rosterSize: 15,
    shape: { PG: 3, SG: 3, SF: 3, PF: 3, C: 3 },
    games: 22,
    conferenceGames: 22,
    trophy: 'The Championship',
    postseason: 'the playoffs',
    playoffShare: 0.67,
    quarterSeconds: 210,
    eligibility: 0,
    market: 'signing',
    arrivalWord: 'signing',
  },
};

export const levelInfo = (level: HoopsLevel): LevelInfo => LEVELS[level];

/**
 * Everything `buildRoster` needs to make a squad for a programme at this level.
 * One place, so a tier's shape can never be described two different ways.
 */
export function rosterOptionsFor(level: HoopsLevel, par: number): {
  par: number; size: number; shape: Record<HoopsPosition, number>;
  ageSystem: AgeSystem; eligibility: number;
} {
  const info = LEVELS[level];
  return {
    par,
    size: info.rosterSize,
    shape: info.shape,
    ageSystem: info.ageSystem,
    eligibility: info.eligibility || 4,
  };
}

/** The middle of a level's talent band. */
export const levelPar = (level: HoopsLevel): number => LEVELS[level].par;

/** Squad shape at a level, which is what the needs screen measures against. */
export const rosterShape = (level: HoopsLevel): Record<HoopsPosition, number> =>
  LEVELS[level].shape;

/** Is this a level where players graduate? */
export const graduates = (level: HoopsLevel): boolean =>
  LEVELS[level].ageSystem === 'class';

/**
 * The rating a team of a given prestige plays at.
 *
 * Prestige is a WITHIN-LEVEL idea — 0..100, how this programme ranks among its
 * own peers — so the same 90 means "best in the state" at a high school and
 * "best club in the world" at the top. The level decides the band; prestige
 * decides where in the band.
 */
export function teamPar(level: HoopsLevel, prestige: number): number {
  const info = LEVELS[level];
  return info.par + ((prestige - 50) / 50) * info.spread;
}

/** Every level above this one, best first. Used by the job market. */
export function levelsAbove(level: HoopsLevel): HoopsLevel[] {
  const i = LEVEL_ORDER.indexOf(level);
  return LEVEL_ORDER.slice(i + 1);
}

export const levelIndex = (level: HoopsLevel): number => LEVEL_ORDER.indexOf(level);
