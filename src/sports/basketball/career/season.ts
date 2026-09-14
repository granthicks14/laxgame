import { clamp } from '../../../core/math';
import { Rng } from '../../../core/rng';
import { buildRoster, starters, teamRatings, type HoopsPlayer } from '../data';
import { LEVELS } from '../levels';
import { bestSchemeFor, resolveScheme } from '../schemes';
import { simulateGame, type SimResult } from '../sim';
import { teamsAtLevel, worldTeam } from '../world';
import type { HoopsGame } from '../Game';
import type { HoopsConfig } from '../types';
import {
  applyAwards, newCoach, perksOf, seasonAward, type HoopsCoach,
} from './coach';
import { DEFAULT_TIER, modsFor, type HoopsTier } from './difficulty';
import { developSquad, rosterTurnover } from './develop';
import {
  advancePostseason, drawBracket, finishPostseason, nextPostseasonGame,
  postseasonFinish, seedField, simulateRestOfPostseason, stillAlive,
} from './playoffs';
import {
  bestPlayer, coachingOf, driftLeague, driftStanding, expectedWinPct, inheritedRoster,
  parOf, rosterFor, schemeFor, simTeam, standingOf,
} from './league';
import { computeNeeds, type Incoming } from './needs';
import {
  buildWindow, openTargets, runOutgoing, signedTargets, type TransferTarget,
} from './portal';
import { committedTo, newRecruitingClass, advanceWeek } from './recruit';
import {
  blankStandings, buildSeason, recordResult, rowFor,
} from './schedule';
import {
  HOOPS_CAREER_VERSION, emptyStatLine,
  type HoopsCareer, type HoopsCareerMode, type HoopsFixture, type StatLine,
} from './types';
import { SITUATIONS, type SituationKey } from './challenge';

/* ---------------------------------------------------------------------------
 * A SEASON, AND THE ONE AFTER THAT
 * ---------------------------------------------------------------------------
 * The engine of a career. Everything here moves a career from one state to the
 * next and nothing here draws anything: create it, play the games, run the
 * postseason, run the offseason, start again.
 *
 * THE ORDER OF AN OFFSEASON IS NOT ARBITRARY. Seniors graduate before the squad
 * develops, because a man who has gone does not get better. Development happens
 * before the portal, because a coach decides who to replace after he knows what
 * he has. Recruiting closes last, because it is the slowest thing and the class
 * arrives in the autumn. Get that order wrong and a career quietly stops making
 * sense.
 * ------------------------------------------------------------------------- */

export interface NewCareerOptions {
  mode: HoopsCareerMode;
  teamId: string;
  tier?: HoopsTier;
  seed?: number;
  /** Challenge only: the state of the programme you are taking over. */
  situation?: SituationKey;
  /** Challenge only: how far the first job sits below its peers. */
  hole?: number;
  coach?: HoopsCoach;
}

export function createCareer(opts: NewCareerOptions): HoopsCareer {
  const team = worldTeam(opts.teamId);
  const tier = opts.tier ?? DEFAULT_TIER;
  const mods = modsFor(tier);
  const seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffff));
  const hole = opts.hole ?? (opts.mode === 'challenge' ? mods.startingHole : 0);
  const penalty = opts.situation ? SITUATIONS[opts.situation].squadPenalty : 0;
  const roster = inheritedRoster(opts.teamId, seed, hole, penalty);
  const par = team.par;
  const best = bestSchemeFor(roster, par);

  const career: HoopsCareer = {
    version: HOOPS_CAREER_VERSION,
    mode: opts.mode,
    seed,
    year: 1,
    teamId: opts.teamId,
    level: team.level,
    conferenceId: team.conferenceId,
    tier,
    offense: best.offense,
    defense: best.defense,
    roster,
    season: {},
    careerStats: {},
    stage: 'preseason',
    schedule: [],
    standings: blankStandings(team.level),
    postseasonSeeds: null,
    postseason: [],
    championId: null,
    finish: null,
    titleSeen: false,
    coach: opts.coach ?? newCoach(),
    standingDrift: {},
    recruiting: null,
    market: [],
    pitchesLeft: 0,
    lastDevelopment: [],
    lastDepartures: [],
    portalOut: [],
    history: [],
    championships: 0,
    careerWins: 0,
    careerLosses: 0,
    challenge: null,
  };
  beginSeason(career);
  return career;
}

