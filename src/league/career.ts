import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import {
  generateRoster, generatePlayer, sortDepthChart, refreshOverall, emptyStats,
  type Grade, type PlayerData, type PlayerAttrs, type PlayerStats,
} from '../data/players';
import {
  TEAMS, getTeam, areRivals, type ClassKey, type TeamData, type TeamRatings,
} from '../data/teams';
import { DEFAULT_TACTICS } from '../data/tactics';
import { EMPTY_STAFF, coachEffects } from './coaching';
import { isCareerMode } from './modes';
import { DEV_LABEL, developPlayer } from './development';
import { planMovement, type DivisionResult, type MovementReport } from './promotion';
import {
  buildMarket, marketFor, pitch, runOutgoing,
  type PitchResult, type PortalDeparture, type ProgramSnapshot,
} from './transfers';
import { ensureDevProfile, rosterShape } from '../data/players';
import { LEVELS } from '../data/levels';
import {
  advanceRecruitingWeek, classSummary, newRecruitingClass, signingDay,
  type RecruitContext, type RecruitingState,
} from '../scouting/recruiting';
import {
  FINAL_STAGE, programmesAt, stageAt,
} from '../challenge/ladder';
import {
  acceptOffer, declineAll, evaluateSeason, expectationFor, generateOffers, legacyScore,
  newChallengeState, promotionFloor, promotionReach,
  type JobOffer, type Legacy, type Programme, type SeasonVerdict,
} from '../challenge/state';
import {
  applySituation, situationFor, situationRatingShift, type SituationKey,
} from '../challenge/situations';
import { difficultyFor } from '../data/levels';
import { STAR_OVERALL } from '../data/players';
import { TRACK_ORDER } from './coaching';
import { DIFFICULTIES, type DifficultyKey } from '../data/difficulty';
import type { GameLengthKey, Position } from '../data/constants';
import { buildSchedule, regularSeasonWeeks } from './schedule';
import { simulateFixture } from './fixture';
import { recordSimulatedUserGame } from './leagueStats';
import {
  CAREER_VERSION, type Career, type CareerMode, type DevelopmentEntry,
  type PlayoffRound, type ScheduledGame, type StandingRow, type WeeklyFocus,
} from './types';
import type { Level } from '../data/levels';
import {
  conferencesAtLevel, teamsAtLevel, teamsInConference, tryWorldTeam, worldTeam,
} from '../data/world';
import {
  buildRegularSeason, formatFor, pairSeeds, roundLabel as worldRoundLabel, selectNationalField,
  titleBracket, type Bracket, type SeasonFormat,
} from '../world/season';

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
  mode: CareerMode;
  teamId: string;
  difficulty: DifficultyKey;
  gameLength: GameLengthKey;
  seed?: number;
  /** Anything above high school; defaults to the district. */
  level?: Level;
}

export function createCareer(opts: NewCareerOptions): Career {
  const level = opts.level ?? 'hs';
  const wt = worldTeam(opts.teamId);
  const team = level === 'hs' ? getTeam(opts.teamId) : (wt as unknown as TeamData);
  const seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffff));
  const career: Career = {
    version: CAREER_VERSION,
    mode: opts.mode,
    seed,
    year: 1,
    teamId: team.id,
    classKey: level === 'hs' ? getTeam(opts.teamId).classKey : 'a',
    level,
    conferenceId: wt.conference,
    difficulty: opts.difficulty,
    gameLength: opts.gameLength,
    tactics: { ...DEFAULT_TACTICS },
    schedule: [],
    standings: {},
    ratingOverrides: {},
    roster: generateRoster(team, `${seed}:1`, level),
    coachingPoints: 12,
    focus: null,
    prestige: clamp(Math.round(team.overall * 0.6 + 20), 20, 92),
    staff: { ...EMPTY_STAFF },
    classOverrides: {},
    lastMovement: null,
    market: [],
    pitchesLeft: 0,
    portalOut: [],
    lastDevelopment: [],
    recruiting: null,
    challenge: null,
    history: [],
    alumni: [],
    championships: 0,
    careerWins: 0,
    careerLosses: 0,
    playoffSeeds: null,
    nationalSeeds: null,
    autoBids: [],
    eliminated: false,
    seasonComplete: false,
    finish: null,
  };
  startSeasonSchedule(career, seed);
  syncUserTeamRatings(career);
  // A recruiting class only means something in a save that has a next year.
  if (isCareerMode(career.mode)) openRecruitingClass(career);
  return career;
}

/* --------------------------------------------------------------- recruiting */

