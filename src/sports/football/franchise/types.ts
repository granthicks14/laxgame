import type { Player, Position } from '../data';
import type { Conference } from '../nfl';
import type { DifficultyKey, GamePlan, StatLine, TeamBox } from '../types';
import type { GameLengthKey } from '../tuning';

/* ---------------------------------------------------------------------------
 * WHAT A FRANCHISE IS MADE OF
 * ---------------------------------------------------------------------------
 * Types only, so the season engine, the draft, free agency, the trade desk and
 * a dozen screens can all talk about the same franchise without importing each
 * other's machinery.
 *
 * TWO RULES THE SHAPE ENFORCES, and everything in here follows from them:
 *
 *   ONLY YOUR OWN CLUB IS STORED. The other thirty-one rosters are rebuilt from
 *   (id, seed, year, drift) whenever anybody asks, so a thirty-season franchise
 *   is a few dozen kilobytes and the team you scouted is the team you play. The
 *   exceptions are the players you have actually moved — a trade writes a short
 *   edit against that club and nothing else.
 *
 *   EVERY PLAYER IS INVENTED. Nothing in this file has a slot for a real
 *   person's name, likeness or career, because no such thing goes in the game.
 * ------------------------------------------------------------------------- */

export const FRANCHISE_VERSION = 1;

export type FranchiseMode = 'dynasty' | 'challenge';

export type Stage = 'preseason' | 'regular' | 'playoffs' | 'offseason' | 'over';

/**
 * THE OFFSEASON, IN THE ORDER IT HAPPENS.
 *
 * One step at a time and each one finishes before the next opens, because an
 * offseason where free agency, the draft and contracts are all live at once is
 * a screen nobody can read on a phone.
 */
export type OffseasonStep =
  | 'review'      // what happened, who has aged, who improved, who retired
  | 'staff'       // the three men who coach it
  | 'contracts'   // your own expiring players, before anybody else can have them
  | 'freeagency'  // everybody else's
  | 'draft'       // scout, then pick
  | 'facilities'  // where the money goes
  | 'ready';      // nothing left to do but play

export const OFFSEASON_STEPS: OffseasonStep[] = [
  'review', 'staff', 'contracts', 'freeagency', 'draft', 'facilities', 'ready',
];

export const OFFSEASON_LABEL: Record<OffseasonStep, string> = {
  review: 'Season review',
  staff: 'Coaching staff',
  contracts: 'Your contracts',
  freeagency: 'Free agency',
  draft: 'The draft',
  facilities: 'Facilities',
  ready: 'Ready for camp',
};

export type PlayoffRound = 'wildcard' | 'divisional' | 'conference' | 'superbowl';

export const ROUND_LABEL: Record<PlayoffRound, string> = {
  wildcard: 'Wild Card',
  divisional: 'Divisional',
  conference: 'Conference Championship',
  superbowl: 'Super Bowl',
};

/* ------------------------------------------------------------------ fixtures */

export interface Fixture {
  id: string;
  week: number;
  homeId: string;
  awayId: string;
  played: boolean;
  homeScore: number;
  awayScore: number;
  /** True when it is your game. */
  featured: boolean;
  /** Inside the division, which is what a division is won by. */
  division: boolean;
  /** Inside the conference, which is the first tiebreaker after that. */
  conference: boolean;
  /** The fixture the town circles. */
  rivalry: boolean;
  round?: PlayoffRound;
  story?: { headline: string; line: string };
}

export interface Standing {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  divWins: number;
  divLosses: number;
  confWins: number;
  confLosses: number;
  /** Positive for a winning run, negative for a losing one. */
  streak: number;
}

/** A club's place in January, worked out once and read everywhere. */
export interface SeedEntry {
  teamId: string;
  seed: number;
  /** Set when the club won its division, which is what the top four are. */
  divisionId: string | null;
  bye: boolean;
}

/* --------------------------------------------------------------- the staff */

export type StaffRole = 'HC' | 'OC' | 'DC';

export const STAFF_ROLES: StaffRole[] = ['HC', 'OC', 'DC'];

export const STAFF_TITLE: Record<StaffRole, string> = {
  HC: 'Head Coach',
  OC: 'Offensive Coordinator',
  DC: 'Defensive Coordinator',
};

