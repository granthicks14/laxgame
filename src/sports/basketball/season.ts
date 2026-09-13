import { Rng } from '../../core/rng';
import { load, removeRaw, save } from '../../core/storage';
import { clearProgress, noteProgress } from '../../state/hubIndex';
import { TEAMS, generateRoster, teamRatings, type HoopsPlayer, type HoopsTeam } from './data';
import { HoopsGame } from './Game';
import { DIFFICULTIES, GAME_LENGTHS, type GameLengthKey } from './tuning';
import type { DifficultyKey, TeamBox } from './types';

/* ---------------------------------------------------------------------------
 * A BASKETBALL SEASON
 * ---------------------------------------------------------------------------
 * Twelve clubs, a double round robin, and a bracket at the end of it. Short
 * enough to finish, long enough that one bad night does not decide it.
 *
 * The design rule is the one the lacrosse career follows: NOTHING DERIVED IS
 * STORED. The save holds the schedule, the results and which team you coach —
 * facts that happened. Standings, seeds, the bracket, who is eliminated and every
 * statistic are recomputed from those results whenever they are asked for, so
 * there is no second copy of the table to drift out of step with the games, and
 * no migration to write when the standings gain a column.
 *
 * A game the player does not want to play is simulated by the SAME engine at the
 * same fixed step. There is no separate season simulator that could disagree with
 * what happens on the floor.
 * ------------------------------------------------------------------------- */

export const SEASON_VERSION = 1;
const KEY = `lsl.hoops.season.v${SEASON_VERSION}`;

export interface SeasonResult {
  /** Index into the schedule. */
  game: number;
  homeScore: number;
  awayScore: number;
  /** True when the player played it rather than simulating. */
  played: boolean;
}

export interface Fixture {
  homeId: string;
  awayId: string;
  /** Round number, so the schedule reads like a calendar. */
  round: number;
}

export type SeasonStage = 'regular' | 'playoffs' | 'done';

export interface PlayoffGame {
  round: 'conf-semi' | 'conf-final' | 'final';
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface HoopsSeason {
  version: number;
  seed: number;
  /** The club the player coaches. */
  teamId: string;
  difficulty: DifficultyKey;
  length: GameLengthKey;
  schedule: Fixture[];
  results: SeasonResult[];
  /** Set once the regular season is done. */
  playoffs: PlayoffGame[];
  stage: SeasonStage;
  championId: string | null;
  /** Season number, so a player can run more than one. */
  year: number;
  /** Titles won across every season on this save. */
  titles: number;
}

/* ------------------------------------------------------------------ schedule */

/**
 * A double round robin: everybody plays everybody, home and away. Twenty-two
 * games each, ordered so a club never plays twice in the same round.
 */
export function buildSchedule(seed: number): Fixture[] {
  const rng = new Rng(`hoops:sched:${seed}`);
  const ids = TEAMS.map((t) => t.id);
  const fixtures: Fixture[] = [];
  // Circle method, which produces a clean round-by-round calendar.
  const n = ids.length;
  const rotation = [...ids];
  for (let half = 0; half < 2; half++) {
    for (let round = 0; round < n - 1; round++) {
      for (let i = 0; i < n / 2; i++) {
        const a = rotation[i];
        const b = rotation[n - 1 - i];
        // Alternate who hosts, and swap it in the second half.
        const homeFirst = (round + i) % 2 === 0 ? half === 0 : half === 1;
        fixtures.push({
          homeId: homeFirst ? a : b,
          awayId: homeFirst ? b : a,
          round: half * (n - 1) + round + 1,
        });
      }
      // Rotate all but the first.
      rotation.splice(1, 0, rotation.pop()!);
    }
  }
  // Shuffle within each round so the calendar is not alphabetical.
  const byRound = new Map<number, Fixture[]>();
  for (const f of fixtures) {
    const list = byRound.get(f.round) ?? [];
    list.push(f);
    byRound.set(f.round, list);
  }
  const out: Fixture[] = [];
  for (const round of [...byRound.keys()].sort((a, b) => a - b)) {
    out.push(...rng.shuffle(byRound.get(round)!));
  }
  return out;
}

export function createSeason(
  teamId: string, difficulty: DifficultyKey, length: GameLengthKey, seed?: number,
): HoopsSeason {
  const s = seed ?? new Rng(`hoops:new:${Date.now()}`).int(1, 0x7fff_ffff);
  return {
    version: SEASON_VERSION,
    seed: s,
    teamId,
    difficulty,
    length,
    schedule: buildSchedule(s),
    results: [],
    playoffs: [],
    stage: 'regular',
    championId: null,
    year: 1,
    titles: 0,
  };
}

/* ---------------------------------------------------------------- standings */

export interface StandingRow {
  team: HoopsTeam;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Games played, so a mid-season table reads correctly. */
  played: number;
}

export function standings(season: HoopsSeason): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const team of TEAMS) {
    rows.set(team.id, {
      team, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, played: 0,
    });
  }
  for (const r of season.results) {
    const f = season.schedule[r.game];
    if (!f) continue;
    const home = rows.get(f.homeId);
    const away = rows.get(f.awayId);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.pointsFor += r.homeScore;
    home.pointsAgainst += r.awayScore;
    away.pointsFor += r.awayScore;
    away.pointsAgainst += r.homeScore;
    if (r.homeScore > r.awayScore) { home.wins++; away.losses++; } else { away.wins++; home.losses++; }
  }
  return [...rows.values()].sort((a, b) =>
    (b.wins - b.losses) - (a.wins - a.losses)
    || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
    || a.team.city.localeCompare(b.team.city));
}

