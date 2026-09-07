import type { PlayerData } from '../data/players';
import type { DivisionKey, TeamRatings } from '../data/teams';
import type { Tactics } from '../data/tactics';
import type { DifficultyKey } from '../data/difficulty';
import type { GameLengthKey } from '../data/constants';

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
  division: DivisionKey;
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

export const CAREER_VERSION = 3;
