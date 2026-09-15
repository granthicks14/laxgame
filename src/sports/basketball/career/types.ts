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
import type { PracticeArea } from './practice';

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
  /**
   * WHAT KIND OF GAME IT WAS, for the coach's own fixtures.
   *
   * The one thing in a career that is written down rather than derived, and for a
   * reason that is the same argument as everywhere else: a recap describes a BOX
   * SCORE, and the box score of a finished game cannot be recovered later. The
   * squad has developed, the practice emphasis has changed, and a coach may have
   * played the game himself — so re-simulating the fixture to recap it would
   * produce a recap of a game nobody played. Twenty-odd short strings a season is
   * the cheapest possible way to keep the recap honest, and it is thrown away with
   * the schedule when the next season starts.
   */
  story?: { kind: string; headline: string; line: string };
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
  /**
   * How many SEASONS fed this line. Zero on a season line, which is aggregating
   * games rather than seasons; one per season on a career line. It is the only
   * honest way to say "four seasons, 1,480 points" about a man who transferred
   * in as a junior, because his CLASS says four years and his time here was two.
   */
  seasons: number;
}

export const emptyStatLine = (): StatLine => ({
  games: 0, starts: 0, seasons: 0, points: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0,
  fta: 0, ftm: 0, offReb: 0, defReb: 0, assists: 0, steals: 0, blocks: 0,
  turnovers: 0, fouls: 0, seconds: 0,
});

/** Per-game averages, which is how basketball says a statistic. */
export interface Averages {
  games: number;
  ppg: number; rpg: number; apg: number; spg: number; bpg: number;
  fgPct: number; tpPct: number; ftPct: number; topg: number; mpg: number;
}

export function averages(line: StatLine | undefined): Averages {
  const g = Math.max(1, line?.games ?? 0);
  const l = line ?? emptyStatLine();
  return {
    games: l.games,
    ppg: l.points / g,
    rpg: (l.offReb + l.defReb) / g,
    apg: l.assists / g,
    spg: l.steals / g,
    bpg: l.blocks / g,
    topg: l.turnovers / g,
    mpg: l.seconds / g / 60,
    fgPct: l.fga > 0 ? l.fgm / l.fga : 0,
    tpPct: l.tpa > 0 ? l.tpm / l.tpa : 0,
    ftPct: l.fta > 0 ? l.ftm / l.fta : 0,
  };
}

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

/**
 * A player the programme used to have.
 *
 * Everything else in a career is about who is here NOW — the roster, the needs,
 * the development, the depth chart. Without this, a man's name left the save the
 * day he graduated and a twenty-year dynasty could not tell you who the best
 * player it ever had was. His career line is copied in as he goes, so it is
 * final and it cannot drift.
 */
export interface Alumnus {
  id: string;
  name: string;
  pos: string;
  /** What he was rated the day he left. */
  overall: number;
  /** The year he left, and why. */
  year: number;
  reason: string;
  /** Seasons in THIS programme, and everything he did in them. */
  seasons: number;
  line: StatLine;
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
  /**
   * What the squad is working on this week. Worth a small bonus in the next game
   * and a lean in the offseason's development; null means nobody is emphasising
   * anything, which is a legitimate choice and the default.
   */
  practice: PracticeArea | null;

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
  /** Everybody who has played here and gone, best kept first once it fills up. */
  alumni: Alumnus[];
  championships: number;
  careerWins: number;
  careerLosses: number;

  /** Only in Challenge: the coach's whole climb. */
  challenge: ChallengeState | null;
}
