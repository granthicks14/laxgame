/* ---------------------------------------------------------------------------
 * LEAGUE STATISTICS
 * ---------------------------------------------------------------------------
 * Leaderboards need a stat line for every player in the district, not just the
 * ones on your team. Rather than storing forty rosters' worth of numbers in
 * every save, these are DERIVED: rosters are deterministic from the team and
 * the season, and every result is already in the schedule, so a game's goals
 * can be shared out the same way every time it is asked for.
 *
 * That means nothing is invented on the fly and nothing drifts: ask twice, get
 * the same table. Your own team's line is the real one, tracked play by play;
 * every other team's is the game's own record of games it simulated.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import { generateRoster, type PlayerData } from '../data/players';
import type { Position } from '../data/constants';
import { getTeam } from '../data/teams';
import { tryWorldTeam } from '../data/world';
import type { Career, ScheduledGame } from './types';

export interface StatLine {
  playerId: string;
  name: string;
  teamId: string;
  pos: Position;
  overall: number;
  goals: number;
  assists: number;
  shots: number;
  saves: number;
  groundBalls: number;
  gamesPlayed: number;
}

export interface TeamSeasonStats {
  teamId: string;
  wins: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  games: number;
  shots: number;
  saves: number;
  faceoffWins: number;
  faceoffTakes: number;
}

/** How likely each position is to finish a goal. */
const SCORE_WEIGHT: Record<Position, number> = { A: 3.4, M: 2.2, D: 0.25, FO: 0.3, G: 0.02 };
const ASSIST_WEIGHT: Record<Position, number> = { A: 2.6, M: 2.6, D: 0.7, FO: 0.4, G: 0.15 };

function weightedPick(rng: Rng, roster: PlayerData[], weights: Record<Position, number>): PlayerData {
  let total = 0;
  const scores = roster.map((p) => {
    // Better players finish more. Depth chart order already sorts by overall.
    const w = weights[p.pos] * (0.4 + (p.overall / 100) ** 2.2);
    total += w;
    return w;
  });
  let r = rng.next() * total;
  for (let i = 0; i < roster.length; i++) {
    r -= scores[i];
    if (r <= 0) return roster[i];
  }
  return roster[roster.length - 1];
}

/**
 * The roster a team fielded in a given season. Attribute generation is seeded,
 * but player IDs are not — two calls produce equal players with different ids —
 * so rosters are cached per career and season. Without this, stats accumulated
 * against one copy of a roster cannot be read back off another, which is
 * exactly how the league leaderboard ended up showing only your own team.
 */
const rosterCache = new Map<string, PlayerData[]>();

export function seasonRoster(career: Career, teamId: string): PlayerData[] {
  if (teamId === career.teamId) return career.roster;
  const key = `${career.seed}:${career.year}:${career.level}:${teamId}`;
  let roster = rosterCache.get(key);
  if (!roster) {
    roster = generateRoster(tryWorldTeam(teamId) ?? getTeam(teamId), key, career.level);
    // One season of one career at a time is all that is ever needed.
    if (rosterCache.size > 120) rosterCache.clear();
    rosterCache.set(key, roster);
  }
  return roster;
}

interface Accum {
  goals: number;
  assists: number;
  shots: number;
  saves: number;
  groundBalls: number;
  games: number;
}

const blank = (): Accum => ({ goals: 0, assists: 0, shots: 0, saves: 0, groundBalls: 0, games: 0 });

/**
 * Shares one team's goals in one game out of among its players. Seeded from the
 * game id, so the same fixture always produces the same box score.
 */
function distribute(
  rng: Rng, roster: PlayerData[], goals: number, against: number, acc: Map<string, Accum>,
): void {
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) { a = blank(); acc.set(id, a); }
    return a;
  };
  for (const p of roster) get(p.id).games++;

  for (let i = 0; i < goals; i++) {
    const scorer = weightedPick(rng, roster, SCORE_WEIGHT);
    get(scorer.id).goals++;
    get(scorer.id).shots += 1;
    // Most goals are assisted; a solo dodge is not.
    if (rng.next() < 0.58) {
      const helper = weightedPick(rng, roster.filter((p) => p.id !== scorer.id), ASSIST_WEIGHT);
      get(helper.id).assists++;
    }
  }

  // Shots and ground balls scale off scoring at the rates the engine produces.
  const extraShots = Math.round(goals * 2.2 + rng.range(0, 6));
  for (let i = 0; i < extraShots; i++) {
    get(weightedPick(rng, roster, SCORE_WEIGHT).id).shots++;
  }
  const gbs = Math.round(14 + rng.range(0, 10));
  for (let i = 0; i < gbs; i++) {
    get(weightedPick(rng, roster, ASSIST_WEIGHT).id).groundBalls++;
  }

  // The keeper faces the other team's shots and stops the ones that missed.
  const keeper = roster.find((p) => p.pos === 'G');
  if (keeper) {
    const faced = Math.round(against * 3.1 + rng.range(0, 4));
    get(keeper.id).saves += Math.max(0, faced - against);
  }
}