export function conferenceTable(season: HoopsSeason, conf: 'East' | 'West'): StandingRow[] {
  return standings(season).filter((r) => r.team.conference === conf);
}

export const seasonRecord = (season: HoopsSeason): { wins: number; losses: number } => {
  const row = standings(season).find((r) => r.team.id === season.teamId);
  return { wins: row?.wins ?? 0, losses: row?.losses ?? 0 };
};

/** The next fixture the player's club has not yet played. */
export function nextUserGame(season: HoopsSeason): { index: number; fixture: Fixture } | null {
  const done = new Set(season.results.map((r) => r.game));
  for (let i = 0; i < season.schedule.length; i++) {
    if (done.has(i)) continue;
    const f = season.schedule[i];
    if (f.homeId === season.teamId || f.awayId === season.teamId) {
      return { index: i, fixture: f };
    }
  }
  return null;
}

/** Everything before the player's next game, so the league keeps pace with them. */
export function pendingBefore(season: HoopsSeason): number[] {
  const next = nextUserGame(season);
  const limit = next ? next.index : season.schedule.length;
  const done = new Set(season.results.map((r) => r.game));
  const out: number[] = [];
  for (let i = 0; i < limit; i++) if (!done.has(i)) out.push(i);
  return out;
}

/* ------------------------------------------------------------------ playing */

const rosterCache = new Map<string, HoopsPlayer[]>();

/** Rosters are generated from the season seed, so they are stable all year. */
export function rosterFor(season: HoopsSeason, teamId: string): HoopsPlayer[] {
  const key = `${season.seed}:${teamId}`;
  const cached = rosterCache.get(key);
  if (cached) return cached;
  const team = TEAMS.find((t) => t.id === teamId) ?? TEAMS[0];
  const roster = generateRoster(team, season.seed);
  rosterCache.set(key, roster);
  return roster;
}

export function gameFor(season: HoopsSeason, index: number, humanSide: 'home' | 'away' | null): HoopsGame {
  const f = season.schedule[index];
  const home = TEAMS.find((t) => t.id === f.homeId) ?? TEAMS[0];
  const away = TEAMS.find((t) => t.id === f.awayId) ?? TEAMS[1];
  return new HoopsGame({
    home: { team: home, roster: rosterFor(season, home.id) },
    away: { team: away, roster: rosterFor(season, away.id) },
    humanSide,
    quarterSeconds: GAME_LENGTHS[season.length].quarterSeconds,
    difficulty: DIFFICULTIES[season.difficulty],
    // One seed per fixture, so simulating a game and playing it start from the
    // same league state and a re-simulated game does not change its own result.
    seed: new Rng(`hoops:game:${season.seed}:${index}`).int(1, 0x7fff_ffff),
  });
}