/** Opens the class for this season, carrying over the scouting staff. */
export function openRecruitingClass(career: Career): RecruitingState {
  const shell = effectiveTeam(career, career.teamId);
  const state = newRecruitingClass({
    seed: career.seed,
    cycle: career.year,
    level: career.level,
    prestige: career.prestige,
    shell,
    keepScouts: career.recruiting?.scouts,
  });
  career.recruiting = state;
  return state;
}

/** Everything the class needs to know about the programme it is judging. */
export function recruitContext(career: Career): RecruitContext {
  const team = userTeam(career);
  const row = career.standings[career.teamId];
  const fx = coachEffects(career.staff);
  const depth = { A: 0, M: 0, D: 0, G: 0, FO: 0 } as Record<Position, number>;
  for (const p of career.roster) depth[p.pos] = (depth[p.pos] ?? 0) + 1;
  const pool = career.level === 'hs'
    ? classMembers(career, career.classKey).map((t) => ({ id: t.id, name: t.short, recruiting: t.overall }))
    : teamsAtLevel(career.level)
      .filter((t) => t.conference === career.conferenceId || t.prestige > 70)
      .map((t) => ({ id: t.id, name: t.short, recruiting: t.recruiting }));
  return {
    teamId: career.teamId,
    teamName: team.short,
    prestige: career.prestige,
    appeal: fx.appeal,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    championships: career.championships,
    depth,
    rivals: pool.filter((t) => t.id !== career.teamId).slice(0, 14),
  };
}

/** One week of recruiting, run alongside the season. */
export function tickRecruiting(career: Career): void {
  if (!isCareerMode(career.mode)) return;
  if (!career.recruiting) openRecruitingClass(career);
  const state = career.recruiting!;
  if (state.closed) return;
  advanceRecruitingWeek(state, recruitContext(career), `${career.seed}:rec:${career.year}`);
}

/** Closes the class and returns the signings, ready to join the roster. */
function takeSignedRecruits(career: Career, used: Set<number>): PlayerData[] {
  const state = career.recruiting;
  if (!state) return [];
  const rng = new Rng(`${career.seed}:sign:${career.year}`);
  const signed = signingDay(state, career.teamId);
  const out: PlayerData[] = [];
  for (const p of signed) {
    attachDevProfile(p, rng);
    if (used.has(p.number)) {
      let n = 1;
      while (used.has(n) && n < 99) n++;
      p.number = n;
    }
    used.add(p.number);
    out.push(p);
  }
  return out;
}

/** Backfills a development profile, for players from a save that predates it. */
function attachDevProfile(p: PlayerData, rng: Rng): void {
  ensureDevProfile(p, rng);
}

/** One line on how the class went, for the offseason screen. */
export function recruitingSummary(career: Career): string | null {
  if (!career.recruiting) return null;
  return classSummary(career.recruiting, career.teamId);
}

/** Lays out a season for whatever level and conference the career is at. */
export function startSeasonSchedule(career: Career, seed: number): void {
  const format = seasonFormat(career);
  const members = leagueMembers(career).map((t) => t.id);
  if (career.level === 'hs') {
    career.schedule = buildSchedule(career.classKey, career.teamId, seed, members);
  } else {
    const levelIds = teamsAtLevel(career.level).map((t) => t.id);
    career.schedule = buildRegularSeason(format, members, levelIds, seed).map((g) => ({
      id: g.id,
      week: g.week,
      homeId: g.homeId,
      awayId: g.awayId,
      played: false,
      homeScore: 0,
      awayScore: 0,
      rivalry: areRivalsWorld(g.homeId, g.awayId),
      playoff: null,
      inConference: g.inConference,
      featured: g.homeId === career.teamId || g.awayId === career.teamId,
    }));
  }
  career.standings = emptyStandings(career, career.level === 'hs' ? career.classKey : career.conferenceId);
}

/** The format this career's level plays to. */
export function seasonFormat(career: Career): SeasonFormat {
  return formatFor(career.level, leagueMembers(career).length, teamsAtLevel(career.level).length);
}

/** Everyone in the coach's own conference or class, as this career has them. */
export function leagueMembers(career: Career): { id: string; overall: number }[] {
  if (career.level === 'hs') {
    return classMembers(career, career.classKey).map((t) => ({ id: t.id, overall: t.overall }));
  }
  return teamsInConference(career.conferenceId)
    .map((t) => ({ id: t.id, overall: effectiveWorldRating(career, t.id) }));
}

/** A world team's rating in this career, including any drift it has picked up. */
export function effectiveWorldRating(career: Career, teamId: string): number {
  const over = career.ratingOverrides[teamId];
  return over?.overall ?? worldTeam(teamId).overall;
}