/* ------------------------------------------------------------ the season */

export function beginSeason(career: HoopsCareer): void {
  career.schedule = buildSeason({
    level: career.level,
    seed: career.seed,
    year: career.year,
    teamId: career.teamId,
  });
  career.standings = blankStandings(career.level);
  career.postseason = [];
  career.postseasonSeeds = null;
  career.championId = null;
  career.finish = null;
  career.titleSeen = false;
  career.season = {};
  for (const p of career.roster) career.season[p.id] = emptyStatLine();
  career.stage = 'regular';
}

/** The coach's next fixture, or null when the regular season is done. */
export function nextGame(career: HoopsCareer): HoopsFixture | null {
  return career.schedule.find((f) => f.featured && !f.played) ?? null;
}

/** Everything that has to happen before the coach's next game. */
export function pendingBefore(career: HoopsCareer): HoopsFixture[] {
  const next = career.schedule.findIndex((f) => f.featured && !f.played);
  const upto = next < 0 ? career.schedule.length : next;
  return career.schedule.slice(0, upto).filter((f) => !f.played);
}

/** Play out the rest of the league up to the coach's next game. */
export function advanceLeague(career: HoopsCareer): void {
  for (const f of pendingBefore(career)) {
    simulate(career, f);
  }
}

function simulate(career: HoopsCareer, f: HoopsFixture): SimResult {
  const info = LEVELS[career.level];
  const r = simulateGame(simTeam(career, f.homeId), simTeam(career, f.awayId), {
    seed: `${career.seed}:${career.year}:${f.id}`,
    quarterSeconds: info.quarterSeconds,
  });
  f.homeScore = r.home.score;
  f.awayScore = r.away.score;
  f.played = true;
  recordResult(career.standings, f);
  if (f.featured) absorb(career, f, r);
  return r;
}

/** Simulate one of the coach's own games, statistics and all. */
export function simulateUserGame(career: HoopsCareer, f: HoopsFixture): SimResult {
  advanceLeague(career);
  return simulate(career, f);
}

/** Fold a result the coach was part of into his squad's statistics. */
function absorb(career: HoopsCareer, f: HoopsFixture, r: SimResult): void {
  const mine = f.homeId === career.teamId ? r.home : r.away;
  const five = new Set(starters(career.roster).map((p) => p.id));
  for (const l of mine.lines) {
    const line = career.season[l.player.id] ?? (career.season[l.player.id] = emptyStatLine());
    addLine(line, l.line);
    line.games++;
    if (five.has(l.player.id)) line.starts++;
  }
}

function addLine(into: StatLine, from: Partial<StatLine>): void {
  const keys: (keyof StatLine)[] = [
    'points', 'fga', 'fgm', 'tpa', 'tpm', 'fta', 'ftm', 'offReb', 'defReb',
    'assists', 'steals', 'blocks', 'turnovers', 'fouls', 'seconds',
  ];
  for (const k of keys) into[k] += from[k] ?? 0;
}

/**
 * Fold a PLAYED game into the career. The played engine and the fast one
 * produce the same box score, so nothing downstream can tell them apart.
 */
export function recordPlayedGame(career: HoopsCareer, f: HoopsFixture, game: HoopsGame): void {
  const home = f.homeId === career.teamId;
  f.homeScore = game.score[home ? 'home' : 'away'];
  f.awayScore = game.score[home ? 'away' : 'home'];
  f.played = true;
  recordResult(career.standings, f);

  const side = home ? 'home' : 'away';
  const five = new Set(starters(career.roster).map((p) => p.id));
  for (const p of game.played(side)) {
    const line = career.season[p.data.id] ?? (career.season[p.data.id] = emptyStatLine());
    addLine(line, p.stat as unknown as Partial<StatLine>);
    line.games++;
    if (five.has(p.data.id)) line.starts++;
  }
}

