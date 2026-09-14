import type { BoxLine } from '../types';
import type { HoopsPlayer } from '../data';
import type { HoopsLevel } from '../levels';
import type { DefenseScheme, OffenseScheme } from '../schemes';
import type { HoopsCoach } from './coach';
import type { RecruitingState } from './recruit';
import type { TransferTarget, PortalDeparture } from './portal';
import type { ChallengeState } from './challenge';
import type { PointAward } from './coach';
import type { HoopsTier } from './difficulty';

/* ---------------------------------------------------------------------------
 * WHAT A BASKETBALL CAREER IS
 * ---------------------------------------------------------------------------
 * Types only, so every part of a career can talk about the same career without
 * importing the machinery of the others.
 *
 * THE SAVE IS SMALL ON PURPOSE. What is stored is what CANNOT be recomputed: the
 * coach, his squad, the results that have actually happened, and the decisions
 * he has made. Everything else — every other programme's roster, every rating,
 * every table, every need, every projection — is derived from the world and the
 * career's own seed whenever it is asked for. A twenty-year career is a few
 * dozen kilobytes, and a save can never disagree with itself about a number it
 * did not store.
 * ------------------------------------------------------------------------- */

export const HOOPS_CAREER_VERSION = 1;

export type HoopsCareerMode = 'dynasty' | 'challenge';

export interface HoopsFixture {
  id: string;
  /** Where in the season it falls. */
  round: number;
  homeId: string;
  awayId: string;
  played: boolean;
  homeScore: number;
  awayScore: number;
  /** True when the coach's own club is playing. */
  featured: boolean;
  /** Inside the conference, which is what seeds a conference tournament. */
  conference: boolean;
  /** The one fixture a season the crowd actually cares about. */
  rivalry: boolean;
  /** Set for postseason games. */
  postseason?: PostseasonRound;
}

export type PostseasonRound =
  | 'conf-quarter' | 'conf-semi' | 'conf-final'
  | 'first' | 'quarter' | 'semi' | 'final';

export const ROUND_LABEL: Record<PostseasonRound, string> = {
  'conf-quarter': 'Conference quarter-final',
  'conf-semi': 'Conference semi-final',
  'conf-final': 'Conference final',
  first: 'First round',
  quarter: 'Quarter-final',
  semi: 'Semi-final',
  final: 'The final',
};

export interface HoopsStanding {
  teamId: string;
  wins: number;
  losses: number;
  confWins: number;
  confLosses: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Home and away records, which a coach is judged on separately. */
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
  /** Current run, positive for wins. */
  streak: number;
}

/** A player's line over a season or a career. */
export interface StatLine extends BoxLine {
  games: number;
  starts: number;
}

export const emptyStatLine = (): StatLine => ({
  games: 0, starts: 0, points: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0,
  offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
  seconds: 0,
});

/** One completed season, for the history screen. */
export interface HoopsSeasonRecord {
  year: number;
  teamId: string;
  level: HoopsLevel;
  wins: number;
  losses: number;
  finish: string;
  champion: boolean;
  /** The best line anybody on the squad produced. */
  star: string | null;
}

/** What development did to one player over one offseason. */
export interface HoopsDevelopment {
  id: string;
  name: string;
  pos: string;
  years: number;
  from: number;
  to: number;
  outcome: 'breakout' | 'strong' | 'normal' | 'limited' | 'decline';
  label: string;
}

/** A player who left, and why. */
export interface HoopsDeparture {
  name: string;
  pos: string;
  overall: number;
  reason: string;
}

export type SeasonStage =
  | 'preseason'
  | 'regular'
  | 'postseason'
  | 'offseason'
  | 'complete';

export interface HoopsCareer {
  version: number;
  mode: HoopsCareerMode;
  seed: number;
  year: number;

  /* --- where the coach is ---------------------------------------------- */
  teamId: string;
  level: HoopsLevel;
  conferenceId: string;
  tier: HoopsTier;

  /* --- what he runs ----------------------------------------------------- */
  offense: OffenseScheme;
  defense: DefenseScheme;

  /* --- the squad -------------------------------------------------------- */
  roster: HoopsPlayer[];
  /** Season lines, by player id. Career lines survive a graduation. */
  season: Record<string, StatLine>;
  careerStats: Record<string, StatLine>;

  /* --- the season ------------------------------------------------------- */
  stage: SeasonStage;
  schedule: HoopsFixture[];
  standings: Record<string, HoopsStanding>;
  /** Seeds for the postseason, once the regular season is done. */
  postseasonSeeds: string[] | null;
  postseason: HoopsFixture[];
  championId: string | null;
  /** How the coach's season ended, in words. */
  finish: string | null;
  /** False until the championship screen has been shown for this title. */
  titleSeen: boolean;

  /* --- the programme ---------------------------------------------------- */
  coach: HoopsCoach;
  /**
   * How every programme in the world has drifted from its written standing.
   * Winning lifts you; a bad decade sinks you. Only the entries that have moved
   * are stored.
   */
  standingDrift: Record<string, number>;

  /* --- the offseason ---------------------------------------------------- */
  recruiting: RecruitingState | null;
  market: TransferTarget[];
  pitchesLeft: number;
  lastDevelopment: HoopsDevelopment[];
  /** What the last season paid, itemised, for the offseason report. */
  lastAwards: PointAward[];
  lastDepartures: HoopsDeparture[];
  portalOut: PortalDeparture[];

  /* --- the record ------------------------------------------------------- */
  history: HoopsSeasonRecord[];
  championships: number;
  careerWins: number;
  careerLosses: number;

  /** Only in Challenge: the coach's whole climb. */
  challenge: ChallengeState | null;
}
