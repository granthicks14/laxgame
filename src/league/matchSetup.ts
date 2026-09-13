import { generateRoster, type PlayerData } from '../data/players';
import { GAME_LENGTHS, type GameLengthKey, type Side } from '../data/constants';
import type { DifficultyKey } from '../data/difficulty';
import type { TeamData } from '../data/teams';
import { areRivals } from '../data/teams';
import type { MatchConfig, PracticeConfig } from '../match/types';
import type { Level } from '../data/levels';
import { DEFAULT_TACTICS, type Tactics } from '../data/tactics';
import type { CoachEffects } from './coaching';

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
  /** Coaching quality, when a side has a programme behind it. */
  homeCoaching?: CoachEffects;
  awayCoaching?: CoachEffects;
  practice?: PracticeConfig;
  /** Show a highlight replay after each goal. Defaults to on. */
  replays?: boolean;
  /**
   * Which tier the fixture is played at. Rosters generated here are drawn from
   * that level's player band, so a professional game is not two high school
   * squads wearing different colours.
   */
  level?: Level;
}

export function makeMatchConfig(o: MatchSetupOptions): MatchConfig {
  const seed = o.seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffff));
  return {
    home: {
      team: o.homeTeam,
      roster: o.homeRoster ?? generateRoster(o.homeTeam, `${seed}:h`, o.level ?? 'hs'),
      tactics: o.homeTactics ?? tacticsFor(o.homeTeam),
      human: o.humanSide === 'home',
      coaching: o.homeCoaching,
    },
    away: {
      team: o.awayTeam,
      roster: o.awayRoster ?? generateRoster(o.awayTeam, `${seed}:a`, o.level ?? 'hs'),
      tactics: o.awayTactics ?? tacticsFor(o.awayTeam),
      human: o.humanSide === 'away',
      coaching: o.awayCoaching,
    },
    difficulty: o.difficulty,
    level: o.level ?? 'hs',
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