/** Simulate one fixture and record it. */
export function simulateGame(season: HoopsSeason, index: number): SeasonResult {
  const game = gameFor(season, index, null);
  game.simulateRest();
  const result: SeasonResult = {
    game: index,
    homeScore: game.score.home,
    awayScore: game.score.away,
    played: false,
  };
  season.results.push(result);
  return result;
}

/** Record a game the player actually played. */
export function recordUserGame(season: HoopsSeason, index: number, game: HoopsGame): void {
  season.results.push({
    game: index,
    homeScore: game.score.home,
    awayScore: game.score.away,
    played: true,
  });
}

/** Catch the league up to the player, then check whether the season is over. */
export function advanceLeague(season: HoopsSeason): void {
  for (const i of pendingBefore(season)) simulateGame(season, i);
  if (season.stage === 'regular' && season.results.length >= season.schedule.length) {
    beginPlayoffs(season);
  }
}

/* ----------------------------------------------------------------- playoffs */

/** Top four in each conference, seeded on the table. */
export function playoffSeeds(season: HoopsSeason): { East: StandingRow[]; West: StandingRow[] } {
  return {
    East: conferenceTable(season, 'East').slice(0, 4),
    West: conferenceTable(season, 'West').slice(0, 4),
  };
}

export function beginPlayoffs(season: HoopsSeason): void {
  const seeds = playoffSeeds(season);
  season.stage = 'playoffs';
  season.playoffs = [
    { round: 'conf-semi', homeId: seeds.East[0].team.id, awayId: seeds.East[3].team.id, homeScore: null, awayScore: null },
    { round: 'conf-semi', homeId: seeds.East[1].team.id, awayId: seeds.East[2].team.id, homeScore: null, awayScore: null },
    { round: 'conf-semi', homeId: seeds.West[0].team.id, awayId: seeds.West[3].team.id, homeScore: null, awayScore: null },
    { round: 'conf-semi', homeId: seeds.West[1].team.id, awayId: seeds.West[2].team.id, homeScore: null, awayScore: null },
  ];
}

const winnerOf = (g: PlayoffGame): string | null => {
  if (g.homeScore === null || g.awayScore === null) return null;
  return g.homeScore > g.awayScore ? g.homeId : g.awayId;
};

/** The next playoff game waiting to be played, building each round as it comes. */
export function nextPlayoffGame(season: HoopsSeason): PlayoffGame | null {
  const pending = season.playoffs.find((g) => g.homeScore === null);
  if (pending) return pending;

  const semis = season.playoffs.filter((g) => g.round === 'conf-semi');
  const finals = season.playoffs.filter((g) => g.round === 'conf-final');
  const decider = season.playoffs.find((g) => g.round === 'final');

  if (semis.length === 4 && finals.length === 0) {
    const w = semis.map(winnerOf);
    if (w.every((x) => x)) {
      season.playoffs.push(
        { round: 'conf-final', homeId: w[0]!, awayId: w[1]!, homeScore: null, awayScore: null },
        { round: 'conf-final', homeId: w[2]!, awayId: w[3]!, homeScore: null, awayScore: null },
      );
      return season.playoffs.find((g) => g.homeScore === null) ?? null;
    }
  }
  if (finals.length === 2 && !decider) {
    const w = finals.map(winnerOf);
    if (w.every((x) => x)) {
      season.playoffs.push(
        { round: 'final', homeId: w[0]!, awayId: w[1]!, homeScore: null, awayScore: null },
      );
      return season.playoffs.find((g) => g.homeScore === null) ?? null;
    }
  }
  if (decider && winnerOf(decider)) {
    season.championId = winnerOf(decider);
    season.stage = 'done';
    if (season.championId === season.teamId) season.titles++;
  }
  return null;
}

