import { clamp } from '../../../core/math';
import { Rng } from '../../../core/rng';
import { buildRoster, starters, teamRatings, type HoopsPlayer } from '../data';
import { LEVELS } from '../levels';
import {
  bestSchemeFor, rankedSchemesFor, resolveScheme,
  type DefenseScheme, type OffenseScheme,
} from '../schemes';
import { simulateGame, type SimResult } from '../sim';
import { teamsAtLevel, worldTeam } from '../world';
import type { HoopsGame } from '../Game';
import type { HoopsConfig } from '../types';
import {
  applyAwards, coachLevel, logSeasonToJob, newCoach, perksOf, seasonAward, startJob,
  type HoopsCoach,
} from './coach';
import {
  DEFAULT_TIER, TIERS, courtFeel, modsFor, type HoopsTier,
} from './difficulty';
import { developSquad, rosterTurnover } from './develop';
import {
  advancePostseason, drawBracket, finishPostseason, nextPostseasonGame,
  postseasonFinish, seedField, simulateRestOfPostseason, stillAlive,
} from './playoffs';
import {
  bestPlayer, coachingOf, driftLeague, driftStanding, expectedWinPct, inheritedRoster,
  parOf, quarterSecondsFor, rosterFor, schemeFor, simTeam, standingOf,
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
  HOOPS_CAREER_VERSION, averages, emptyStatLine,
  type Averages, type HoopsCareer, type HoopsCareerMode, type HoopsFixture,
  type StatLine,
} from './types';
import { recordAlumnus } from './records';
import { matchRoster } from './practice';
import { approachesFor, type Approach } from './interest';
import type { GameLengthKey } from '../tuning';
import { playedStory, simStory } from './story';
import {
  SITUATIONS, acceptOffer, declineAll, evaluateSeason, expectationFor, generateOffers,
  newChallengeState, type JobOffer, type OfferKind, type SeasonVerdict,
  type SituationKey,
} from './challenge';
import { FINAL_RUNG, programmesAt, rungOf } from './ladder';

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
  /** Null, or the default for the level, is the honest choice. */
  gameLength?: GameLengthKey | null;
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

  /* CHALLENGE MODE STARTS A PERSON, not a save slot. The coach, his reputation
   * and his record follow him from programme to programme for the rest of the
   * career; only the club around him is replaced. */
  const rungIndex = rungOf(team.level);
  const situation: SituationKey = opts.situation ?? 'rebuild';

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
    alumni: [],
    practice: null,
    gameLength: opts.gameLength ?? null,
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
    lastAwards: [],
    lastDepartures: [],
    portalOut: [],
    history: [],
    championships: 0,
    careerWins: 0,
    careerLosses: 0,
    challenge: opts.mode === 'challenge'
      ? newChallengeState(
        rungIndex, situation,
        expectationFor(rungIndex, team.standing, situation, 20, tier),
        tier,
      )
      : null,
  };
  // The first line on the résumé, opened the day he is hired.
  startJob(career.coach, career.teamId, career.level, career.year);
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
  const r = simulateGame(simTeam(career, f.homeId), simTeam(career, f.awayId), {
    seed: `${career.seed}:${career.year}:${f.id}`,
    quarterSeconds: quarterSecondsFor(career),
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
  const home = f.homeId === career.teamId;
  const mine = home ? r.home : r.away;
  const five = new Set(starters(career.roster).map((p) => p.id));
  f.story = simStory(r, home ? 'home' : 'away', {
    yourAbbr: worldTeam(career.teamId).abbr,
    theirAbbr: worldTeam(home ? f.awayId : f.homeId).abbr,
  });
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
  f.story = playedStory(game, side, {
    yourAbbr: worldTeam(career.teamId).abbr,
    theirAbbr: worldTeam(home ? f.awayId : f.homeId).abbr,
  });
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
  const home = worldTeam(f.homeId);
  const away = worldTeam(f.awayId);
  const squad = (id: string): HoopsPlayer[] =>
    (id === career.teamId ? matchRoster(career) : rosterFor(career, id));
  return {
    home: { team: home, roster: squad(f.homeId) },
    away: { team: away, roster: squad(f.awayId) },
    humanSide,
    quarterSeconds: quarterSecondsFor(career),
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
 * How well the opposition plays, on the floor.
 *
 * TWO INPUTS, and they are different things. Their DECISIONS come from the
 * standing of the club in the world — a blue blood is better coached than a
 * bottom side, and that is a fact about the world rather than a difficulty
 * setting. Their EXECUTION, and the room your own thumb gets, come from the
 * career's tier: a Legendary career has a smaller release window, contests that
 * bite, and a defence that reacts sooner and makes fewer messes of its own.
 *
 * Neither one hands anybody a rating they did not earn.
 */
function difficultyFor(career: HoopsCareer): HoopsConfig['difficulty'] {
  const other = teamsAtLevel(career.level)
    .filter((t) => t.id !== career.teamId);
  const mean = other.reduce((n, t) => n + t.coaching, 0) / Math.max(1, other.length);
  const q = clamp(mean / 99, 0, 1);
  const feel = courtFeel(career.tier);
  return {
    key: 'pro',
    label: TIERS[career.tier].name,
    blurb: 'The standard of decision-making at this level.',
    decision: 0.45 + q * 0.45,
    helpSpeed: 0.5 + q * 0.5,
    patience: 0.45 + q * 0.5,
    closeout: 0.5 + q * 0.5,
    reaction: feel.reaction,
    passError: feel.passError,
    mistake: feel.mistake,
    rotation: feel.rotation,
    glass: feel.glass,
    discipline: feel.discipline,
    window: feel.window,
    contest: feel.contest,
    timingBite: feel.timingBite,
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
  const r = simulateGame(simTeam(career, f.homeId), simTeam(career, f.awayId), {
    seed: `${career.seed}:${career.year}:${f.id}`,
    quarterSeconds: quarterSecondsFor(career),
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
  /** Challenge only: the board's view of the season, and what follows from it. */
  verdict: SeasonVerdict | null;
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

  /* Why each man is going, so it can be said once and used twice: on the
   * offseason report, and on the wall. */
  const reasonFor = new Map<string, string>();
  for (const p of turnover.leaving) {
    reasonFor.set(p.id, turnover.reasons.get(p.id) ?? 'Left the programme');
  }
  for (const d of outgoing.departures) reasonFor.set(d.id, d.text);

  career.lastDepartures = [
    ...turnover.leaving.map((p) => ({
      name: `${p.first} ${p.last}`,
      pos: p.pos,
      overall: p.overall,
      reason: reasonFor.get(p.id) ?? 'Left the programme',
    })),
    ...outgoing.departures.map((d) => ({
      name: d.name, pos: d.pos, overall: d.overall, reason: d.text,
    })),
  ];

  /* 3. CAREER TOTALS SURVIVE THE DEPARTURE, AND SO DOES THE MAN.
   *
   * The career line has to be closed BEFORE he is written to the wall, because
   * what goes on the wall is the finished line, not the one he is still adding to.
   */
  for (const p of [...turnover.leaving, ...outgoing.left]) {
    const line = career.season[p.id];
    if (line) mergeCareer(career, p.id, line);
  }
  for (const p of [...turnover.leaving, ...outgoing.left]) {
    recordAlumnus(
      career, p.id, `${p.first} ${p.last}`, p.pos, p.overall,
      reasonFor.get(p.id) ?? 'Left the programme',
    );
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
    // A season spent emphasising one area of the game grows that area faster.
    practice: career.practice,
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
  career.lastAwards = awards;
  // The résumé line for the club he is at, so a multi-job career reads as one.
  logSeasonToJob(career.coach, career.year, row.wins, row.losses, champion);

  /* 7. THE WORLD MOVES. */
  driftStanding(career, career.teamId, row.wins, row.losses, champion);
  driftLeague(career);

  /* 8. THE VERDICT. Challenge Mode only: what the programme made of the season,
   *    and whether the coach is still its coach. */
  const verdict = career.mode === 'challenge' && career.challenge
    ? judgeSeason(career, row.wins, row.losses, champion, finish)
    : null;

  /* 9. THE MARKETS OPEN — unless he is on his way out of the building. There is
   *    no point recruiting a class for a programme that has just sacked you, and
   *    no point recruiting one for a programme you are about to leave. */
  if (!career.challenge?.offers) openOffseasonMarkets(career);

  career.year++;
  career.stage = 'offseason';

  return {
    verdict,
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

/* --------------------------------------------------------------- schemes */

export interface SchemeAdvice {
  /** What he is running, and how well the current squad runs it. */
  offense: OffenseScheme;
  defense: DefenseScheme;
  offenseFit: number;
  defenseFit: number;
  /** What this squad would run best. */
  bestOffense: OffenseScheme;
  bestDefense: DefenseScheme;
  bestOffenseFit: number;
  bestDefenseFit: number;
  /** True when there is a visibly better plan for these players. */
  shouldChange: boolean;
}

/**
 * How well the system fits the men running it — the number behind the scheme
 * screen's verdict.
 *
 * This matters more than it looks. A coach keeps his scheme when he changes jobs
 * and when his squad turns over, and four graduations later the plan that won him
 * a championship can be the wrong plan entirely. Nothing tells him that unless
 * this does.
 */
export function schemeAdvice(career: HoopsCareer): SchemeAdvice {
  const par = parOf(career, career.teamId);
  const ranked = rankedSchemesFor(career.roster, par);
  const fitOf = <T extends string>(list: { key: T; fit: number }[], key: T): number =>
    list.find((x) => x.key === key)?.fit ?? 0;
  const offenseFit = fitOf(ranked.offense, career.offense);
  const defenseFit = fitOf(ranked.defense, career.defense);
  return {
    offense: career.offense,
    defense: career.defense,
    offenseFit,
    defenseFit,
    bestOffense: ranked.offense[0].key,
    bestDefense: ranked.defense[0].key,
    bestOffenseFit: ranked.offense[0].fit,
    bestDefenseFit: ranked.defense[0].fit,
    shouldChange: ranked.offense[0].fit - offenseFit > 0.12
      || ranked.defense[0].fit - defenseFit > 0.12,
  };
}

/* ------------------------------------------------------------- the career */

/* ---------------------------------------------------------------------------
 * ONE COACH, MANY PROGRAMMES
 * ---------------------------------------------------------------------------
 * In Challenge Mode a season ends with a verdict rather than a fixture list. The
 * board decides whether you are still its coach; winning a championship makes the
 * phone ring somewhere better; losing three arguments with expectation makes it
 * ring from somewhere worse.
 *
 * What survives a move is the COACH: his upgrade tree, his points, his record,
 * his reputation, every player line he has ever accumulated. What does not is the
 * club — a new roster, a new level, a new conference, a new set of people who
 * have never heard of you. That division is the whole mode.
 * ------------------------------------------------------------------------- */

/** Which rung a set of offers is drawn from. */
function offerRung(career: HoopsCareer, kind: OfferKind): number {
  const state = career.challenge!;
  if (kind === 'promotion') return Math.min(FINAL_RUNG, state.rungIndex + 1);
  // Sacked, or turning down a rehire: you drop a level and start again.
  return Math.max(0, state.rungIndex - 1);
}

function drawOffers(career: HoopsCareer, kind: OfferKind): JobOffer[] {
  const state = career.challenge!;
  const rung = offerRung(career, kind);
  const pool = programmesAt(rung).filter((p) => p.id !== career.teamId);
  const rng = new Rng(`hoops:jobs:${career.seed}:${career.year}:${state.totalYears}:${kind}`);
  state.offerKind = kind;
  state.offers = generateOffers(state, kind, pool, rng, 3, rung);
  return state.offers;
}

/** Grade the season and put the jobs, if there are any, on the table. */
function judgeSeason(
  career: HoopsCareer, wins: number, losses: number, champion: boolean, finish: string,
): SeasonVerdict {
  const state = career.challenge!;
  const team = worldTeam(career.teamId);
  const verdict = evaluateSeason(state, {
    wins,
    losses,
    champion,
    finish,
    teamShort: team.abbr,
    standing: standingOf(career, career.teamId),
  });
  if (verdict.outcome === 'complete') career.stage = 'complete';
  else if (verdict.outcome === 'promoted') drawOffers(career, 'promotion');
  else if (verdict.outcome === 'fired') drawOffers(career, 'demotion');
  return verdict;
}

/** True while the career is waiting for the coach to choose a job. */
export const awaitingDecision = (career: HoopsCareer): boolean =>
  !!career.challenge?.offers?.length;

/**
 * Take one of the jobs on the table.
 *
 * The coach walks in with everything he has earned and nothing else: the squad,
 * the level, the conference and the schemes are all whoever was here before him,
 * and the state of the programme is exactly what the offer said it was.
 */
export function takeJob(career: HoopsCareer, offer: JobOffer): void {
  const state = career.challenge;
  if (!state || !state.offers) return;
  acceptOffer(state, offer);

  const team = worldTeam(offer.teamId);
  const mods = modsFor(career.tier);

  /* WHAT YOUR NAME IS WORTH.
   *
   * The first job in a career is somebody else's mess, and that is the premise of
   * the mode. The tenth is not. A coach with three championships behind him is
   * hired by a programme that has kept something together for him, so the hole he
   * inherits shrinks with his reputation — while the SITUATION penalty, which is
   * the risk he chose off the job screen with his eyes open, does not.
   *
   * Without this every single promotion cost four years of rebuilding, nothing a
   * coach achieved ever compounded, and sixty seasons of a nine-rung climb bought
   * four rungs. */
  const hole = mods.startingHole * clamp(1 - state.reputation / 130, 0.2, 1);
  const roster = inheritedRoster(
    offer.teamId,
    new Rng(`hoops:hire:${career.seed}:${state.totalYears}`).int(1, 0x7fff_ffff),
    hole,
    SITUATIONS[offer.situation].squadPenalty,
  );

  career.teamId = offer.teamId;
  career.level = team.level;
  career.conferenceId = team.conferenceId;
  career.roster = roster;
  startJob(career.coach, team.id, team.level, career.year);
  const best = bestSchemeFor(roster, team.par);
  career.offense = best.offense;
  career.defense = best.defense;
  career.recruiting = null;
  career.market = [];
  career.pitchesLeft = 0;
  career.lastDevelopment = [];
  career.lastDepartures = [];
  career.portalOut = [];
  beginSeason(career);
}

/**
 * Turn every offer down.
 *
 * After a championship that means staying where you are, which is a real choice:
 * the programme you built is still yours and the recruiting cycle opens as normal.
 * After a sacking it means a year out of the game, and the second one of those
 * ends the career.
 */
export function refuseJobs(career: HoopsCareer): string {
  const state = career.challenge;
  if (!state || !state.offers) return '';
  const sacked = state.fired;
  declineAll(state);

  if (state.complete) {
    career.stage = 'complete';
    return state.endedReason ?? 'The career is over.';
  }
  if (!sacked) {
    openOffseasonMarkets(career);
    return `You are staying at ${worldTeam(career.teamId).name}.`;
  }
  // A year on the sofa, and then whoever will still take the call.
  career.year++;
  drawOffers(career, 'rehire');
  return 'A year out of the game. The phone rings again in the spring.';
}

/**
 * Take a job somebody else offered you, in a Dynasty.
 *
 * The coach keeps everything he earned and loses the club entirely. He inherits
 * the squad that programme ACTUALLY HAS — derived from the world exactly as every
 * rival's is, so the roster he walks into is the roster the tables have been
 * telling him about all season, not a generated approximation of it. That is the
 * honest version: a good job comes with good players, and a coach can read the
 * standings before he says yes.
 *
 * Returns false if the offer is not one this career could accept, so a stale
 * screen cannot teleport a coach across the pyramid.
 */
export function acceptApproach(career: HoopsCareer, approach: Approach): boolean {
  if (career.mode !== 'dynasty') return false;
  if (approach.teamId === career.teamId) return false;
  if (!approachesFor(career).some((a) => a.teamId === approach.teamId)) return false;

  const team = worldTeam(approach.teamId);
  /* The squad as the world has it — the same call every table, every scouting
   * screen and every simulated fixture has been making about this club. Copied,
   * because from here on it is the coach's roster and he will change it. */
  const roster = rosterFor(career, approach.teamId)
    .map((p) => ({ ...p, attrs: { ...p.attrs } }));

  career.teamId = team.id;
  career.level = team.level;
  career.conferenceId = team.conferenceId;
  career.roster = roster;
  startJob(career.coach, team.id, team.level, career.year);
  const best = bestSchemeFor(roster, team.par);
  career.offense = best.offense;
  career.defense = best.defense;
  /* THE SEASON STARTS OVER, not continues: he is a new club's coach, so the
   * statistics, the markets and the squad's development report all belong to the
   * job he just left. His CAREER totals and his wall of alumni do not — those are
   * his. */
  career.season = {};
  career.recruiting = null;
  career.market = [];
  career.pitchesLeft = 0;
  career.lastDevelopment = [];
  career.lastDepartures = [];
  career.portalOut = [];
  career.practice = null;
  /* He arrives in the MIDDLE OF AN OFFSEASON, so he gets that programme's
   * offseason: its transfer window, its recruiting board, and its holes to fill.
   * `startNextSeason` builds the schedule when he is done, exactly as it does for
   * a coach who stayed — there is one path into a season, not two. */
  openOffseasonMarkets(career);
  career.stage = 'offseason';
  return true;
}

function mergeCareer(career: HoopsCareer, id: string, line: StatLine): void {
  const into = career.careerStats[id] ?? (career.careerStats[id] = emptyStatLine());
  addLine(into, line);
  into.games += line.games;
  into.starts += line.starts;
  // One more season in the programme, which is the only place that is counted.
  if (line.games > 0) into.seasons += 1;
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
  /* How many approaches he can make in the window. It scales with how much of the
   * squad he has to replace: a junior college gives its players two years, so half
   * the roster leaves every summer and three phone calls does not rebuild it. */
  const holes = Math.max(0, info.rosterSize - career.roster.length);
  career.pitchesLeft = 3 + perks.extraPitches + Math.floor(holes / 3);

  if (info.market === 'recruiting') {
    // The board is sized to the job: a programme with nine places to fill needs
    // more names in front of it than one with two.
    const places = Math.max(0, info.rosterSize - career.roster.length);
    career.recruiting = newRecruitingClass({
      level: career.level,
      year: career.year + 1,
      seed: career.seed,
      size: clamp(18 + places * 2, 18, 40),
      places,
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

/**
 * What the sport thinks of the coach, 0..100.
 *
 * In Challenge Mode it is the reputation the career tracks. In Dynasty there is
 * no job market and so no reputation, but a coach with four championships and a
 * developed tree is still a name — so it is read off what he has actually done.
 */
export function coachStature(career: HoopsCareer): number {
  if (career.challenge) return career.challenge.reputation;
  return clamp(
    30 + career.coach.championships * 9 + coachLevel(career.coach) * 3
    + (career.coach.careerWins - career.coach.careerLosses) * 0.25,
    0, 100,
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
      reputation: coachStature(career),
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

/* Averages live with the stat line itself, in ./types, so a screen can turn a
 * line into per-game numbers without pulling in the whole season engine — and so
 * the record book can do it without importing the module that imports it. */
export { averages, type Averages } from './types';

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