/**
 * WHAT EACH OF THE THREE IS RATED ON.
 *
 * Three numbers each, named by the role, and every one of them does something
 * the franchise reads: there is no "charisma" here that nothing consults.
 */
export const STAFF_LABELS: Record<StaffRole, [string, string, string]> = {
  HC: ['Leadership', 'Development', 'Management'],
  OC: ['Passing game', 'Running game', 'QB development'],
  DC: ['Pass defence', 'Run defence', 'Takeaways'],
};

export const STAFF_BLURB: Record<StaffRole, [string, string, string]> = {
  HC: [
    'Holds a locker room together through a bad month.',
    'Everybody on the roster gets better a little faster.',
    'Cap room, contract talks and what a trade costs you.',
  ],
  OC: [
    'Your quarterback throws it better and your receivers get open.',
    'The line holds and the backs hang onto it.',
    'How fast a young quarterback turns into one.',
  ],
  DC: [
    'The back seven covers.',
    'The front seven holds up against the run.',
    'Interceptions and loose balls, which is how a defence scores.',
  ],
};

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  age: number;
  /** The three numbers the role is judged on, in the order the labels are. */
  ratings: [number, number, number];
  overall: number;
  /** Millions a season, out of the club's funds rather than the salary cap. */
  salary: number;
  /** Seasons left on his contract, including this one. */
  yearsLeft: number;
  /** Seasons he has been here. */
  tenure: number;
}

/* ---------------------------------------------------------------- the club */

export type FacilityKey = 'training' | 'medical' | 'stadium' | 'scouting' | 'practice';

export const FACILITY_KEYS: FacilityKey[] = [
  'training', 'medical', 'stadium', 'scouting', 'practice',
];

export const FACILITY_MAX = 4;

export interface FacilityInfo {
  key: FacilityKey;
  label: string;
  blurb: string;
  /** What each level costs to build, from level 1 upward. */
  cost: [number, number, number, number];
  /** One line saying what this level is currently doing. */
  effect: (level: number) => string;
}

/* --------------------------------------------------------------- the draft */

export interface DraftPick {
  year: number;
  round: number;
  /** Whose pick it originally was, which is what decides where it lands. */
  fromId: string;
  /** Who holds it now. */
  ownerId: string;
}

export interface Prospect {
  id: string;
  first: string;
  last: string;
  pos: Position;
  college: string;
  age: number;
  /** The truth, which nobody sees until he has played. */
  player: Player;
  /** 0-3. How much work has gone into him. */
  scouted: number;
  /** What the board says he is. Noisy, and the noise shrinks as you scout. */
  grade: number;
  /** And what he might become, as a range rather than a number. */
  floor: number;
  ceiling: number;
  strengths: string[];
  weaknesses: string[];
  /** Where the room expects him to go. */
  projectedRound: number;
  takenBy: string | null;
  /** Overall pick number, once he is off the board. */
  takenAt: number | null;
}

/* --------------------------------------------------------- free agency */

export interface FreeAgent {
  id: string;
  player: Player;
  /** What he wants, a season. */
  askSalary: number;
  askYears: number;
  /** How keen he is on your club before you have offered anything, 0-100. */
  interest: number;
  /** How many other clubs are in it, which is what makes an auction. */
  suitors: number;
  /** Your bid, if you have made one. */
  offer: { salary: number; years: number } | null;
  /** Null while he is still deciding. Your id, or another club's. */
  signedBy: string | null;
  /** Said plainly on the screen once he has gone. */
  outcome: string | null;
}

/* ------------------------------------------------------------- the trade desk */

export type TradeAsset =
  | { kind: 'player'; id: string }
  | { kind: 'pick'; year: number; round: number; fromId: string };

export interface TradeProposal {
  withId: string;
  give: TradeAsset[];
  get: TradeAsset[];
}

export interface TradeVerdict {
  accepted: boolean;
  /** What they think of it, in one line. */
  reason: string;
  /** Their value of what you offered, minus their value of what you asked for. */
  margin: number;
}

/** A club's roster, after the players you have taken out of it and put into it. */
export interface RosterEdit {
  /** Player ids that are no longer theirs. */
  out: string[];
  /** Players you sent them. */
  in: Player[];
}

/* ------------------------------------------------------------------- record */

