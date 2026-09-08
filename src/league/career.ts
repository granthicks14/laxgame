import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import {
  generateRoster, generatePlayer, sortDepthChart, refreshOverall, emptyStats,
  ROSTER_SHAPE, type Grade, type PlayerData, type PlayerAttrs, type PlayerStats,
} from '../data/players';
import {
  TEAMS, getTeam, teamsInClass, areRivals, type ClassKey, type TeamData, type TeamRatings,
} from '../data/teams';
import { DEFAULT_TACTICS } from '../data/tactics';
import { EMPTY_STAFF, coachEffects } from './coaching';
import { DEV_LABEL, developPlayer } from './development';
import { planMovement, type DivisionResult, type MovementReport } from './promotion';
import {
  MAX_PITCHES, buildMarket, pitch, type PitchResult, type ProgramSnapshot,
} from './transfers';
import { DIFFICULTIES, type DifficultyKey } from '../data/difficulty';
import { GAME_LENGTHS, type GameLengthKey } from '../data/constants';
import { buildSchedule, regularSeasonWeeks } from './schedule';
import { simulateGame } from './simulate';
import { recordSimulatedUserGame } from './leagueStats';
import {
  CAREER_VERSION, type Career, type DevelopmentEntry, type PlayoffRound,
  type ScheduledGame, type StandingRow, type WeeklyFocus,
} from './types';

export const FOCUS_INFO: Record<WeeklyFocus, { label: string; blurb: string }> = {
  offense: { label: 'Offensive Sets', blurb: 'Shooting and dodging sharpen. Attack develops faster.' },
  defense: { label: 'Defensive Slides', blurb: 'Marking and checking improve. Poles develop faster.' },
  faceoffs: { label: 'Faceoff Work', blurb: 'Wing play and clamps improve. More possessions.' },
  conditioning: { label: 'Conditioning', blurb: 'Stamina and speed across the whole roster.' },
  chemistry: { label: 'Team Chemistry', blurb: 'Cleaner passing and better off-ball movement.' },
};

const FOCUS_ATTRS: Record<WeeklyFocus, (keyof PlayerAttrs)[]> = {
  offense: ['shooting', 'shotAccuracy', 'shotPower', 'dodging'],
  defense: ['defense', 'checking', 'awareness'],
  faceoffs: ['faceoff', 'checking', 'acceleration'],
  conditioning: ['stamina', 'speed', 'acceleration'],
  chemistry: ['passing', 'awareness'],
};

/* --------------------------------------------------------------- creation */

export interface NewCareerOptions {
  mode: 'season' | 'dynasty';
  teamId: string;
  difficulty: DifficultyKey;
  gameLength: GameLengthKey;
  seed?: number;
}

export function createCareer(opts: NewCareerOptions): Career {
  const team = getTeam(opts.teamId);
  const seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffff));
  const career: Career = {
    version: CAREER_VERSION,
    mode: opts.mode,
    seed,
    year: 1,
    teamId: team.id,
    classKey: team.classKey,
    difficulty: opts.difficulty,
    gameLength: opts.gameLength,
    tactics: { ...DEFAULT_TACTICS },
    schedule: buildSchedule(team.classKey, team.id, seed),
    standings: initialStandings(team.classKey),
    ratingOverrides: {},
    roster: generateRoster(team, `${seed}:1`),
    coachingPoints: 12,
    focus: null,
    prestige: clamp(Math.round(team.overall * 0.6 + 20), 20, 92),
    staff: { ...EMPTY_STAFF },
    classOverrides: {},
    lastMovement: null,
    market: [],
    pitchesLeft: 0,
    lastDevelopment: [],
    history: [],
    alumni: [],
    championships: 0,
    careerWins: 0,
    careerLosses: 0,
    playoffSeeds: null,
    eliminated: false,
    seasonComplete: false,
    finish: null,
  };
  syncUserTeamRatings(career);
  return career;
}

