import type { PlayerData } from '../data/players';
import type { ClassKey, TeamRatings } from '../data/teams';
import type { Tactics } from '../data/tactics';
import type { DifficultyKey } from '../data/difficulty';
import type { GameLengthKey } from '../data/constants';
import type { CoachStaff } from './coaching';
import type { TransferCandidate } from './transfers';
import type { MovementReport } from './promotion';

export type PlayoffRound = 'QF' | 'SF' | 'F';

export interface ScheduledGame {
  id: string;
  week: number;
  homeId: string;
  awayId: string;
  played: boolean;
  homeScore: number;
  awayScore: number;
  rivalry: boolean;
  playoff: PlayoffRound | null;
  /** True when the human's team is involved. */
  featured: boolean;
}

export interface StandingRow {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  goalsFor: number;
  goalsAgainst: number;
}

export type WeeklyFocus = 'offense' | 'defense' | 'faceoffs' | 'conditioning' | 'chemistry';

export interface SeasonRecord {
  year: number;
  wins: number;
  losses: number;
  finish: string;
  champion: boolean;
}

/** One line of the offseason development report. */
export interface DevelopmentEntry {
  name: string;
  pos: string;
  grade: number;
  from: number;
  to: number;
  outcome: string;
  label: string;
}

export interface Alumnus {
  name: string;
  pos: string;
  overall: number;
  gradYear: number;
  goals: number;
  assists: number;
  saves: number;
}

export interface Career {
  version: number;
  mode: 'season' | 'dynasty';
  seed: number;
  year: number;
  teamId: string;
  classKey: ClassKey;
  difficulty: DifficultyKey;
  gameLength: GameLengthKey;
  tactics: Tactics;

  schedule: ScheduledGame[];
  /** Index into `schedule` of the next game involving the player's team. */
  standings: Record<string, StandingRow>;
  /** Persistent rating drift for every team, applied on top of the base data file. */
  ratingOverrides: Record<string, Partial<TeamRatings>>;

  roster: PlayerData[];
  coachingPoints: number;
  focus: WeeklyFocus | null;
  prestige: number;

  /** Coach's office: what the programme has invested in. */
  staff: CoachStaff;
  /** Promotion and relegation moves every team, so the league carries its own
   *  class table on top of the data file. */
  classOverrides: Record<string, ClassKey>;
  /** Last offseason's league movement, for the screen that explains it. */
  lastMovement: MovementReport | null;
  /** The open transfer market, live only during an offseason. */
  market: TransferCandidate[];
  pitchesLeft: number;
  /** Development report from the last offseason. */
  lastDevelopment: DevelopmentEntry[];

  history: SeasonRecord[];
  alumni: Alumnus[];
  championships: number;
  careerWins: number;
  careerLosses: number;

  /** Set once the regular season is complete. */
  playoffSeeds: string[] | null;
  eliminated: boolean;
  seasonComplete: boolean;
  /** Result text for the season summary screen. */
  finish: string | null;
}

export const CAREER_VERSION = 5;