export interface SeasonRecord {
  year: number;
  teamId: string;
  coachName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  /** In words: 'Won the Super Bowl', 'Lost in the Divisional round', and so on. */
  finish: string;
  madePlayoffs: boolean;
  divisionTitle: boolean;
  conferenceTitle: boolean;
  champion: boolean;
  /** Who was the best player on it, for the history screen. */
  mvp: string | null;
}

export type NewsKind =
  | 'game' | 'injury' | 'signing' | 'draft' | 'staff' | 'league' | 'milestone' | 'trade';

export interface NewsItem {
  year: number;
  week: number;
  kind: NewsKind;
  text: string;
}

/** Somebody who has left, so a franchise has a past. */
export interface Departure {
  name: string;
  pos: Position;
  age: number;
  overall: number;
  reason: string;
}

/* ---------------------------------------------------------- challenge mode */

/**
 * THE HOT SEAT.
 *
 * Dynasty is a job for life. Challenge is not: an owner has an expectation for
 * the season before it starts, missing it heats the seat, and a seat that gets
 * hot enough ends the job. Beating it gets you looked at by better clubs.
 */
export interface ChallengeState {
  /** Seasons in this job. */
  seasonsHere: number;
  /** What the owner wants this year, in wins. */
  expectation: number;
  /** 0-100. At 100 the job is gone. */
  heat: number;
  /** Clubs currently offering, by id. */
  offers: string[];
  /** Every job he has held, oldest first. */
  jobs: { teamId: string; from: number; to: number | null }[];
  /** Set when the job has actually gone, so the screen can say so once. */
  sacked: boolean;
}

/* ---------------------------------------------------------------- the save */

export interface Franchise {
  version: number;
  mode: FranchiseMode;
  seed: number;
  year: number;

  /* --- where you are ----------------------------------------------------- */
  teamId: string;
  coachName: string;
  difficulty: DifficultyKey;
  /** null means the default, which is the honest choice for most people. */
  gameLength: GameLengthKey | null;
  gamePlan: GamePlan;

  /* --- the squad --------------------------------------------------------- */
  roster: Player[];
  staff: Record<StaffRole, Staff>;
  seasonStats: Record<string, StatLine>;
  careerStats: Record<string, StatLine>;
  /** Games missed so far this season, by player id, for the injury report. */
  gamesMissed: Record<string, number>;

  /* --- the money --------------------------------------------------------- */
  /** Millions of discretionary cash: facilities, staff and signing bonuses. */
  funds: number;
  lastRevenue: number;
  lastExpenses: number;
  /** 0-100. What the town thinks, which is most of what the gate is worth. */
  fanSupport: number;
  facilities: Record<FacilityKey, number>;

  /* --- the season -------------------------------------------------------- */
  stage: Stage;
  schedule: Fixture[];
  standings: Record<string, Standing>;
  playoffs: Fixture[];
  seeds: Record<Conference, SeedEntry[]> | null;
  championId: string | null;
  finish: string | null;
  /** False until the trophy screen has been shown for this one. */
  titleSeen: boolean;

  /* --- the franchise ----------------------------------------------------- */
  history: SeasonRecord[];
  news: NewsItem[];
  championships: number;
  conferenceTitles: number;
  divisionTitles: number;
  playoffApps: number;
  /** How far every club has drifted from its written prestige. */
  prestigeDrift: Record<string, number>;
  /** The only thing stored about anybody else's roster. */
  rosterEdits: Record<string, RosterEdit>;
  /** Every pick you hold, this year's and the next two. */
  picks: DraftPick[];

  /* --- the offseason ----------------------------------------------------- */
  offseasonStep: OffseasonStep;
  draftClass: Prospect[];
  /** Which overall pick the room is on, 1-based. Stored, so a save survives it. */
  draftCursor: number;
  scoutPoints: number;
  freeAgents: FreeAgent[];
  /** Free agency runs in three waves; the best men go first. */
  faWave: number;
  staffMarket: Staff[];
  lastDepartures: Departure[];
  lastDevelopment: { name: string; pos: Position; before: number; after: number }[];
  lastDraft: { round: number; pick: number; name: string; pos: Position; grade: number }[];

  /* --- Challenge only ---------------------------------------------------- */
  challenge?: ChallengeState;
}

/** A finished game, however it was resolved. */
export interface GameOutcome {
  homeScore: number;
  awayScore: number;
  box: Record<'home' | 'away', TeamBox>;
  lines: Record<string, StatLine>;
}