/** Standings for a brand-new career, before any promotion has happened. */
function initialStandings(classKey: ClassKey): Record<string, StandingRow> {
  const rows: Record<string, StandingRow> = {};
  for (const t of teamsInClass(classKey)) {
    rows[t.id] = { teamId: t.id, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
  }
  return rows;
}

function emptyStandings(career: Career, classKey: ClassKey): Record<string, StandingRow> {
  const rows: Record<string, StandingRow> = {};
  for (const t of classMembers(career, classKey)) {
    rows[t.id] = { teamId: t.id, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
  }
  return rows;
}

/* ------------------------------------------------------------- team views */

/** The team as it exists in this career: base data plus any accumulated drift. */
export function effectiveTeam(career: Career, teamId: string): TeamData {
  const base = getTeam(teamId);
  const over = career.ratingOverrides[teamId];
  return over ? { ...base, ...over } : base;
}

const RATING_KEYS: (keyof TeamRatings)[] = [
  'overall', 'offense', 'defense', 'goalie', 'attack', 'midfield', 'faceoff', 'speed', 'chemistry',
];

/** Derive team ratings from the actual roster so development shows up everywhere. */
export function ratingsFromRoster(roster: PlayerData[], chemistry: number): TeamRatings {
  const best = (pos: string, n: number, pick: (p: PlayerData) => number) => {
    const group = roster.filter((p) => p.pos === pos).sort((a, b) => b.overall - a.overall).slice(0, n);
    if (!group.length) return 60;
    return group.reduce((s, p) => s + pick(p), 0) / group.length;
  };
  const attack = best('A', 3, (p) => p.overall);
  const midfield = best('M', 3, (p) => p.overall);
  const defense = best('D', 3, (p) => p.overall);
  const goalie = best('G', 1, (p) => p.overall);
  const fo = Math.max(
    best('FO', 1, (p) => p.attrs.faceoff),
    best('M', 1, (p) => p.attrs.faceoff),
  );
  const speed = roster.reduce((s, p) => s + p.attrs.speed, 0) / Math.max(1, roster.length);
  const offense = attack * 0.55 + midfield * 0.45;
  const def = defense * 0.6 + goalie * 0.4;
  const overall = offense * 0.42 + def * 0.42 + fo * 0.08 + chemistry * 0.08;
  return {
    overall: Math.round(overall),
    offense: Math.round(offense),
    defense: Math.round(def),
    goalie: Math.round(goalie),
    attack: Math.round(attack),
    midfield: Math.round(midfield),
    faceoff: Math.round(fo),
    speed: Math.round(speed),
    chemistry: Math.round(chemistry),
  };
}

export function syncUserTeamRatings(career: Career): void {
  const base = getTeam(career.teamId);
  const prev = career.ratingOverrides[career.teamId];
  const chem = prev?.chemistry ?? base.chemistry;
  const derived = ratingsFromRoster(career.roster, chem);
  career.ratingOverrides[career.teamId] = derived;
}

export function userTeam(career: Career): TeamData {
  return effectiveTeam(career, career.teamId);
}

/* ----------------------------------------------------------- schedule flow */

export function nextUserGame(career: Career): ScheduledGame | null {
  return career.schedule.find((g) => g.featured && !g.played) ?? null;
}

export function currentWeek(career: Career): number {
  const g = nextUserGame(career);
  if (g) return g.week;
  const last = career.schedule[career.schedule.length - 1];
  return last ? last.week : 1;
}

export function opponentOf(career: Career, game: ScheduledGame): string {
  return game.homeId === career.teamId ? game.awayId : game.homeId;
}

export function userIsHome(career: Career, game: ScheduledGame): boolean {
  return game.homeId === career.teamId;
}

function applyResult(career: Career, g: ScheduledGame, homeScore: number, awayScore: number): void {
  g.played = true;
  g.homeScore = homeScore;
  g.awayScore = awayScore;
  if (g.playoff) return; // playoff games do not count in the standings table
  const h = career.standings[g.homeId];
  const a = career.standings[g.awayId];
  if (!h || !a) return;
  h.goalsFor += homeScore; h.goalsAgainst += awayScore;
  a.goalsFor += awayScore; a.goalsAgainst += homeScore;
  if (homeScore > awayScore) { h.wins++; a.losses++; }
  else if (awayScore > homeScore) { a.wins++; h.losses++; }
  else { h.ties++; a.ties++; }
}

/** Simulated games are scaled to the career's game length so a simmed result
 *  looks like one you could have played. */
function lengthScale(career: Career): number {
  return GAME_LENGTHS[career.gameLength].quarterSeconds / GAME_LENGTHS.short.quarterSeconds;
}

/** Play out every non-featured game up to and including `week`. */
export function simulateThroughWeek(career: Career, week: number): void {
  const scale = lengthScale(career);
  for (const g of career.schedule) {
    if (g.played || g.week > week || g.featured) continue;
    const home = effectiveTeam(career, g.homeId);
    const away = effectiveTeam(career, g.awayId);
    const r = simulateGame(home, away, `${career.seed}:${career.year}:${g.id}`, scale);
    applyResult(career, g, r.homeScore, r.awayScore);
  }
}

/** Record the player's own game result and roll the league forward. */
export function recordUserResult(career: Career, g: ScheduledGame, homeScore: number, awayScore: number): void {
  applyResult(career, g, homeScore, awayScore);
  const won = userIsHome(career, g) ? homeScore > awayScore : awayScore > homeScore;
  if (won) { career.careerWins++; } else { career.careerLosses++; }

  // Coach Points are the currency of every choice in the office, so a season
  // has to be worth roughly one upgrade, not five. Around twenty a year means
  // a coach specialises for years before they can afford to be good at
  // everything — which is the decision the office is for.
  const diff = DIFFICULTIES[career.difficulty];
  let cp = 1 + (won ? 1 : 0) + (g.rivalry && won ? 1 : 0) + (g.playoff ? 1 : 0);
  cp = Math.max(1, Math.round(cp * diff.rewardMultiplier));
  career.coachingPoints += cp;
  career.prestige = clamp(career.prestige + (won ? 0.8 : -0.6) + (g.playoff && won ? 1.5 : 0), 5, 100);

  simulateThroughWeek(career, g.week);
  career.focus = null;
  advancePhase(career);
}

/** Simulate the player's own game instead of playing it. */
export function simulateUserGame(career: Career, g: ScheduledGame): void {
  const home = effectiveTeam(career, g.homeId);
  const away = effectiveTeam(career, g.awayId);
  const r = simulateGame(home, away, `${career.seed}:${career.year}:${g.id}:sim`, lengthScale(career));
  recordUserResult(career, g, r.homeScore, r.awayScore);
  // A simulated game still produced a box score: without this, a season the
  // player partly simulated would show holes in its own statistics.
  recordSimulatedUserGame(career, g);
  syncUserTeamRatings(career);
}

/* ----------------------------------------------------------------- playoffs */

export function standingsSorted(career: Career): StandingRow[] {
  return Object.values(career.standings).slice().sort((a, b) => {
    const pa = winPct(a);
    const pb = winPct(b);
    if (pb !== pa) return pb - pa;
    const da = a.goalsFor - a.goalsAgainst;
    const db = b.goalsFor - b.goalsAgainst;
    if (db !== da) return db - da;
    return b.goalsFor - a.goalsFor;
  });
}

export const winPct = (r: StandingRow): number => {
  const g = r.wins + r.losses + r.ties;
  return g === 0 ? 0 : (r.wins + r.ties * 0.5) / g;
};

const ROUND_NAME: Record<PlayoffRound, string> = {
  QF: 'Quarterfinal',
  SF: 'Semifinal',
  F: 'District Championship',
};
export const roundName = (r: PlayoffRound): string => ROUND_NAME[r];

/** How many teams make the playoffs, scaled so qualifying actually means
 *  something: roughly the top half, rounded to a bracket size. */
export function playoffFieldSize(teamCount: number): number {
  if (teamCount >= 12) return 8;
  if (teamCount >= 6) return 4;
  return 2;
}

const roundLabel = (teams: number): PlayoffRound => (teams >= 8 ? 'QF' : teams >= 4 ? 'SF' : 'F');

/** Called whenever the league might need to move to its next stage. */
export function advancePhase(career: Career): void {
  if (career.seasonComplete) return;
  const regWeeks = regularSeasonWeeks(career.schedule);
  const anyRegularLeft = career.schedule.some((g) => !g.played && !g.playoff);
  if (anyRegularLeft) return;

  if (!career.playoffSeeds) {
    const field = playoffFieldSize(classMembers(career, career.classKey).length);
    career.playoffSeeds = standingsSorted(career).slice(0, field).map((r) => r.teamId);
    createRound(career, roundLabel(field), career.playoffSeeds, regWeeks + 1);
    resolveNonFeatured(career);
    return;
  }

  const pending = career.schedule.filter((g) => g.playoff && !g.played);
  if (pending.length > 0) return;

  const lastRound = lastPlayoffRound(career);
  if (!lastRound) return;
  if (lastRound === 'F') { finishSeason(career); return; }

  const winners = roundWinners(career, lastRound);
  if (winners.length < 2) { finishSeason(career); return; }
  const weekOffset = lastRound === 'QF' ? 2 : 3;
  createRound(career, roundLabel(winners.length), winners, regWeeks + weekOffset);
  resolveNonFeatured(career);
}

function lastPlayoffRound(career: Career): PlayoffRound | null {
  let last: PlayoffRound | null = null;
  for (const g of career.schedule) if (g.playoff) last = g.playoff;
  return last;
}

function roundWinners(career: Career, round: PlayoffRound): string[] {
  const seeds = career.playoffSeeds ?? [];
  const games = career.schedule.filter((g) => g.playoff === round);
  const winners = games.map((g) => (g.homeScore > g.awayScore ? g.homeId : g.awayId));
  // Keep bracket order by original seed.
  return winners.sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
}

function createRound(career: Career, round: PlayoffRound, teams: string[], week: number): void {
  const pairs: [string, string][] = [];
  const list = [...teams];
  while (list.length >= 2) {
    const top = list.shift()!;
    const bottom = list.pop()!;
    pairs.push([top, bottom]);
  }
  for (const [homeId, awayId] of pairs) {
    career.schedule.push({
      id: `${round}-${homeId}-${awayId}`,
      week,
      homeId,
      awayId,
      played: false,
      homeScore: 0,
      awayScore: 0,
      rivalry: areRivals(homeId, awayId),
      playoff: round,
      featured: homeId === career.teamId || awayId === career.teamId,
    });
  }
  if (!pairs.some(([h, a]) => h === career.teamId || a === career.teamId)) {
    career.eliminated = true;
  }
}

/** Sim every playoff game the player is not in; if they are out, sim the lot. */
function resolveNonFeatured(career: Career): void {
  let guard = 0;
  while (guard++ < 8) {
    const pending = career.schedule.filter((g) => g.playoff && !g.played);
    if (!pending.length) break;
    let simmedAny = false;
    for (const g of pending) {
      if (g.featured && !career.eliminated) continue;
      const home = effectiveTeam(career, g.homeId);
      const away = effectiveTeam(career, g.awayId);
      const r = simulateGame(home, away, `${career.seed}:${career.year}:${g.id}`, lengthScale(career));
      applyResult(career, g, r.homeScore, r.awayScore);
      simmedAny = true;
    }
    const stillPending = career.schedule.some((g) => g.playoff && !g.played);
    if (stillPending) break;
    if (!simmedAny) break;
    advancePhase(career);
    break;
  }
}

function finishSeason(career: Career): void {
  const final = career.schedule.filter((g) => g.playoff === 'F').pop();
  let champion: string | null = null;
  if (final && final.played) {
    champion = final.homeScore > final.awayScore ? final.homeId : final.awayId;
  }
  const won = champion === career.teamId;
  const row = career.standings[career.teamId];
  let finish: string;
  if (won) finish = 'DISTRICT CHAMPIONS';
  else if (career.schedule.some((g) => g.playoff === 'F' && g.featured)) finish = 'Lost the championship game';
  else if (career.schedule.some((g) => g.playoff === 'SF' && g.featured)) finish = 'Lost in the semifinals';
  else if (career.schedule.some((g) => g.playoff === 'QF' && g.featured)) finish = 'Lost in the quarterfinals';
  else finish = 'Missed the playoffs';

  career.finish = finish;
  career.seasonComplete = true;
  if (won) {
    career.championships++;
    career.prestige = clamp(career.prestige + 8, 5, 100);
  }
  career.history.push({
    year: career.year,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    finish,
    champion: won,
  });
}

export function champion(career: Career): string | null {
  const final = career.schedule.filter((g) => g.playoff === 'F').pop();
  if (!final || !final.played) return null;
  return final.homeScore > final.awayScore ? final.homeId : final.awayId;
}

/* -------------------------------------------------------------- progression */

/** Merge one game's box score into season and career totals, and bank XP. */
export function applyGameStats(
  career: Career, stats: Map<string, PlayerStats>, won: boolean,
): void {
  for (const p of career.roster) {
    const s = stats.get(p.id);
    if (!s) continue;
    p.season = addStatsInto(p.season, s);
    p.career = addStatsInto(p.career, s);
    if (s.gamesPlayed === 0) { p.season.gamesPlayed++; p.career.gamesPlayed++; }
    const perf = s.goals * 3 + s.assists * 2.2 + s.groundBalls * 0.9
      + s.causedTurnovers * 2 + s.saves * 0.7 - s.turnovers * 0.6;
    p.xp += clamp(4 + perf, 1, 30) * (won ? 1.15 : 1);
  }
  syncUserTeamRatings(career);
}

function addStatsInto(target: PlayerStats, src: PlayerStats): PlayerStats {
  const out = { ...target };
  for (const k of Object.keys(src) as (keyof PlayerStats)[]) out[k] += src[k];
  return out;
}

export const TRAIN_COST = 5;

/** Spend coaching points to train one attribute. Returns false if it cannot be done. */
export function trainPlayer(career: Career, playerId: string, attr: keyof PlayerAttrs): boolean {
  if (career.coachingPoints < TRAIN_COST) return false;
  const p = career.roster.find((x) => x.id === playerId);
  if (!p) return false;
  if (p.attrs[attr] >= 99) return false;
  if (p.overall >= p.potential + 4) return false;
  career.coachingPoints -= TRAIN_COST;
  p.attrs[attr] = clamp(p.attrs[attr] + 2, 1, 99);
  refreshOverall(p);
  syncUserTeamRatings(career);
  return true;
}

/** A copy of the roster with this week's focus applied, for use in the next match. */
export function rosterForMatch(career: Career): PlayerData[] {
  if (!career.focus) return career.roster;
  const keys = FOCUS_ATTRS[career.focus];
  return career.roster.map((p) => {
    const attrs = { ...p.attrs };
    for (const k of keys) attrs[k] = clamp(attrs[k] + 3, 1, 99);
    const copy: PlayerData = { ...p, attrs };
    refreshOverall(copy);
    return copy;
  });
}

/* ---------------------------------------------------------------- offseason */

export interface OffseasonReport {
  graduated: { name: string; pos: string; overall: number }[];
  improved: { name: string; pos: string; from: number; to: number }[];
  arrived: { name: string; pos: string; overall: number; grade: Grade }[];
  development: DevelopmentEntry[];
  movement: MovementReport | null;
  /** Squad players who did not return, when a roster ran over its limit. */
  departed: { name: string; pos: string; overall: number }[];
}

/** A squad this size covers every position twice over; beyond it, players who
 *  would never see the field move on. */
export const MAX_ROSTER = 24;

/** Class as it stands in THIS career, after any promotion or relegation. */
export function effectiveClass(career: Career, teamId: string): ClassKey {
  return career.classOverrides[teamId] ?? getTeam(teamId).classKey;
}

/** Every team in a class, as this career has it. */
export function classMembers(career: Career, key: ClassKey): TeamData[] {
  return TEAMS.filter((t) => effectiveClass(career, t.id) === key)
    .map((t) => effectiveTeam(career, t.id));
}

/** Final table for one division, used by the promotion rules. */
function divisionResult(career: Career, key: ClassKey): DivisionResult {
  const members = classMembers(career, key).map((t) => t.id);
  if (key === career.classKey) {
    const order = standingsSorted(career).map((r) => r.teamId).filter((id) => members.includes(id));
    for (const id of members) if (!order.includes(id)) order.push(id);
    return { key, order, champion: champion(career) };
  }
  // Divisions the player is not in are settled by a season simulation, so the
  // whole district moves on the same rules rather than only the player's class.
  const rng = new Rng(`${career.seed}:div:${key}:${career.year}`);
  const table = members.map((id) => {
    const t = effectiveTeam(career, id);
    return { id, score: t.overall + rng.gauss(0, 5.5) };
  });
  table.sort((a, b) => b.score - a.score);
  return { key, order: table.map((r) => r.id), champion: table[0]?.id ?? null };
}

/** Runs the district's promotion and relegation for the season just finished. */
export function runMovement(career: Career): MovementReport {
  const keys: ClassKey[] = ['a', 'b', 'c-east', 'c-west', 'd'];
  const report = planMovement(keys.map((k) => divisionResult(career, k)), career.year);
  for (const m of report.moves) career.classOverrides[m.teamId] = m.to;
  const mine = report.moves.find((m) => m.teamId === career.teamId);
  if (mine) career.classKey = mine.to;
  career.lastMovement = report;
  return report;
}

export function runOffseason(career: Career): OffseasonReport {
  const rng = new Rng(`${career.seed}:off:${career.year}`);
  const team = getTeam(career.teamId);
  const fx = coachEffects(career.staff);
  const report: OffseasonReport = {
    graduated: [], improved: [], arrived: [], development: [], movement: null, departed: [],
  };

  // 1. Seniors leave.
  const staying: PlayerData[] = [];
  for (const p of career.roster) {
    if (p.grade >= 12) {
      report.graduated.push({ name: `${p.first} ${p.last}`, pos: p.pos, overall: p.overall });
      career.alumni.push({
        name: `${p.first} ${p.last}`,
        pos: p.pos,
        overall: p.overall,
        gradYear: career.year,
        goals: p.career.goals,
        assists: p.career.assists,
        saves: p.career.saves,
      });
    } else {
      staying.push(p);
    }
  }

  // 2. Development. Every returning player gets a real, explicable season of
  //    growth — or, occasionally, a step back.
  const focusKeys = career.focus ? FOCUS_ATTRS[career.focus] : [];
  for (const p of staying) {
    p.grade = (p.grade + 1) as Grade;
    const res = developPlayer(p, rng, fx, focusKeys);
    p.xp = 0;
    p.season = emptyStats();
    const entry: DevelopmentEntry = {
      name: `${p.first} ${p.last}`,
      pos: p.pos,
      grade: p.grade,
      from: res.from,
      to: res.to,
      outcome: res.outcome,
      label: DEV_LABEL[res.outcome],
    };
    report.development.push(entry);
    if (res.to > res.from) {
      report.improved.push({ name: entry.name, pos: p.pos, from: res.from, to: res.to });
    }
  }
  report.development.sort((a, b) => (b.to - b.from) - (a.to - a.from));
  career.lastDevelopment = report.development;

  // 3. Recruit to refill the roster. Prestige raises the ceiling of who shows
  //    up, but a badly-run programme must not spiral: the penalty for losing is
  //    floored, and coaching pulls in the other direction, so a coach who
  //    invests in development and culture recruits above the team's record.
  const used = new Set(staying.map((p) => p.number));
  const prestigeBoost = clamp((career.prestige - 60) * 0.2 + fx.appeal * 9, -4, 12);
  const potentialBonus = career.staff.development * 1.6 + fx.appeal * 3;
  for (const { pos, count } of ROSTER_SHAPE) {
    const have = staying.filter((p) => p.pos === pos).length;
    for (let i = have; i < count; i++) {
      const shell: TeamData = {
        ...team,
        attack: clamp(team.attack + prestigeBoost, 35, 99),
        midfield: clamp(team.midfield + prestigeBoost, 35, 99),
        defense: clamp(team.defense + prestigeBoost, 35, 99),
        goalie: clamp(team.goalie + prestigeBoost, 35, 99),
        faceoff: clamp(team.faceoff + prestigeBoost, 35, 99),
      };
      const grade: Grade = rng.bool(0.7) ? 9 : 10;
      const p = generatePlayer(rng, shell, pos, { depth: i, grade, potentialBonus }, used);
      staying.push(p);
      report.arrived.push({ name: `${p.first} ${p.last}`, pos: p.pos, overall: p.overall, grade });
    }
  }

  // Transfers arrive on top of the squad, so without a cap a programme that
  // recruits well every year ends up carrying thirty players. The ones who
  // leave are the deepest reserves, and they are named in the report.
  let squad = sortDepthChart(staying);
  if (squad.length > MAX_ROSTER) {
    const keep: PlayerData[] = [];
    const perPos = new Map<string, number>();
    for (const p of squad) {
      const n = perPos.get(p.pos) ?? 0;
      const shape = ROSTER_SHAPE.find((r) => r.pos === p.pos)?.count ?? 3;
      // Everyone inside the shape stays; beyond it, best first until full.
      if (n < shape || keep.length < MAX_ROSTER) {
        keep.push(p);
        perPos.set(p.pos, n + 1);
      } else {
        report.departed.push({ name: `${p.first} ${p.last}`, pos: p.pos, overall: p.overall });
      }
    }
    squad = sortDepthChart(keep.slice(0, MAX_ROSTER));
    for (const p of keep.slice(MAX_ROSTER)) {
      report.departed.push({ name: `${p.first} ${p.last}`, pos: p.pos, overall: p.overall });
    }
  }
  career.roster = squad;

  // 4. The rest of the league drifts, regressing gently toward its baseline.
  for (const t of TEAMS) {
    if (t.id === career.teamId) continue;
    const cur = career.ratingOverrides[t.id] ?? {};
    const next: Partial<TeamRatings> = {};
    for (const k of RATING_KEYS) {
      const base = t[k];
      const now = cur[k] ?? base;
      const drift = rng.gauss(0, 2.4) + (base - now) * 0.35;
      next[k] = Math.round(clamp(now + drift, base - 9, base + 9));
    }
    career.ratingOverrides[t.id] = next;
  }

  // 5. Promotion and relegation, then the new season around the new table.
  report.movement = runMovement(career);

  // 6. Culture compounds: a settled programme passes chemistry down a year.
  const chem = career.ratingOverrides[career.teamId]?.chemistry ?? team.chemistry;
  career.ratingOverrides[career.teamId] = {
    ...career.ratingOverrides[career.teamId],
    chemistry: Math.round(clamp(chem + fx.chemistryGain, 30, 99)),
  };

  career.year++;
  career.schedule = buildSchedule(
    career.classKey, career.teamId, career.seed + career.year * 7919,
    classMembers(career, career.classKey).map((t) => t.id),
  );
  career.standings = emptyStandings(career, career.classKey);
  career.playoffSeeds = null;
  career.eliminated = false;
  career.seasonComplete = false;
  career.finish = null;
  career.coachingPoints += 4;
  career.focus = null;
  career.market = buildMarket(
    career.seed, career.year, career.teamId, career.classKey,
    Object.fromEntries(Object.entries(career.standings).map(([id, r]) => [id, { wins: r.wins, losses: r.losses }])),
  );
  career.pitchesLeft = MAX_PITCHES;
  syncUserTeamRatings(career);
  return report;
}

/* ---------------------------------------------------------------- transfers */

export interface PitchOutput {
  result: PitchResult;
  /** True when the player joined your roster. */
  joined: boolean;
}

/** A snapshot of the programme, as a transfer target sees it. */
export function programSnapshot(career: Career): ProgramSnapshot {
  const row = career.standings[career.teamId];
  const last = career.history[career.history.length - 1];
  return {
    team: userTeam(career),
    roster: career.roster,
    prestige: career.prestige,
    staff: career.staff,
    wins: last?.wins ?? row?.wins ?? 0,
    losses: last?.losses ?? row?.losses ?? 0,
    championships: career.championships,
  };
}

/** Spends one pitch on a transfer candidate and applies whatever happens. */
export function pitchTo(career: Career, candidateId: string): PitchOutput | null {
  const c = career.market.find((x) => x.id === candidateId);
  if (!c || career.pitchesLeft <= 0) return null;
  if (c.status === 'committed' || c.status === 'declined' || c.status === 'lost') return null;

  const rng = new Rng(`${career.seed}:pitch:${career.year}:${c.id}:${c.attempts}`);
  const result = pitch(c, programSnapshot(career), rng);
  c.attempts++;
  career.pitchesLeft--;
  c.status = result.outcome === 'committed' ? 'committed'
    : result.outcome === 'considering' ? 'considering'
      : result.outcome === 'lost' ? 'lost' : 'declined';
  if (result.lostToTeamId) c.lostToTeamId = result.lostToTeamId;

  if (result.outcome !== 'committed') return { result, joined: false };

  // He joins on a number nobody else is wearing, and the depth chart re-sorts.
  const used = new Set(career.roster.map((p) => p.number));
  const joining: PlayerData = { ...c.player, season: emptyStats(), career: emptyStats(), xp: 0 };
  if (used.has(joining.number)) {
    for (let n = 1; n < 99; n++) if (!used.has(n)) { joining.number = n; break; }
  }
  let roster = sortDepthChart([...career.roster, joining]);
  // A squad has a size. Bringing somebody in when you are full means somebody
  // who was never going to play moves on, and you are told who.
  let displaced: PlayerData | null = null;
  if (roster.length > MAX_ROSTER) {
    const cuttable = roster.filter((p) => p !== joining).sort((a, b) => a.overall - b.overall);
    displaced = cuttable[0] ?? null;
    if (displaced) roster = roster.filter((p) => p !== displaced);
  }
  career.roster = roster;
  syncUserTeamRatings(career);
  return {
    result: displaced
      ? { ...result, message: `${result.message} ${displaced.first} ${displaced.last} moves on.` }
      : result,
    joined: true,
  };
}

/* ------------------------------------------------------------------ misc */

export function seasonRecordText(career: Career): string {
  const r = career.standings[career.teamId];
  if (!r) return '0-0';
  return `${r.wins}-${r.losses}`;
}

export function teamRecordText(career: Career, teamId: string): string {
  const r = career.standings[teamId];
  if (!r) return '0-0';
  return `${r.wins}-${r.losses}`;
}