/** A config for playing one of the coach's fixtures in the real engine. */
export function gameConfigFor(
  career: HoopsCareer, f: HoopsFixture, humanSide: 'home' | 'away' | null,
): HoopsConfig {
  const info = LEVELS[career.level];
  const home = worldTeam(f.homeId);
  const away = worldTeam(f.awayId);
  return {
    home: { team: home, roster: rosterFor(career, f.homeId) },
    away: { team: away, roster: rosterFor(career, f.awayId) },
    humanSide,
    quarterSeconds: info.quarterSeconds,
    difficulty: difficultyFor(career),
    seed: hashSeed(`${career.seed}:${career.year}:${f.id}`),
    label: f.postseason ? f.postseason : `Game ${career.schedule.indexOf(f) + 1}`,
    homeEdge: 0.011,
    schemes: {
      home: schemeFor(career, f.homeId),
      away: schemeFor(career, f.awayId),
    },
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 0x7fff_ffff;
}

/**
 * How well the opposition plays. Their DECISIONS come from the standing of the
 * club in the world — a blue blood is better coached than a bottom side — and
 * never from the career's difficulty tier, which changes what the coach has to
 * work with and nothing about the basketball.
 */
function difficultyFor(career: HoopsCareer): HoopsConfig['difficulty'] {
  const other = teamsAtLevel(career.level)
    .filter((t) => t.id !== career.teamId);
  const mean = other.reduce((n, t) => n + t.coaching, 0) / Math.max(1, other.length);
  const q = clamp(mean / 99, 0, 1);
  return {
    key: 'pro',
    label: 'League',
    blurb: 'The standard of decision-making at this level.',
    decision: 0.45 + q * 0.45,
    helpSpeed: 0.5 + q * 0.5,
    patience: 0.45 + q * 0.5,
    closeout: 0.5 + q * 0.5,
  };
}

/* ---------------------------------------------------------- the postseason */

/** Is the regular season over? */
export const regularSeasonDone = (career: HoopsCareer): boolean =>
  career.schedule.every((f) => f.played);

export function beginPostseason(career: HoopsCareer): void {
  if (career.postseasonSeeds) return;
  // Anything left unplayed is played now, so a table is never half-finished.
  for (const f of career.schedule) if (!f.played) simulate(career, f);
  career.postseasonSeeds = seedField(career);
  career.postseason = drawBracket(career, career.postseasonSeeds);
  career.stage = 'postseason';
  advancePostseason(career);
}

export const nextPostseasonFixture = nextPostseasonGame;

/** Play out the tournament around the coach until it is his turn again. */
export function advanceBracket(career: HoopsCareer): void {
  advancePostseason(career);
}

export function simulatePostseasonGame(career: HoopsCareer, f: HoopsFixture): SimResult {
  const info = LEVELS[career.level];
  const r = simulateGame(simTeam(career, f.homeId), simTeam(career, f.awayId), {
    seed: `${career.seed}:${career.year}:${f.id}`,
    quarterSeconds: info.quarterSeconds,
  });
  f.homeScore = r.home.score;
  f.awayScore = r.away.score;
  f.played = true;
  if (f.featured) absorb(career, f, r);
  finishPostseason(career);
  return r;
}

/** Run the whole thing out, the coach's games included. */
export function simulateRestOfSeason(career: HoopsCareer): void {
  if (!regularSeasonDone(career)) {
    for (const f of career.schedule) if (!f.played) simulate(career, f);
  }
  if (!career.postseasonSeeds) beginPostseason(career);
  simulateRestOfPostseason(career);
}

export const postseasonComplete = (career: HoopsCareer): boolean =>
  career.championId !== null;

export const coachStillAlive = stillAlive;

/* ----------------------------------------------------------- the offseason */

export interface OffseasonReport {
  finish: string;
  wins: number;
  losses: number;
  champion: boolean;
  graduated: { name: string; pos: string; overall: number; reason: string }[];
  transfersOut: { name: string; pos: string; overall: number; reason: string }[];
  development: HoopsCareer['lastDevelopment'];
  awards: ReturnType<typeof seasonAward>;
  pointsEarned: number;
}

/**
 * Close the season and open the next one.
 *
 * The order here is the whole design. Seniors leave before the squad develops —
 * a man who has gone does not get better. Development happens before the portal
 * — a coach decides who to replace after he knows what he has. Recruiting opens
 * last and runs into the new year.
 */
export function runOffseason(career: HoopsCareer): OffseasonReport {
  const row = rowFor(career.standings, career.teamId);
  const champion = career.championId === career.teamId;
  const finish = postseasonFinish(career);
  const games = Math.max(1, row.wins + row.losses);
  const perks = perksOf(career.coach);
  const mods = modsFor(career.tier);
  const par = parOf(career, career.teamId);

  /* 1. THE RECORD. */
  career.finish = finish;
  career.careerWins += row.wins;
  career.careerLosses += row.losses;
  career.coach.careerWins += row.wins;
  career.coach.careerLosses += row.losses;
  career.coach.seasons++;
  if (champion) {
    career.championships++;
    career.coach.championships++;
  }
  const star = bestSeasonLine(career);
  career.history.push({
    year: career.year,
    teamId: career.teamId,
    level: career.level,
    wins: row.wins,
    losses: row.losses,
    finish,
    champion,
    star,
  });

  /* 2. WHO LEAVES. Eligibility first, then anybody who chooses to go. */
  const needsNow = computeNeeds(career.roster, career.level, [], par);
  const outgoing = runOutgoing({
    roster: career.roster,
    level: career.level,
    season: career.season,
    games,
    form: row.wins / games,
    perks,
    mods,
    seed: `${career.seed}:${career.year}`,
    needs: needsNow,
  });
  const transferred = new Set(outgoing.left.map((p) => p.id));
  career.portalOut = outgoing.departures;

  const remaining = career.roster.filter((p) => !transferred.has(p.id));
  const turnover = rosterTurnover(remaining, career.level, `${career.seed}:${career.year}`, par);

  career.lastDepartures = [
    ...turnover.leaving.map((p) => ({
      name: `${p.first} ${p.last}`,
      pos: p.pos,
      overall: p.overall,
      reason: turnover.reasons.get(p.id) ?? 'Left the programme',
    })),
    ...outgoing.departures.map((d) => ({
      name: d.name, pos: d.pos, overall: d.overall, reason: d.text,
    })),
  ];

  /* 3. CAREER TOTALS SURVIVE THE DEPARTURE. */
  for (const p of [...turnover.leaving, ...outgoing.left]) {
    const line = career.season[p.id];
    if (line) mergeCareer(career, p.id, line);
  }

  career.roster = turnover.staying;

  /* 4. DEVELOPMENT. What is left gets better, or does not. */
  career.lastDevelopment = developSquad({
    roster: career.roster,
    level: career.level,
    seed: `${career.seed}:${career.year}`,
    perks,
    mods,
    season: career.season,
    games,
  });

  /* 5. EVERY SEASON LINE BECOMES A CAREER LINE. */
  for (const p of career.roster) {
    const line = career.season[p.id];
    if (line) mergeCareer(career, p.id, line);
  }

  /* 6. THE POINTS. */
  const developed = career.lastDevelopment.filter((d) => d.to - d.from >= 3).length;
  const awards = seasonAward({
    wins: row.wins,
    losses: row.losses,
    expected: expectedWinPct(career),
    champion,
    postseason: !!career.postseasonSeeds?.includes(career.teamId),
    developed,
    level: career.level,
    scale: mods.coachPoints,
  });
  applyAwards(career.coach, awards);

  /* 7. THE WORLD MOVES. */
  driftStanding(career, career.teamId, row.wins, row.losses, champion);
  driftLeague(career);

  /* 8. THE MARKETS OPEN. */
  openOffseasonMarkets(career);

  career.year++;
  career.stage = 'offseason';

  return {
    finish,
    wins: row.wins,
    losses: row.losses,
    champion,
    graduated: career.lastDepartures.filter((d) =>
      d.reason === 'Graduated' || d.reason === 'Eligibility used up' || d.reason === 'Retired'),
    transfersOut: outgoing.departures.map((d) => ({
      name: d.name, pos: d.pos, overall: d.overall, reason: d.text,
    })),
    development: career.lastDevelopment,
    awards,
    pointsEarned: awards.reduce((n, a) => n + a.points, 0),
  };
}

function mergeCareer(career: HoopsCareer, id: string, line: StatLine): void {
  const into = career.careerStats[id] ?? (career.careerStats[id] = emptyStatLine());
  addLine(into, line);
  into.games += line.games;
  into.starts += line.starts;
}

export function openOffseasonMarkets(career: HoopsCareer): void {
  const perks = perksOf(career.coach);
  const mods = modsFor(career.tier);
  const info = LEVELS[career.level];
  const par = parOf(career, career.teamId);

  career.market = buildWindow({
    level: career.level,
    year: career.year,
    seed: career.seed,
    perks,
    mods,
    size: 6,
    par,
  });
  career.pitchesLeft = 3 + perks.extraPitches;

  if (info.market === 'recruiting') {
    career.recruiting = newRecruitingClass({
      level: career.level,
      year: career.year + 1,
      seed: career.seed,
      size: 22,
      perks,
      mods,
      rivals: teamsAtLevel(career.level)
        .filter((t) => t.id !== career.teamId)
        .map((t) => ({ id: t.id, standing: standingOf(career, t.id) })),
    });
  } else {
    career.recruiting = null;
  }
}

/** Everybody already committed to arrive, for the needs screen. */
export function incomingFor(career: HoopsCareer): Incoming[] {
  const out: Incoming[] = [];
  if (career.recruiting) {
    for (const p of committedTo(career.recruiting, career.teamId)) {
      out.push({ pos: p.player.pos, overall: p.player.overall });
    }
  }
  for (const t of signedTargets(career.market, career.teamId)) {
    out.push({ pos: t.player.pos, overall: t.player.overall });
  }
  return out;
}

export function needsFor(career: HoopsCareer): ReturnType<typeof computeNeeds> {
  return computeNeeds(
    career.roster, career.level, incomingFor(career), parOf(career, career.teamId),
  );
}

/** One week of the recruiting cycle. */
export function recruitWeek(career: HoopsCareer): string[] {
  if (!career.recruiting) return [];
  const perks = perksOf(career.coach);
  const mods = modsFor(career.tier);
  const row = rowFor(career.standings, career.teamId);
  const games = Math.max(1, row.wins + row.losses);
  return advanceWeek({
    state: career.recruiting,
    teamId: career.teamId,
    prog: {
      teamId: career.teamId,
      standing: standingOf(career, career.teamId),
      form: row.wins / games,
      perks,
      needs: needsFor(career),
      region: 'in state',
      level: career.level,
    },
    perks,
    mods,
    seed: career.seed,
    openSpots: needsFor(career).openSpots,
  });
}

export const recruitingDone = (career: HoopsCareer): boolean =>
  !career.recruiting || career.recruiting.week >= career.recruiting.weeks;

/**
 * Close the offseason: everybody who committed arrives, and the new season is
 * built around them.
 */
export function startNextSeason(career: HoopsCareer): void {
  const info = LEVELS[career.level];
  const arriving: HoopsPlayer[] = [];

  if (career.recruiting) {
    for (const p of committedTo(career.recruiting, career.teamId)) arriving.push(p.player);
  }
  for (const t of signedTargets(career.market, career.teamId)) arriving.push(t.player);

  // Never over the cap, whatever the markets did.
  const room = Math.max(0, info.rosterSize - career.roster.length);
  career.roster = [...career.roster, ...arriving.slice(0, room)];

  // A squad that is still short is filled from what is available: walk-ons at a
  // school, minimum contracts in a professional league. They are not good.
  fillRoster(career);

  career.recruiting = null;
  career.market = [];
  career.pitchesLeft = 0;
  beginSeason(career);
}

/**
 * Nobody ever plays a season with nine men. A squad below the floor is topped up
 * with whatever was left over, and what was left over is bad — which is exactly
 * the cost of a recruiting cycle the coach ignored.
 */
export function fillRoster(career: HoopsCareer): void {
  const info = LEVELS[career.level];
  // Right up to the cap. Filling only to three short of it meant a coach who
  // recruited badly kept a permanently thin squad AND a coach who recruited well
  // still never had a full one, because the filler stopped before the last seat.
  if (career.roster.length >= info.rosterSize) return;
  const rng = new Rng(`hoops:fill:${career.seed}:${career.year}`);

  /* WALK-ONS, and they are not a free squad.
   *
   * They are built a long way below the level's standard, they are all
   * first-years, and they fill the position the squad is thinnest at. A coach who
   * did not recruit gets these instead of players, and a side carried by them
   * loses — which is the whole point of the recruiting board. */
  const par = parOf(career, career.teamId);
  let guard = 0;
  while (career.roster.length < info.rosterSize && guard++ < 40) {
    const thin = [...computeNeeds(career.roster, career.level, [], par).list]
      .sort((a, b) => a.projected - b.projected || b.need - a.need)[0];
    const pos = thin ? thin.pos : 'SF';
    const made = buildRoster(
      `hoops:walkon:${career.teamId}:${career.seed}:${career.year}:${guard}`,
      rng.int(1, 0x7fff_ffff),
      {
        par: par - 14,
        size: 1,
        shape: { PG: 0, SG: 0, SF: 0, PF: 0, C: 0, [pos]: 1 },
        ageSystem: info.ageSystem,
        eligibility: info.eligibility || 4,
      },
    );
    const p = made[0];
    if (!p) break;
    p.years = 1;
    p.age = info.ageSystem === 'class' ? (info.eligibility === 2 ? 19 : 18) : 21;
    // A walk-on is young, so he has room — just less of it than a recruit.
    p.potential = clamp(
      p.overall + Math.round(3 + rng.range(0, 1) ** 1.6 * 15), p.overall, 99,
    );
    career.roster.push(p);
  }
}

/* --------------------------------------------------------------- reporting */

function bestSeasonLine(career: HoopsCareer): string | null {
  let best: { id: string; value: number } | null = null;
  for (const [id, line] of Object.entries(career.season)) {
    if (!line.games) continue;
    const value = line.points / line.games
      + (line.offReb + line.defReb) / line.games * 0.9
      + line.assists / line.games * 1.4;
    if (!best || value > best.value) best = { id, value };
  }
  if (!best) return null;
  const p = career.roster.find((x) => x.id === best!.id);
  const line = career.season[best.id];
  const name = p ? `${p.first} ${p.last}` : 'A departed player';
  return `${name} ${(line.points / Math.max(1, line.games)).toFixed(1)} ppg`;
}

/** Per-game averages, which is how basketball says a statistic. */
export interface Averages {
  games: number;
  ppg: number; rpg: number; apg: number; spg: number; bpg: number;
  fgPct: number; tpPct: number; ftPct: number; topg: number; mpg: number;
}

export function averages(line: StatLine | undefined): Averages {
  const g = Math.max(1, line?.games ?? 0);
  const l = line ?? emptyStatLine();
  return {
    games: l.games,
    ppg: l.points / g,
    rpg: (l.offReb + l.defReb) / g,
    apg: l.assists / g,
    spg: l.steals / g,
    bpg: l.blocks / g,
    topg: l.turnovers / g,
    mpg: l.seconds / g / 60,
    fgPct: l.fga > 0 ? l.fgm / l.fga : 0,
    tpPct: l.tpa > 0 ? l.tpm / l.tpa : 0,
    ftPct: l.fta > 0 ? l.ftm / l.fta : 0,
  };
}

/** The squad's leaders, for the dashboard. */
export function teamLeaders(career: HoopsCareer): {
  label: string; name: string; value: string;
}[] {
  const pick = (
    label: string, of: (a: Averages) => number, fmt: (n: number) => string,
  ): { label: string; name: string; value: string } | null => {
    let best: { p: HoopsPlayer; v: number } | null = null;
    for (const p of career.roster) {
      const line = career.season[p.id];
      if (!line?.games) continue;
      const v = of(averages(line));
      if (!best || v > best.v) best = { p, v };
    }
    if (!best) return null;
    return { label, name: `${best.p.first[0]}. ${best.p.last}`, value: fmt(best.v) };
  };
  const one = (n: number): string => n.toFixed(1);
  return [
    pick('Points', (a) => a.ppg, one),
    pick('Rebounds', (a) => a.rpg, one),
    pick('Assists', (a) => a.apg, one),
    pick('Steals', (a) => a.spg, one),
  ].filter((x): x is { label: string; name: string; value: string } => !!x);
}

/** Where the squad stands, in one line. */
export function squadLine(career: HoopsCareer): string {
  const r = teamRatings(career.roster);
  const best = bestPlayer(career.roster);
  return `Overall ${r.overall} · offence ${r.offense} · defence ${r.defense}`
    + `${best ? ` · best: ${best.first} ${best.last} (${best.overall})` : ''}`;
}

export { coachingOf, openTargets, resolveScheme, type TransferTarget };