function areRivalsWorld(a: string, b: string): boolean {
  const ta = tryWorldTeam(a);
  const tb = tryWorldTeam(b);
  return !!(ta?.rivals.includes(b) || tb?.rivals.includes(a));
}

function emptyStandings(career: Career, leagueId: string): Record<string, StandingRow> {
  const rows: Record<string, StandingRow> = {};
  const members = career.level === 'hs'
    ? classMembers(career, leagueId as ClassKey).map((t) => t.id)
    : teamsInConference(leagueId).map((t) => t.id);
  for (const id of members) {
    rows[id] = { teamId: id, wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
  }
  return rows;
}

/* ------------------------------------------------------------- team views */

/**
 * The team as it exists in this career: its world data plus any drift it has
 * picked up. Works at every level, so one call site serves a high school
 * district and a professional league alike.
 */
export function effectiveTeam(career: Career, teamId: string): TeamData {
  const base = (tryWorldTeam(teamId) ?? getTeam(teamId)) as unknown as TeamData;
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
  const base = (tryWorldTeam(career.teamId) ?? getTeam(career.teamId));
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

/** Play out every non-featured game up to and including `week`. */
export function simulateThroughWeek(career: Career, week: number): void {
  for (const g of career.schedule) {
    if (g.played || g.week > week || g.featured) continue;
    const r = simulateFixture(career, g);
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
  // The recruiting class runs alongside the season: every week you play is a
  // week your scouts worked and a week somebody else made an offer.
  tickRecruiting(career);
  career.focus = null;
  advancePhase(career);
}

/** Simulate the player's own game instead of playing it. */
export function simulateUserGame(career: Career, g: ScheduledGame): void {
  const r = simulateFixture(career, g);
  // The box score is produced BEFORE the result is recorded, because recording
  // the result rolls the league forward and can start the next round.
  const mine = g.homeId === career.teamId ? r.home : r.away;
  const theirs = g.homeId === career.teamId ? r.away : r.home;
  recordUserResult(career, g, r.homeScore, r.awayScore);
  // A simulated game still produced a real box score: without this, a season
  // the player partly simulated would show holes in its own statistics.
  recordSimulatedUserGame(career, g, mine, theirs);
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
  R16: 'First Round',
  QF: 'Quarterfinal',
  SF: 'Semifinal',
  F: 'District Championship',
};
export const roundName = (r: PlayoffRound): string => ROUND_NAME[r];

/** The name of a round in the competition it belongs to. */
export function roundNameIn(career: Career, g: ScheduledGame): string {
  if (!g.playoff) return `Week ${g.week}`;
  return worldRoundLabel(g.playoff, g.bracket ?? 'league', seasonFormat(career));
}

/** How many teams make the playoffs, scaled so qualifying actually means
 *  something: roughly the top half, rounded to a bracket size. */
export function playoffFieldSize(teamCount: number): number {
  if (teamCount >= 12) return 8;
  if (teamCount >= 6) return 4;
  return 2;
}


/**
 * Moves the season on when it is ready: regular season into a conference
 * tournament, a conference tournament into the national bracket, the national
 * bracket into the offseason. Levels without those stages skip straight past
 * them, which is how a high school district still behaves exactly as it did.
 */
export function advancePhase(career: Career): void {
  if (career.seasonComplete) return;
  const regWeeks = regularSeasonWeeks(career.schedule);
  const anyRegularLeft = career.schedule.some((g) => !g.played && !g.playoff);
  if (anyRegularLeft) return;

  const format = seasonFormat(career);
  const pending = career.schedule.filter((g) => g.playoff && !g.played);
  if (pending.length > 0) return;

  const last = lastPlayoffGame(career);
  const stage: Bracket | null = last?.bracket ?? (last ? 'league' : null);

  // --- nothing has been drawn yet
  if (!stage) {
    if (format.conferenceField > 0) {
      startBracket(career, 'conference', conferenceField(career, format), regWeeks + 1);
      return;
    }
    if (format.nationalField > 0) {
      startBracket(career, 'national', nationalField(career, format), regWeeks + 1);
      return;
    }
    const field = playoffFieldSize(leagueMembers(career).length);
    career.playoffSeeds = standingsSorted(career).slice(0, field).map((r) => r.teamId);
    createRound(career, 'league', roundLabelFor(field), career.playoffSeeds, regWeeks + 1);
    resolveNonFeatured(career);
    return;
  }

  // --- a bracket is running: play it out, then move to whatever is next
  const round = last!.playoff!;
  const winners = roundWinners(career, round, stage);
  if (round !== 'F' && winners.length >= 2) {
    createRound(career, stage, roundLabelFor(winners.length), winners, last!.week + 1);
    resolveNonFeatured(career);
    return;
  }

  if (stage === 'conference' && format.nationalField > 0) {
    const champion = winners[0] ?? null;
    if (champion) career.autoBids = [...new Set([...career.autoBids, champion])];
    startBracket(career, 'national', nationalField(career, format), last!.week + 2);
    return;
  }

  finishSeason(career);
}

const roundLabelFor = (teams: number): PlayoffRound =>
  (teams >= 16 ? 'R16' : teams >= 8 ? 'QF' : teams >= 4 ? 'SF' : 'F');

/** Seeds for the conference tournament: the top of the table. */
function conferenceField(career: Career, format: SeasonFormat): string[] {
  const size = Math.min(format.conferenceField, Object.keys(career.standings).length);
  return standingsSorted(career).slice(0, size).map((r) => r.teamId);
}

/**
 * Seeds for the national bracket. Every conference champion at this level takes
 * an automatic place — the other conferences' seasons are settled by a seeded
 * draw on their strength — and the rest of the field is filled on merit, so
 * winning your conference means something even in a poor year.
 */
function nationalField(career: Career, format: SeasonFormat): string[] {
  const rng = new Rng(`${career.seed}:national:${career.year}`);
  const autos = [...career.autoBids];

  for (const conf of conferencesAtLevel(career.level)) {
    if (conf.id === career.conferenceId) continue;
    if (!conf.autoBid) continue;
    const members = teamsInConference(conf.id);
    if (!members.length) continue;
    const ranked = members
      .map((t) => ({ id: t.id, score: effectiveWorldRating(career, t.id) + rng.gauss(0, 6) }))
      .sort((a, b) => b.score - a.score);
    autos.push(ranked[0].id);
  }

  const atLarge = teamsAtLevel(career.level).map((t) => ({
    teamId: t.id,
    rating: t.id === career.teamId
      ? userAtLargeRating(career)
      : effectiveWorldRating(career, t.id) + rng.gauss(0, 4),
  }));
  const field = selectNationalField(format.nationalField, autos, atLarge);
  career.autoBids = autos;
  return field;
}

/** The coach's own team is judged on its season, not its reputation. */
function userAtLargeRating(career: Career): number {
  const row = career.standings[career.teamId];
  const games = row ? row.wins + row.losses + row.ties : 0;
  const pct = games ? winPct(row) : 0.5;
  return effectiveWorldRating(career, career.teamId) + (pct - 0.5) * 40;
}

function startBracket(career: Career, bracket: Bracket, seeds: string[], week: number): void {
  if (seeds.length < 2) { finishSeason(career); return; }
  if (bracket === 'national') career.nationalSeeds = seeds;
  else career.playoffSeeds = seeds;
  createRound(career, bracket, roundLabelFor(seeds.length), seeds, week);
  resolveNonFeatured(career);
}

function lastPlayoffGame(career: Career): ScheduledGame | null {
  let last: ScheduledGame | null = null;
  for (const g of career.schedule) if (g.playoff) last = g;
  return last;
}

function roundWinners(career: Career, round: PlayoffRound, bracket: Bracket): string[] {
  const seeds = (bracket === 'national' ? career.nationalSeeds : career.playoffSeeds) ?? [];
  const games = career.schedule.filter((g) => g.playoff === round && (g.bracket ?? 'league') === bracket);
  const winners = games.map((g) => (g.homeScore > g.awayScore ? g.homeId : g.awayId));
  // Keep bracket order by original seed.
  return winners.sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
}

function createRound(
  career: Career, bracket: Bracket, round: PlayoffRound, teams: string[], week: number,
): void {
  const pairs = pairSeeds(teams);
  for (const [homeId, awayId] of pairs) {
    career.schedule.push({
      id: `${bracket}-${round}-${homeId}-${awayId}`,
      bracket,
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
      const r = simulateFixture(career, g);
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
  const format = seasonFormat(career);
  const title = titleBracket(format);
  const champ = champion(career);
  const won = champ === career.teamId;
  const row = career.standings[career.teamId];

  const inBracket = (bracket: Bracket, round: PlayoffRound) =>
    career.schedule.some((g) => g.featured && g.playoff === round && (g.bracket ?? 'league') === bracket);

  let finish: string;
  if (won) {
    finish = format.titleName.toUpperCase();
  } else if (inBracket(title, 'F')) {
    finish = `Lost the ${format.titleName}`;
  } else if (inBracket(title, 'SF')) {
    finish = 'Lost in the semifinals';
  } else if (inBracket(title, 'QF')) {
    finish = 'Lost in the quarterfinals';
  } else if (inBracket(title, 'R16')) {
    finish = 'Lost in the first round';
  } else if (title === 'national' && career.schedule.some((g) => g.featured && g.bracket === 'conference')) {
    // Reaching a conference tournament and missing the national field is its
    // own outcome, and at some programmes it is a bad one.
    const wonConf = conferenceChampion(career) === career.teamId;
    finish = wonConf ? 'Conference champions, missed the national bracket' : 'Missed the national bracket';
  } else {
    finish = format.nationalField > 0 ? 'Missed the postseason' : 'Missed the playoffs';
  }

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

/** Winner of the competition that decides this level's champion. */
export function champion(career: Career): string | null {
  const title = titleBracket(seasonFormat(career));
  return finalWinner(career, title);
}

/** Winner of the conference tournament, at levels that hold one. */
export function conferenceChampion(career: Career): string | null {
  return finalWinner(career, 'conference');
}

function finalWinner(career: Career, bracket: Bracket): string | null {
  const final = career.schedule
    .filter((g) => g.playoff === 'F' && (g.bracket ?? 'league') === bracket)
    .pop();
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
  /** Players who left through the portal, at levels that have one. */
  portalOut: PortalDeparture[];
}

/** A squad this size covers every position twice over; beyond it, players who
 *  would never see the field move on. High school stays at 24 so Dynasty is
 *  unchanged; every level above carries the squad its tier actually carries. */
export const MAX_ROSTER = 24;

export function maxRoster(level: Level): number {
  return level === 'hs' ? MAX_ROSTER : rosterShape(level).reduce((n, s) => n + s.count, 0) + 2;
}

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
  // A high school class IS its conference, so the two must move together or the
  // new season is drawn up for a division the coach no longer plays in.
  if (mine) { career.classKey = mine.to; career.conferenceId = mine.to; }
  career.lastMovement = report;
  return report;
}

/**
 * Whether a player's time at this programme is up. High school and college run
 * on eligibility — a senior leaves. Professional squads run on contracts: a
 * veteran either re-signs or retires, and how good he still is decides which.
 */
function departs(p: PlayerData, level: Level, rng: Rng): boolean {
  if (LEVELS[level].ageSystem !== 'pro') return p.grade >= 12;
  if (p.grade < 12) return false;
  // A veteran holds his place while he is still one of the better players at
  // the level; past that the club moves on. Nobody plays forever.
  const band = LEVELS[level].band;
  const keepLine = band ? band.lo + (band.hi - band.lo) * 0.45 : 80;
  const edge = (p.overall - keepLine) / 12;
  return rng.next() > clamp(0.35 + edge * 0.3, 0.12, 0.85);
}

export function runOffseason(career: Career): OffseasonReport {
  const rng = new Rng(`${career.seed}:off:${career.year}`);
  const level = career.level;
  const pro = LEVELS[level].ageSystem === 'pro';
  const team = effectiveTeam(career, career.teamId);
  const fx = coachEffects(career.staff);
  const shape = rosterShape(level);
  const cap = maxRoster(level);
  const report: OffseasonReport = {
    graduated: [], improved: [], arrived: [], development: [], movement: null,
    departed: [], portalOut: [],
  };

  // 1. Players whose time is up leave.
  const staying: PlayerData[] = [];
  for (const p of career.roster) {
    if (departs(p, level, rng)) {
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

  // 1b. The portal takes its cut. At levels that have one, players with years
  //     left and no path to the field leave — and a programme with a strong
  //     culture keeps them. This runs before development, because a player who
  //     has gone does not develop here.
  {
    const row = career.standings[career.teamId];
    const rivals = (career.level === 'hs'
      ? classMembers(career, career.classKey)
      : teamsInConference(career.conferenceId)
    ).filter((t) => t.id !== career.teamId);
    const out = runOutgoing(staying, career.level, rng, {
      wins: row?.wins ?? 0,
      losses: row?.losses ?? 0,
      retention: fx.retention,
      rivals,
    });
    report.portalOut = out.left;
    staying.length = 0;
    staying.push(...out.stayed);
  }

  // 2. Development. Every returning player gets a real, explicable season of
  //    growth — or, occasionally, a step back.
  const focusKeys = career.focus ? FOCUS_ATTRS[career.focus] : [];
  for (const p of staying) {
    // A professional veteran stays a veteran; everyone else moves up a year.
    if (!(pro && p.grade >= 12)) p.grade = (p.grade + 1) as Grade;
    const res = developPlayer(p, rng, fx, focusKeys, level);
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

  // 3. Bring in the new intake. Prestige raises the ceiling of who shows up,
  //    but a badly-run programme must not spiral: the penalty for losing is
  //    floored, and coaching pulls in the other direction, so a coach who
  //    invests in development and culture recruits above the team's record.
  //    Anyone already signed through the recruiting board arrives first.
  const used = new Set(staying.map((p) => p.number));
  const signed = takeSignedRecruits(career, used);
  for (const p of signed) {
    staying.push(p);
    report.arrived.push({ name: `${p.first} ${p.last}`, pos: p.pos, overall: p.overall, grade: p.grade });
  }

  const prestigeBoost = clamp((career.prestige - 60) * 0.2 + fx.appeal * 9, -4, 12);
  const potentialBonus = career.staff.development * 1.6 + fx.appeal * 3;
  // Recruits are drawn from what the PROGRAMME is, not from what this year's
  // squad happens to be. Without that, one bad roster recruits a worse one and
  // a programme in trouble can never climb out of it.
  const baseline = (tryWorldTeam(career.teamId) ?? getTeam(career.teamId)) as unknown as TeamData;
  for (const { pos, count } of shape) {
    const have = staying.filter((p) => p.pos === pos).length;
    for (let i = have; i < count; i++) {
      const shell: TeamData = {
        ...baseline,
        attack: clamp(baseline.attack + prestigeBoost, 35, 99),
        midfield: clamp(baseline.midfield + prestigeBoost, 35, 99),
        defense: clamp(baseline.defense + prestigeBoost, 35, 99),
        goalie: clamp(baseline.goalie + prestigeBoost, 35, 99),
        faceoff: clamp(baseline.faceoff + prestigeBoost, 35, 99),
      };
      // A professional signing is a finished player, not a freshman.
      const grade: Grade = pro ? (rng.bool(0.55) ? 9 : 10) : (rng.bool(0.7) ? 9 : 10);
      const p = generatePlayer(rng, shell, pos, { depth: i, grade, potentialBonus, level }, used);
      attachDevProfile(p, rng);
      staying.push(p);
      report.arrived.push({ name: `${p.first} ${p.last}`, pos: p.pos, overall: p.overall, grade });
    }
  }

  // Transfers and recruits arrive on top of the squad, so without a cap a
  // programme that recruits well every year ends up carrying thirty players.
  // The ones who leave are the deepest reserves, and they are named.
  let squad = sortDepthChart(staying);
  if (squad.length > cap) {
    const keep: PlayerData[] = [];
    const perPos = new Map<string, number>();
    for (const p of squad) {
      const n = perPos.get(p.pos) ?? 0;
      const want = shape.find((r) => r.pos === p.pos)?.count ?? 3;
      // Everyone inside the shape stays; beyond it, best first until full.
      if (n < want || keep.length < cap) {
        keep.push(p);
        perPos.set(p.pos, n + 1);
      } else {
        report.departed.push({ name: `${p.first} ${p.last}`, pos: p.pos, overall: p.overall });
      }
    }
    squad = sortDepthChart(keep.slice(0, cap));
    for (const p of keep.slice(cap)) {
      report.departed.push({ name: `${p.first} ${p.last}`, pos: p.pos, overall: p.overall });
    }
  }
  career.roster = squad;

  // 4. The rest of the level drifts, regressing gently toward its baseline.
  const rivals = level === 'hs' ? TEAMS : teamsAtLevel(level);
  for (const t of rivals) {
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

  // 5. Promotion and relegation, which is a high school district's own system.
  if (level === 'hs') report.movement = runMovement(career);

  // 6. Culture compounds: a settled programme passes chemistry down a year.
  const chem = career.ratingOverrides[career.teamId]?.chemistry ?? team.chemistry;
  career.ratingOverrides[career.teamId] = {
    ...career.ratingOverrides[career.teamId],
    chemistry: Math.round(clamp(chem + fx.chemistryGain, 30, 99)),
  };

  career.year++;
  startSeasonSchedule(career, career.seed + career.year * 7919);
  career.playoffSeeds = null;
  career.nationalSeeds = null;
  career.autoBids = [];
  career.eliminated = false;
  career.seasonComplete = false;
  career.finish = null;
  career.coachingPoints += 4;
  career.focus = null;
  // Who you have actually seen play decides how well you know the market.
  const playedIds = career.schedule
    .filter((g) => g.featured && g.played)
    .map((g) => (g.homeId === career.teamId ? g.awayId : g.homeId));
  career.market = buildMarket(
    career.seed, career.year, career.teamId,
    level === 'hs' ? classMembers(career, career.classKey) : teamsInConference(career.conferenceId),
    Object.fromEntries(Object.entries(career.standings).map(([id, r]) => [id, { wins: r.wins, losses: r.losses }])),
    level,
    { playedIds: [...new Set(playedIds)], scouts: career.recruiting?.scouts.length ?? 0 },
  );
  career.portalOut = report.portalOut;
  career.pitchesLeft = marketFor(level).pitches;
  openRecruitingClass(career);
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

/* ---------------------------------------------------------------- challenge */

/**
 * Starts a Challenge career at the bottom of the ladder. The programme is one
 * of the weakest in Class D, and the roster you are handed has whatever is
 * actually wrong with it applied — see challenge/situations.ts.
 */
export function startChallenge(opts: {
  difficulty: DifficultyKey; gameLength: GameLengthKey; teamId?: string; seed?: number;
}): Career {
  const seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffff));
  const rng = new Rng(`${seed}:challenge`);
  const stage = stageAt(0);
  const pool = programmesAt(0);
  const teamId = opts.teamId
    ?? [...pool].sort((a, b) => a.prestige - b.prestige)[0]?.id
    ?? 'lake-highlands';
  const prestige = pool.find((p) => p.id === teamId)?.prestige ?? 50;
  const situation = situationFor(prestige, rng);

  const career = createCareer({
    mode: 'challenge',
    teamId,
    difficulty: difficultyFor(stage.level, opts.difficulty),
    gameLength: opts.gameLength,
    seed,
    level: stage.level,
  });
  career.challenge = newChallengeState(0, situation, expectationFor(stage, prestige, situation, 22));
  applyChallengeSituation(career, situation);
  return career;
}

/** Applies a situation to the squad you have just inherited. */
function applyChallengeSituation(career: Career, situation: SituationKey): void {
  const rng = new Rng(`${career.seed}:situation:${career.teamId}:${career.year}`);
  career.roster = applySituation(situation, career.roster, rng, career.level);
  // The situation IS the roster — team ratings are derived from it, so nothing
  // else needs shifting. Chemistry is the exception: it does not live in any
  // player, so a broken locker room has to be written down.
  syncUserTeamRatings(career);
  const chem = situationRatingShift(situation).chemistry;
  if (chem) {
    const derived = career.ratingOverrides[career.teamId] ?? {};
    career.ratingOverrides[career.teamId] = {
      ...derived,
      chemistry: Math.round(clamp((derived.chemistry ?? 60) + chem, 25, 99)),
    };
  }
}

/** The programmes hiring, in the shape the offer generator wants. */
function challengePool(stageIndex: number): Programme[] {
  return programmesAt(stageIndex).map((p) => ({
    id: p.id, name: p.name, short: p.short, prestige: p.prestige,
  }));
}

/**
 * Grades a finished Challenge season and works out what happens next. Safe to
 * call more than once: it only acts when a season has actually completed that
 * the career has not yet been judged on.
 */
export function resolveChallengeSeason(career: Career): SeasonVerdict | null {
  const state = career.challenge;
  if (!state || !career.seasonComplete || state.complete) return null;
  if (state.steps.length >= career.history.length) return null;

  const row = career.standings[career.teamId];
  const last = career.history[career.history.length - 1];
  const verdict = evaluateSeason(state, {
    wins: last?.wins ?? row?.wins ?? 0,
    losses: last?.losses ?? row?.losses ?? 0,
    champion: last?.champion ?? false,
    finish: last?.finish ?? career.finish ?? '',
    teamShort: userTeam(career).short,
    prestige: career.prestige,
  });

  const rng = new Rng(`${career.seed}:offers:${state.totalYears}`);
  if (verdict.outcome === 'promoted' && state.reputation < promotionFloor(state.stageIndex)) {
    // He won it, and nobody above has heard of him. The title still counts —
    // it is on the record and it lifted his reputation — but the move up has
    // to be earned across more than one season.
    state.offerKind = 'rehire';
    state.offers = generateOffers(state, 'rehire', challengePool(state.stageIndex), rng)
      .filter((o) => o.teamId !== career.teamId);
    verdict.messages.push(
      'Nobody at the next level is calling yet. Win here again, or build the reputation somewhere better.',
    );
  } else if (verdict.outcome === 'promoted') {
    state.offerKind = 'promotion';
    // The next rung always. A coach with a real name in the sport is also
    // offered something two rungs up — a smaller job at a much higher level,
    // which is a genuine decision rather than a free upgrade.
    const next = Math.min(FINAL_STAGE, state.stageIndex + 1);
    const reach = Math.min(FINAL_STAGE, state.stageIndex + promotionReach(state));
    const offers = generateOffers(state, 'promotion', challengePool(next), rng, reach === next ? 3 : 2, next);
    if (reach !== next) {
      offers.push(...generateOffers(state, 'promotion', challengePool(reach), rng, 1, reach));
    }
    state.offers = offers.sort((a, b) => (b.stageIndex - a.stageIndex) || (b.prestige - a.prestige));
  } else if (verdict.outcome === 'fired') {
    state.offerKind = 'demotion';
    const target = Math.max(0, state.stageIndex - 1);
    state.offers = generateOffers(state, 'demotion', challengePool(target), rng);
  }
  return verdict;
}

/**
 * Takes one of the jobs on the table. The career carries on — records, alumni
 * and reputation all follow the coach — but the programme does not: a new
 * roster, a new division, and half the staff you built left behind.
 */
export function takeChallengeJob(career: Career, offer: JobOffer): void {
  const state = career.challenge;
  if (!state) return;
  const stage = stageAt(offer.stageIndex);
  acceptOffer(state, offer);

  career.teamId = offer.teamId;
  career.level = stage.level;
  const wt = tryWorldTeam(offer.teamId);
  if (stage.level === 'hs') {
    const key = effectiveClass(career, offer.teamId);
    career.classKey = key;
    career.conferenceId = key;
  } else {
    career.conferenceId = wt?.conference ?? career.conferenceId;
    career.classKey = 'a';
  }
  career.difficulty = difficultyFor(stage.level, career.difficulty);
  career.gameLength = LEVELS[stage.level].gameLength;

  // A new squad, generated at the new level, with the job's problem applied.
  const team = effectiveTeam(career, offer.teamId);
  career.roster = generateRoster(team, `${career.seed}:job:${state.totalYears}`, stage.level);
  career.ratingOverrides[offer.teamId] = {};
  career.prestige = clamp(offer.prestige, 5, 100);

  // You keep what you know, not who you hired. Assistants do not move with you.
  for (const track of TRACK_ORDER) career.staff[track] = Math.floor(career.staff[track] * 0.5);

  // Everything about the season restarts.
  career.year++;
  career.playoffSeeds = null;
  career.nationalSeeds = null;
  career.autoBids = [];
  career.eliminated = false;
  career.seasonComplete = false;
  career.finish = null;
  career.focus = null;
  career.market = [];
  career.pitchesLeft = 0;
  career.lastMovement = null;
  startSeasonSchedule(career, career.seed + career.year * 7919);
  applyChallengeSituation(career, offer.situation);
  // The recruits you were chasing do not follow you. That is the cost of moving.
  openRecruitingClass(career);
  syncUserTeamRatings(career);
}

/**
 * Turning everything down. If you still have a job that just means you stay.
 * If you were SACKED it means a year out of the game — and next spring a new,
 * weaker set of jobs comes up, because you cannot go back to the programme that
 * let you go. Two years out and nobody calls again.
 */
export function declineChallengeOffers(career: Career): void {
  const state = career.challenge;
  if (!state) return;
  const wasFired = state.fired;
  declineAll(state);
  if (!wasFired || state.complete) return;

  state.reputation = clamp(state.reputation - 4, 0, 100);
  const rng = new Rng(`${career.seed}:outofwork:${state.totalYears}`);
  const target = Math.max(0, state.stageIndex - 1);
  state.offerKind = 'demotion';
  state.offers = generateOffers(state, 'demotion', challengePool(target), rng)
    .filter((o) => o.teamId !== career.teamId);
  if (!state.offers.length) {
    // Nothing at all: that is the end of it rather than an endless wait.
    state.complete = true;
    state.endedReason = 'Nobody would give you a team. The career ended there.';
  }
}

/** What the coach's career adds up to, including what he found and developed. */
export function challengeLegacy(career: Career): Legacy | null {
  if (!career.challenge) return null;
  const gems = career.roster.filter((p) => p.overall >= p.potential - 2 && p.overall >= 80).length;
  const developed = career.alumni.filter((a) => a.overall >= STAR_OVERALL).length;
  return legacyScore(career.challenge, { gems, developed });
}

/**
 * Putting your name about. A coach stuck at a programme that will never win
 * anything can go looking, and the jobs he finds are at his own rung or below —
 * the only way UP is still to win a championship.
 *
 * The offers are seeded on the year, so looking twice shows the same list: no
 * rerolling until something good appears.
 */
export function seekChallengeJob(career: Career): JobOffer[] | null {
  const state = career.challenge;
  if (!state || state.complete || !career.seasonComplete) return null;
  if (state.offers && state.offers.length) return state.offers;
  const rng = new Rng(`${career.seed}:seek:${state.totalYears}`);
  const offers = generateOffers(state, 'rehire', challengePool(state.stageIndex), rng);
  // A coach nobody wants finds nothing, which is its own answer.
  if (!offers.length) return null;
  state.offers = offers.filter((o) => o.teamId !== career.teamId);
  state.offerKind = 'rehire';
  return state.offers.length ? state.offers : null;
}