/** Every player's line for the current season, league-wide. */
export function leagueStatLines(career: Career): StatLine[] {
  const acc = new Map<string, Map<string, Accum>>(); // teamId -> playerId -> line

  for (const g of career.schedule) {
    if (!g.played) continue;
    for (const side of ['home', 'away'] as const) {
      const teamId = side === 'home' ? g.homeId : g.awayId;
      // The user's own team keeps the real numbers it recorded on the field.
      if (teamId === career.teamId) continue;
      const goals = side === 'home' ? g.homeScore : g.awayScore;
      const against = side === 'home' ? g.awayScore : g.homeScore;
      const roster = seasonRoster(career, teamId);
      let table = acc.get(teamId);
      if (!table) { table = new Map(); acc.set(teamId, table); }
      distribute(new Rng(`${career.seed}:${g.id}:${side}`), roster, goals, against, table);
    }
  }

  const out: StatLine[] = [];
  for (const [teamId, table] of acc) {
    const roster = seasonRoster(career, teamId);
    for (const p of roster) {
      const a = table.get(p.id);
      if (!a || a.games === 0) continue;
      out.push({
        playerId: p.id,
        name: `${p.first} ${p.last}`,
        teamId,
        pos: p.pos,
        overall: p.overall,
        goals: a.goals,
        assists: a.assists,
        shots: a.shots,
        saves: a.saves,
        groundBalls: a.groundBalls,
        gamesPlayed: a.games,
      });
    }
  }

  // The user's squad, with its real tracked season.
  for (const p of career.roster) {
    if (p.season.gamesPlayed === 0) continue;
    out.push({
      playerId: p.id,
      name: `${p.first} ${p.last}`,
      teamId: career.teamId,
      pos: p.pos,
      overall: p.overall,
      goals: p.season.goals,
      assists: p.season.assists,
      shots: p.season.shots,
      saves: p.season.saves,
      groundBalls: p.season.groundBalls,
      gamesPlayed: p.season.gamesPlayed,
    });
  }
  return out;
}

export type LeaderCategory = 'points' | 'goals' | 'assists' | 'saves' | 'groundBalls';

export const LEADER_LABEL: Record<LeaderCategory, string> = {
  points: 'Points',
  goals: 'Goals',
  assists: 'Assists',
  saves: 'Saves',
  groundBalls: 'Ground balls',
};

export function leaderValue(line: StatLine, cat: LeaderCategory): number {
  switch (cat) {
    case 'points': return line.goals + line.assists;
    case 'goals': return line.goals;
    case 'assists': return line.assists;
    case 'saves': return line.saves;
    case 'groundBalls': return line.groundBalls;
  }
}

export function leaders(lines: StatLine[], cat: LeaderCategory, limit = 10): StatLine[] {
  return [...lines]
    .filter((l) => leaderValue(l, cat) > 0)
    .sort((a, b) => leaderValue(b, cat) - leaderValue(a, cat) || b.overall - a.overall)
    .slice(0, limit);
}

/** Team-level totals for the season, from the schedule itself. */
export function teamSeasonStats(career: Career, teamId: string): TeamSeasonStats {
  const row = career.standings[teamId];
  const out: TeamSeasonStats = {
    teamId,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    goalsFor: row?.goalsFor ?? 0,
    goalsAgainst: row?.goalsAgainst ?? 0,
    games: 0,
    shots: 0,
    saves: 0,
    faceoffWins: 0,
    faceoffTakes: 0,
  };
  for (const g of career.schedule) {
    if (!g.played) continue;
    if (g.homeId !== teamId && g.awayId !== teamId) continue;
    out.games++;
  }
  const lines = leagueStatLines(career).filter((l) => l.teamId === teamId);
  for (const l of lines) {
    out.shots += l.shots;
    out.saves += l.saves;
  }
  return out;
}

/** Records a simulated user game onto the user's own roster, so a season the
 *  player partly simulated still has a complete stat line. */
export function recordSimulatedUserGame(career: Career, game: ScheduledGame): void {
  const isHome = game.homeId === career.teamId;
  const goals = isHome ? game.homeScore : game.awayScore;
  const against = isHome ? game.awayScore : game.homeScore;
  const table = new Map<string, Accum>();
  distribute(new Rng(`${career.seed}:${game.id}:user`), career.roster, goals, against, table);
  for (const p of career.roster) {
    const a = table.get(p.id);
    if (!a) continue;
    p.season.gamesPlayed += a.games;
    p.season.goals += a.goals;
    p.season.assists += a.assists;
    p.season.shots += a.shots;
    p.season.saves += a.saves;
    p.season.groundBalls += a.groundBalls;
    p.career.gamesPlayed += a.games;
    p.career.goals += a.goals;
    p.career.assists += a.assists;
    p.career.shots += a.shots;
    p.career.saves += a.saves;
    p.career.groundBalls += a.groundBalls;
    // Simulated appearances still develop a player, at a slightly lower rate
    // than one you coached through yourself.
    p.xp += 3 + a.goals * 2 + a.assists * 1.5 + a.saves * 0.4;
  }
}
