import { generateRoster, type PlayerData } from '../data/players';
import { GAME_LENGTHS, type GameLengthKey, type Side } from '../data/constants';
import type { DifficultyKey } from '../data/difficulty';
import type { TeamData } from '../data/teams';
import { areRivals } from '../data/teams';
import type { MatchConfig, PracticeConfig } from '../match/types';
import { DEFAULT_TACTICS, type Tactics } from '../data/tactics';

/** An AI team plays the way its scouting report says it plays. */
export function tacticsFor(team: TeamData): Tactics {
  switch (team.identity) {
    case 'offense': return { offense: 'aggressive', defense: 'balanced' };
    case 'defense': return { offense: 'possession', defense: 'conservative' };
    case 'transition': return { offense: 'fast', defense: 'aggressive' };
    case 'goalie': return { offense: 'possession', defense: 'conservative' };
    case 'faceoff': return { offense: 'balanced', defense: 'aggressive' };
    default: return { ...DEFAULT_TACTICS };
  }
}

export interface MatchSetupOptions {
  homeTeam: TeamData;
  awayTeam: TeamData;
  humanSide: Side | null;
  difficulty: DifficultyKey;
  gameLength: GameLengthKey;
  seed?: number;
  contextLabel?: string;
  suddenVictory?: boolean;
  homeRoster?: PlayerData[];
  awayRoster?: PlayerData[];
  homeTactics?: Tactics;
  awayTactics?: Tactics;
  practice?: PracticeConfig;
  /** Show a highlight replay after each goal. Defaults to on. */
  replays?: boolean;
}

export function makeMatchConfig(o: MatchSetupOptions): MatchConfig {
  const seed = o.seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffff));
  return {
    home: {
      team: o.homeTeam,
      roster: o.homeRoster ?? generateRoster(o.homeTeam, `${seed}:h`),
      tactics: o.homeTactics ?? tacticsFor(o.homeTeam),
      human: o.humanSide === 'home',
    },
    away: {
      team: o.awayTeam,
      roster: o.awayRoster ?? generateRoster(o.awayTeam, `${seed}:a`),
      tactics: o.awayTactics ?? tacticsFor(o.awayTeam),
      human: o.humanSide === 'away',
    },
    difficulty: o.difficulty,
    quarterSeconds: GAME_LENGTHS[o.gameLength].quarterSeconds,
    rivalry: areRivals(o.homeTeam.id, o.awayTeam.id),
    contextLabel: o.contextLabel,
    // Nothing ends level: every competitive game goes to sudden victory.
    suddenVictory: o.practice ? false : o.suddenVictory ?? true,
    seed,
    practice: o.practice,
    replays: o.practice ? false : o.replays ?? true,
  };
}