/** A playoff game built for the engine. */
export function playoffGameFor(
  season: HoopsSeason, g: PlayoffGame, humanSide: 'home' | 'away' | null,
): HoopsGame {
  const home = TEAMS.find((t) => t.id === g.homeId) ?? TEAMS[0];
  const away = TEAMS.find((t) => t.id === g.awayId) ?? TEAMS[1];
  const label = g.round === 'final' ? 'The Final'
    : g.round === 'conf-final' ? 'Conference final' : 'Conference semi-final';
  return new HoopsGame({
    home: { team: home, roster: rosterFor(season, home.id) },
    away: { team: away, roster: rosterFor(season, away.id) },
    humanSide,
    quarterSeconds: GAME_LENGTHS[season.length].quarterSeconds,
    difficulty: DIFFICULTIES[season.difficulty],
    seed: new Rng(`hoops:po:${season.seed}:${g.round}:${g.homeId}:${g.awayId}`).int(1, 0x7fff_ffff),
    label,
  });
}

export function recordPlayoff(g: PlayoffGame, home: number, away: number): void {
  g.homeScore = home;
  g.awayScore = away;
}

/** Simulate every playoff game that does not involve the player's club. */
export function advancePlayoffs(season: HoopsSeason): void {
  let guard = 0;
  for (;;) {
    if (guard++ > 40) return;
    const g = nextPlayoffGame(season);
    if (!g) return;
    if (g.homeId === season.teamId || g.awayId === season.teamId) return;
    const sim = playoffGameFor(season, g, null);
    sim.simulateRest();
    recordPlayoff(g, sim.score.home, sim.score.away);
  }
}

/** Is the player still alive in the bracket? */
export function stillPlaying(season: HoopsSeason): boolean {
  if (season.stage !== 'playoffs') return season.stage === 'regular';
  const seeds = playoffSeeds(season);
  const inBracket = [...seeds.East, ...seeds.West].some((r) => r.team.id === season.teamId);
  if (!inBracket) return false;
  // Out if they lost a game in the bracket.
  return !season.playoffs.some((g) =>
    (g.homeId === season.teamId && g.awayScore !== null && g.awayScore > (g.homeScore ?? 0))
    || (g.awayId === season.teamId && g.homeScore !== null && g.homeScore > (g.awayScore ?? 0)));
}

/* --------------------------------------------------------------------- save */

export function isValidSeason(raw: unknown): raw is HoopsSeason {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Partial<HoopsSeason>;
  return s.version === SEASON_VERSION
    && typeof s.teamId === 'string'
    && Array.isArray(s.schedule) && s.schedule.length > 0
    && Array.isArray(s.results)
    && Array.isArray(s.playoffs)
    && typeof s.seed === 'number';
}

export function loadSeason(): HoopsSeason | null {
  const raw = load<unknown>(KEY, null);
  if (!isValidSeason(raw)) {
    if (raw) {
      // A save this build cannot read is discarded rather than half-applied, and
      // the player is told by the menu rather than shown a broken season.
      console.warn('[hoops] discarding an unreadable season save');
      removeRaw(KEY);
    }
    return null;
  }
  return raw;
}

export function saveSeason(season: HoopsSeason): void {
  save(KEY, season);
  const team = TEAMS.find((t) => t.id === season.teamId);
  const rec = seasonRecord(season);
  const where = season.stage === 'done'
    ? (season.championId === season.teamId ? 'champions' : 'season over')
    : season.stage === 'playoffs' ? 'in the playoffs'
      : `${rec.wins}-${rec.losses}`;
  noteProgress('basketball', 'Season',
    `${team?.abbr ?? '???'} · ${where}${season.titles ? ` · ${season.titles} title${season.titles === 1 ? '' : 's'}` : ''}`);
}

export function deleteSeason(): void {
  removeRaw(KEY);
  clearProgress('basketball');
}

/** Start the next season on the same save, keeping the titles won. */
export function rollOver(season: HoopsSeason): HoopsSeason {
  const next = createSeason(season.teamId, season.difficulty, season.length);
  next.year = season.year + 1;
  next.titles = season.titles;
  return next;
}

/** A one-line summary of a club, for the team picker. */
export function clubSummary(team: HoopsTeam, seed: number): string {
  const r = teamRatings(generateRoster(team, seed));
  return `${r.overall} overall · ${r.offense} offence · ${r.defense} defence · bench ${r.depth}`;
}

/** Team box totals for a finished game, used by the season report. */
export type { TeamBox };
