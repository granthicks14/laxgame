import type { Player, Position } from '../data';
import type { FootballLevel } from '../levels';
import type { DifficultyKey, StatLine, TeamBox } from '../types';
import type { GameLengthKey } from '../tuning';

/* ---------------------------------------------------------------------------
 * WHAT A FOOTBALL CAREER IS MADE OF
 * ---------------------------------------------------------------------------
 * Types only, so the season engine, the offseason, the recruiting and the
 * screens can all talk about the same career without importing each other.
 *
 * THE ONE RULE THE SHAPE ENFORCES: only the coach's OWN programme is stored.
 * Every other roster in the world is derived from the club, the seed and the
 * year, so a thirty-season career is a few dozen kilobytes rather than a few
 * megabytes, and a save can never go stale against a world that changed.
 * ------------------------------------------------------------------------- */

export const FOOTBALL_CAREER_VERSION = 1;

export type FootballCareerMode = 'dynasty' | 'challenge';

export type SeasonStage =
  | 'preseason'
  | 'regular'
  | 'postseason'
  | 'offseason'
  | 'complete';

export type PostseasonRound = 'quarter' | 'semi' | 'final';

export interface Fixture {
  id: string;
  /** Which week of the season it falls in. */
  week: number;
  homeId: string;
  awayId: string;
  played: boolean;
  homeScore: number;
  awayScore: number;
  /** True when the coach's own club is playing. */
  featured: boolean;
  /** Inside the conference, which is what decides a divisional tie. */
  conference: boolean;
  /** The one fixture a season the town actually cares about. */
  rivalry: boolean;
  postseason?: PostseasonRound;
  /** A one-line recap, written when the coach's own game finishes. */
  story?: { headline: string; line: string };
}

export interface Standing {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Inside the conference, which breaks a tie before anything else does. */
  confWins: number;
  confLosses: number;
}

/**
 * THE COACH HIMSELF.
 *
 * Coach Points are the one currency in the career and they buy the one thing a
 * football coach actually buys: better coaching. Every upgrade below changes
 * what the programme DOES — how fast players develop, how far recruiting
 * reaches, how well the line holds — rather than adding a number to a rating.
 */
export interface Coach {
  name: string;
  points: number;
  /** Points spent, ever. The number a long career is measured by. */
  spent: number;
  /** Upgrade id -> how many ranks bought. */
  upgrades: Record<string, number>;
  /** Wins and losses across every job he has held. */
  careerWins: number;
  careerLosses: number;
  careerTies: number;
  /** How the board feels. 0-99; under 25 and the job is in trouble. */
  reputation: number;
}

/** One line in the programme's history, written at the end of every season. */
export interface SeasonRecord {
  year: number;
  teamId: string;
  level: FootballLevel;
  wins: number;
  losses: number;
  ties: number;
  /** What happened in the postseason, in words. */
  finish: string;
  champion: boolean;
  pointsFor: number;
  pointsAgainst: number;
}

/** A player who has left, kept so a programme has alumni. */
export interface Alumnus {
  id: string;
  name: string;
  pos: Position;
  /** Overall when he left. */
  overall: number;
  years: number;
  yearLeft: number;
  /** Everything he did while he was here. */
  line: StatLine;
  /** Why he is gone. */
  reason: 'graduated' | 'transferred' | 'retired' | 'signed elsewhere';
}

/** Somebody the programme is chasing. */
export interface Recruit {
  id: string;
  first: string;
  last: string;
  pos: Position;
  /** What he will be worth when he arrives. */
  overall: number;
  potential: number;
  /** 1-5, what the recruiting services think. */
  stars: number;
  /** How keen he is on this programme, 0-100. */
  interest: number;
  /** How many scouting visits have gone his way. */
  attention: number;
  /** True once an offer is on the table. */
  offered: boolean;
  /** Set when he has committed somewhere. */
  committedTo: string | null;
  /** The player he becomes if he signs. */
  player: Player;
}

/** Somebody else's player who could be persuaded. */
export interface Target {
  id: string;
  player: Player;
  fromId: string;
  /** 0-100. */
  interest: number;
  pitched: boolean;
  /** Set once he has decided. */
  landedAt: string | null;
}

/** Where the coach sits on the climb, in Challenge mode. */
export interface ChallengeState {
  /** Index into the ladder, 0 at the bottom. */
  rungIndex: number;
  /** Seasons in the current job. */
  seasonsHere: number;
  /** How close the board is to acting. 0-100, and 100 is the sack. */
  heat: number;
  /** Jobs currently on the table, by club id. */
  offers: string[];
  /** Every job he has held, oldest first. */
  jobs: { teamId: string; level: FootballLevel; from: number; to: number | null }[];
}

export interface FootballCareer {
  version: number;
  mode: FootballCareerMode;
  seed: number;
  year: number;

  /* --- where the coach is ------------------------------------------------ */
  teamId: string;
  level: FootballLevel;
  conferenceId: string;
  difficulty: DifficultyKey;
  /** null means the level's own length, which is the honest default. */
  gameLength: GameLengthKey | null;

  /* --- the squad --------------------------------------------------------- */
  roster: Player[];
  /** Season lines by player id; career lines survive a graduation. */
  season: Record<string, StatLine>;
  careerStats: Record<string, StatLine>;

  /* --- the season -------------------------------------------------------- */
  stage: SeasonStage;
  schedule: Fixture[];
  standings: Record<string, Standing>;
  postseasonSeeds: string[] | null;
  postseason: Fixture[];
  championId: string | null;
  finish: string | null;
  /** False until the championship screen has been shown for this title. */
  titleSeen: boolean;

  /* --- the programme ----------------------------------------------------- */
  coach: Coach;
  championships: number;
  history: SeasonRecord[];
  alumni: Alumnus[];
  /**
   * How every programme in the world has drifted from its written standing.
   * Winning lifts you; a bad decade sinks you. Only what has moved is stored.
   */
  standingDrift: Record<string, number>;

  /* --- the offseason ----------------------------------------------------- */
  /** This year's recruiting class, generated once the season is over. */
  recruits: Recruit[];
  /** Other people's players who could be persuaded to come. */
  market: Target[];
  /** Who left and why, for the offseason screen. */
  lastDepartures: { name: string; pos: Position; reason: string }[];
  /** Who improved and by how much. */
  lastDevelopment: { name: string; pos: Position; before: number; after: number }[];
  /** Offers left this offseason. */
  offersLeft: number;
  /** Scouting visits left this offseason. */
  visitsLeft: number;

  /* --- Challenge only ---------------------------------------------------- */
  challenge?: ChallengeState;
}

/** A finished game, whether it was played or simulated. */
export interface GameOutcome {
  homeScore: number;
  awayScore: number;
  box: Record<'home' | 'away', TeamBox>;
  /** The coach's own players' lines, by player id. */
  lines: Record<string, StatLine>;
}

export const emptyCoach = (name: string): Coach => ({
  name,
  points: 0,
  spent: 0,
  upgrades: {},
  careerWins: 0,
  careerLosses: 0,
  careerTies: 0,
  reputation: 50,
});
