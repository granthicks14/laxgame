import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { POSITIONS, makePlayer, type Player, type Position } from '../data';
import { CONFERENCES, TEAMS, nflTeam, parFor, rosterFor, teamOr, type Conference } from '../nfl';
import { DIFFICULTIES, GAME_LENGTHS, type GameLengthKey } from '../tuning';
import { emptyStatLine, type DifficultyKey, type FootballConfig, type GamePlan, type StatLine } from '../types';
import { simulateGame, type SimResult } from '../sim';
import type { FootballGame } from '../Game';
import {
  FACILITY_KEYS, FRANCHISE_VERSION, OFFSEASON_STEPS,
  type Fixture, type Franchise, type FranchiseMode, type OffseasonStep,
  type SeedEntry, type SeasonRecord,
} from './types';
import {
  MINIMUM_SHAPE, ROSTER_LIMIT, capUsed, fitToCap, homeEdgeFor, moveFanSupport, priceRoster,
  scoutBudget, settleFinances, SALARY_CAP,
} from './club';
import { autoOffseason } from './autogm';
import {
  buildSchedule, byeWeek, divisionRanks, divisionTable, recordOf, seedsFor,
  sortStandings, standingsFor, winPct, REGULAR_SEASON_WEEKS,
} from './schedule';
import { ROUND_ORDER, exitLabel, nextRound, playoffLabel, roundsPlayed, wildCardRound } from './playoffs';
import { ageStaff, staffMarket, startingStaff } from './staff';
import { gameRoster, rosterOf } from './world';
import { ageAndDevelop, tickContracts, updateMorale } from './develop';
import { healAll, rollInjuries, tickInjuries } from './injuries';
import { DRAFT_ROUNDS, boardChoice, draftOrder, draftSlots, generateClass, runDraft } from './draft';
import { generateFreeAgents, release, resolveWave, FA_WAVES } from './freeAgency';
import { push, recapOf } from './news';
import { beginChallengeSeason, judgeChallengeSeason } from './challenge';

/* ---------------------------------------------------------------------------
 * A SEASON, AND THEN THE NEXT ONE
 * ---------------------------------------------------------------------------
 * The franchise state machine. Every state a franchise can be in and every way
 * it moves between them, in one file, so there is exactly one opinion about
 * what happens next:
 *
 *   PRESEASON    camp. The roster, the staff, the schedule. Nothing has happened.
 *      v
 *   REGULAR      eighteen weeks. You play your game or simulate it; the other
 *                fifteen are played around you either way, and the table and the
 *                playoff picture move whether you looked at them or not.
 *      v
 *   PLAYOFFS     fourteen clubs, four rounds, one game in February.
 *      v
 *   OFFSEASON    review, staff, your own contracts, free agency, the draft,
 *                the buildings. In that order, one at a time.
 *      v
 *   PRESEASON again, a year older, with the squad you built.
 * ------------------------------------------------------------------------- */

export function createFranchise(o: {
  mode: FranchiseMode;
  teamId: string;
  coachName: string;
  difficulty: DifficultyKey;
  gamePlan?: GamePlan;
  seed?: number;
}): Franchise {
  const team = nflTeam(o.teamId);
  if (!team) throw new Error(`no such club: ${o.teamId}`);
  const seed = o.seed ?? new Rng(`nfl:new:${Date.now()}`).int(1, 0x7fff_ffff);
  const rng = new Rng(`nfl:start:${seed}:${o.teamId}`);

  const roster = rosterFor(team, seed, 1);
  priceRoster(roster, rng);
  /* THE SQUAD YOU INHERIT FITS UNDER THE CAP. A franchise that opens ten
   * million over has handed the player a problem he did not create as his
   * very first decision, which is the worst possible first decision. */
  fitToCap(roster);

  const fr: Franchise = {
    version: FRANCHISE_VERSION,
    mode: o.mode,
    seed,
    year: 1,
    teamId: team.id,
    coachName: o.coachName,
    difficulty: o.difficulty,
    gameLength: null,
    gamePlan: o.gamePlan ?? 'balanced',

    roster,
    staff: startingStaff(seed, team.id, 48 + team.prestige * 4),
    seasonStats: {},
    careerStats: {},
    gamesMissed: {},

    funds: 30 + team.market * 4,
    lastRevenue: 0,
    lastExpenses: 0,
    fanSupport: 40 + team.prestige * 7,
    facilities: { training: 1, medical: 1, stadium: 1, scouting: 1, practice: 1 },

    stage: 'preseason',
    schedule: [],
    standings: {},
    playoffs: [],
    seeds: null,
    championId: null,
    finish: null,
    titleSeen: true,

    history: [],
    news: [],
    championships: 0,
    conferenceTitles: 0,
    divisionTitles: 0,
    playoffApps: 0,
    prestigeDrift: {},
    rosterEdits: {},
    picks: [],

    offseasonStep: 'ready',
    draftClass: [],
    draftCursor: 1,
    scoutPoints: 0,
    freeAgents: [],
    faWave: 0,
    staffMarket: [],
    lastDepartures: [],
    lastDevelopment: [],
    lastDraft: [],
  };

  /* A CAP-LEGAL SQUAD ON DAY ONE. A franchise that opens ten million over the
   * cap has handed the player a problem he did not create as his first
   * decision, which is the worst possible first decision. */
  balanceToCap(fr);
  giveOwnPicks(fr, fr.year);
  giveOwnPicks(fr, fr.year + 1);

  if (o.mode === 'challenge') {
    fr.challenge = {
      seasonsHere: 0,
      expectation: 0,
      heat: 0,
      offers: [],
      jobs: [{ teamId: team.id, from: 1, to: null }],
      sacked: false,
    };
  }

  push(fr, 'staff', `${o.coachName} takes over the ${team.name}.`);
  beginSeason(fr);
  return fr;
}

/** Everybody starts holding their own four picks for the next two drafts. */
function giveOwnPicks(fr: Franchise, year: number): void {
  for (let round = 1; round <= DRAFT_ROUNDS; round++) {
    if (fr.picks.some((p) => p.year === year && p.round === round && p.fromId === fr.teamId)) continue;
    fr.picks.push({ year, round, fromId: fr.teamId, ownerId: fr.teamId });
  }
}

/** Trim the cheapest way out of a cap problem: the worst contracts go. */
function balanceToCap(fr: Franchise): void {
  let guard = 0;
  while (capUsed(fr.roster) > SALARY_CAP && guard++ < 20) {
    const cuttable = [...fr.roster]
      .filter((p) => canCut(fr, p))
      .sort((a, b) => (b.salary / Math.max(1, b.overall)) - (a.salary / Math.max(1, a.overall)));
    const worst = cuttable[0];
    if (!worst) break;
    release(fr, worst.id);
  }
}

/** Nobody may cut himself below a legal eleven. */
export function canCut(fr: Franchise, p: Player): boolean {
  const left = fr.roster.filter((x) => x.pos === p.pos && x.id !== p.id).length;
  return left >= MINIMUM_SHAPE[p.pos];
}

/* ------------------------------------------------------------------ a season */

export function beginSeason(fr: Franchise): void {
  const ranks = divisionRanks(lastRanks(fr), fr.prestigeDrift);
  fr.schedule = buildSchedule(fr.seed, fr.year, fr.teamId, ranks);
  fr.standings = standingsFor(fr.schedule);
  fr.playoffs = [];
  fr.seeds = null;
  fr.championId = null;
  fr.finish = null;
  fr.seasonStats = {};
  fr.gamesMissed = {};
  fr.offseasonStep = 'ready';
  fr.draftClass = [];
  fr.freeAgents = [];
  fr.staffMarket = [];
  fr.faWave = 0;
  healAll(fr);
  fillOutSquad(fr);
  fr.stage = 'regular';
  if (fr.challenge) beginChallengeSeason(fr);
}

/** Where everybody finished in their division last year, for the same-place games. */
function lastRanks(fr: Franchise): Record<string, number> {
  if (!Object.keys(fr.standings).length) return {};
  const out: Record<string, number> = {};
  for (const divisionId of TEAMS.map((t) => t.divisionId).filter((d, i, a) => a.indexOf(d) === i)) {
    divisionTable(fr.standings, fr.schedule, divisionId)
      .forEach((s, i) => { out[s.teamId] = i; });
  }
  return out;
}

/* ------------------------------------------------------------------- a week */

export function nextGame(fr: Franchise): Fixture | null {
  return fr.schedule.find((f) => f.featured && !f.played)
    ?? fr.playoffs.find((f) => f.featured && !f.played)
    ?? null;
}

export const weekOf = (fr: Franchise, week: number): Fixture[] =>
  [...fr.schedule, ...fr.playoffs].filter((f) => f.week === week);

/** Which week the franchise is standing in, played or not. */
export function currentWeek(fr: Franchise): number {
  const mine = nextGame(fr);
  if (mine) return mine.week;
  const unplayed = [...fr.schedule, ...fr.playoffs].filter((f) => !f.played);
  if (unplayed.length) return Math.min(...unplayed.map((f) => f.week));
  return REGULAR_SEASON_WEEKS;
}

export const myBye = (fr: Franchise): number | null => byeWeek(fr.schedule, fr.teamId);

export function quarterSecondsFor(fr: Franchise): number {
  const key: GameLengthKey = fr.gameLength ?? 'standard';
  return GAME_LENGTHS[key].quarterSeconds;
}

/** What you are about to play, ready for the game screen. */
export function configFor(fr: Franchise, f: Fixture): FootballConfig {
  const home = teamOr(f.homeId);
  const away = teamOr(f.awayId);
  const mine = f.homeId === fr.teamId ? 'home' : 'away';
  return {
    home: { team: home, roster: rosterOf(fr, f.homeId, fr.year) },
    away: { team: away, roster: rosterOf(fr, f.awayId, fr.year) },
    humanSide: mine,
    quarterSeconds: quarterSecondsFor(fr),
    difficulty: DIFFICULTIES[fr.difficulty],
    seed: fr.seed + f.week * 101 + fr.year * 7919,
    label: f.round ? playoffLabel(f) : `Week ${f.week}${f.rivalry ? ' — the rivalry' : ''}`,
    homeEdge: f.round === 'superbowl' ? 0
      : (f.homeId === fr.teamId ? homeEdgeFor(fr) : 2),
    /* THE WHOLE POINT OF THE REBUILD: you play offence and you coach defence. */
    offenseOnly: true,
    gamePlan: fr.gamePlan,
  };
}

function simFixture(fr: Franchise, f: Fixture): SimResult {
  return simulateGame(
    { id: f.homeId, roster: rosterOf(fr, f.homeId, fr.year), homeEdge: f.round === 'superbowl' ? 0 : 2 },
    { id: f.awayId, roster: rosterOf(fr, f.awayId, fr.year) },
    `${fr.seed}:${fr.year}:${f.id}`,
    quarterSecondsFor(fr),
  );
}

export function addLine(bag: Record<string, StatLine>, id: string, add: StatLine): void {
  const cur = bag[id] ?? emptyStatLine();
  for (const k of Object.keys(cur) as (keyof StatLine)[]) cur[k] += add[k];
  bag[id] = cur;
}

/** Fold a played game back into the franchise. */
export function recordPlayed(fr: Franchise, f: Fixture, game: FootballGame): void {
  f.homeScore = game.score.home;
  f.awayScore = game.score.away;
  f.played = true;

  const ids = new Set(fr.roster.map((p) => p.id));
  const snaps: Record<string, number> = {};
  let teamSnaps = 0;
  for (const [id, line] of game.stats) {
    if (!ids.has(id)) continue;
    addLine(fr.seasonStats, id, line);
    addLine(fr.careerStats, id, line);
    snaps[id] = line.snaps;
    teamSnaps = Math.max(teamSnaps, line.snaps);
  }
  afterOwnGame(fr, f, snaps, teamSnaps);
}

/** Simulate your own game rather than playing it. */
export function simulateOwn(fr: Franchise, f: Fixture): void {
  const r = simFixture(fr, f);
  f.homeScore = r.home;
  f.awayScore = r.away;
  f.played = true;
  const mine = f.homeId === fr.teamId ? 'home' : 'away';
  const snaps: Record<string, number> = {};
  let teamSnaps = 0;
  for (const { playerId, line } of r.lines[mine]) {
    addLine(fr.seasonStats, playerId, line);
    addLine(fr.careerStats, playerId, line);
    snaps[playerId] = line.snaps;
    teamSnaps = Math.max(teamSnaps, line.snaps);
  }
  afterOwnGame(fr, f, snaps, teamSnaps);
}

/**
 * EVERYTHING THAT FOLLOWS ONE OF YOUR GAMES, in one place: the recap, the
 * injuries, how the room feels about it, the rest of the league's week, and
 * then whether the season has moved on.
 */
function afterOwnGame(
  fr: Franchise, f: Fixture, snaps: Record<string, number>, teamSnaps: number,
): void {
  const mine = f.homeId === fr.teamId ? 'home' : 'away';
  const us = mine === 'home' ? f.homeScore : f.awayScore;
  const them = mine === 'home' ? f.awayScore : f.homeScore;

  f.story = recapOf(fr, f);
  push(fr, 'game', `${f.story.headline}: ${f.story.line}`, f.week);

  const rng = new Rng(`nfl:post:${fr.seed}:${fr.year}:${f.id}`);
  for (const hurt of rollInjuries(fr, snaps, Math.max(1, teamSnaps), rng)) {
    push(fr, 'injury',
      `${hurt.player.pos} ${hurt.player.first} ${hurt.player.last}: ${hurt.label}, `
      + `out ${hurt.weeks} week${hurt.weeks === 1 ? '' : 's'}.`, f.week);
  }
  updateMorale(fr, { won: us > them, tied: us === them, margin: us - them, snaps, teamSnaps });

  if (!f.round) simulateWeek(fr, f.week);
  refresh(fr);
  advance(fr);
}

/** Play out every other game in a week. */
export function simulateWeek(fr: Franchise, week: number): void {
  for (const f of fr.schedule) {
    if (f.week !== week || f.played) continue;
    if (f.featured) continue;
    const r = simFixture(fr, f);
    f.homeScore = r.home;
    f.awayScore = r.away;
    f.played = true;
  }
}

/** Everything up to and including the week before your next game. */
export function simulateToNext(fr: Franchise): void {
  const next = nextGame(fr);
  const upTo = next ? next.week : REGULAR_SEASON_WEEKS;
  for (let w = 1; w <= upTo; w++) {
    if (next && w === next.week) {
      // Everything else in your week is played, but not your own game.
      simulateWeek(fr, w);
      break;
    }
    simulateWeek(fr, w);
    tickInjuries(fr);
  }
  refresh(fr);
  advance(fr);
}

/** A week you are not in: your bye, or a playoff round you did not reach. */
export function skipWeek(fr: Franchise): void {
  const week = currentWeek(fr);
  simulateWeek(fr, week);
  tickInjuries(fr);
  refresh(fr);
  advance(fr);
}

export function refresh(fr: Franchise): void {
  fr.standings = standingsFor(fr.schedule);
}

/** Give up on the season and let it play itself out. */
export function simulateSeason(fr: Franchise): void {
  let guard = 0;
  while (fr.stage === 'regular' && guard++ < 40) {
    const f = nextGame(fr);
    if (f) simulateOwn(fr, f);
    else skipWeek(fr);
  }
  guard = 0;
  while (fr.stage === 'playoffs' && guard++ < 12) {
    const f = nextGame(fr);
    if (f) simulateOwn(fr, f);
    else simulatePlayoffRound(fr);
  }
}

/* ------------------------------------------------------------- the playoffs */

/** Where the season has got to, checked after every game. */
function advance(fr: Franchise): void {
  if (fr.stage === 'regular') {
    if (fr.schedule.every((f) => f.played)) enterPlayoffs(fr);
    return;
  }
  if (fr.stage === 'playoffs') {
    const round = currentRound(fr);
    if (!round) return;
    const games = fr.playoffs.filter((f) => f.round === round);
    if (games.every((f) => f.played)) openNextRound(fr, round);
  }
}

const currentRound = (fr: Franchise): typeof ROUND_ORDER[number] | null => {
  for (let i = ROUND_ORDER.length - 1; i >= 0; i--) {
    if (fr.playoffs.some((f) => f.round === ROUND_ORDER[i])) return ROUND_ORDER[i];
  }
  return null;
};

export function enterPlayoffs(fr: Franchise): void {
  const seeds = {} as Record<Conference, SeedEntry[]>;
  for (const conf of CONFERENCES) seeds[conf] = seedsFor(fr.standings, fr.schedule, conf);
  fr.seeds = seeds;
  fr.stage = 'playoffs';
  fr.playoffs = wildCardRound(seeds, fr.teamId);

  const mine = CONFERENCES.some((c) => seeds[c].some((s) => s.teamId === fr.teamId));
  push(fr, 'league', mine
    ? 'You are in the playoffs.'
    : 'The playoffs begin without you.', REGULAR_SEASON_WEEKS + 1);
  if (mine) fr.playoffApps += 1;

  /* THE TOP SEED SITS OUT THE FIRST WEEKEND, which is worth saying out loud
   * because it is the only week of the year a club has nothing to do. */
  advance(fr);
}

/** Play the round you are not in. */
export function simulatePlayoffRound(fr: Franchise): void {
  const round = currentRound(fr);
  if (!round) return;
  for (const f of fr.playoffs.filter((x) => x.round === round && !x.played)) {
    const r = simFixture(fr, f);
    f.homeScore = r.home;
    f.awayScore = r.away;
    f.played = true;
  }
  tickInjuries(fr);
  openNextRound(fr, round);
}

function openNextRound(fr: Franchise, round: typeof ROUND_ORDER[number]): void {
  if (!fr.seeds) return;
  if (round === 'superbowl') {
    const game = fr.playoffs.find((f) => f.round === 'superbowl');
    if (game && game.played) {
      fr.championId = game.homeScore >= game.awayScore ? game.homeId : game.awayId;
      finishSeason(fr);
    }
    return;
  }
  const next = nextRound(fr.seeds, fr.playoffs, round, fr.teamId);
  if (!next.length) return;
  fr.playoffs.push(...next);
  tickInjuries(fr);
}

/* ------------------------------------------------------------ end of season */

export function seasonRecord(fr: Franchise): { wins: number; losses: number; ties: number } {
  const s = fr.standings[fr.teamId];
  return { wins: s?.wins ?? 0, losses: s?.losses ?? 0, ties: s?.ties ?? 0 };
}

function finishSeason(fr: Franchise): void {
  const { wins, losses, ties } = seasonRecord(fr);
  const champion = fr.championId === fr.teamId;
  const madePlayoffs = !!fr.seeds
    && CONFERENCES.some((c) => fr.seeds![c].some((s) => s.teamId === fr.teamId));
  const team = teamOr(fr.teamId);

  const divWon = divisionTable(fr.standings, fr.schedule, team.divisionId)[0]?.teamId === fr.teamId;
  const confWon = fr.playoffs.some((f) =>
    f.round === 'conference' && f.played
    && (f.homeScore >= f.awayScore ? f.homeId : f.awayId) === fr.teamId);

  fr.finish = exitLabel(fr.playoffs, fr.teamId, champion);
  if (!madePlayoffs) fr.finish = 'Missed the playoffs';
  if (champion) {
    fr.championships += 1;
    fr.titleSeen = false;
  }
  if (confWon) fr.conferenceTitles += 1;
  if (divWon) fr.divisionTitles += 1;

  const s = fr.standings[fr.teamId];
  const record: SeasonRecord = {
    year: fr.year,
    teamId: fr.teamId,
    coachName: fr.coachName,
    wins, losses, ties,
    pointsFor: s?.pointsFor ?? 0,
    pointsAgainst: s?.pointsAgainst ?? 0,
    finish: fr.finish,
    madePlayoffs,
    divisionTitle: divWon,
    conferenceTitle: confWon,
    champion,
    mvp: mvpOf(fr),
  };
  fr.history.push(record);
  push(fr, champion ? 'milestone' : 'league',
    champion ? `${team.city} ${team.name} win the Super Bowl.`
      : `${wins}-${losses}${ties ? `-${ties}` : ''}. ${fr.finish}.`);

  /* THE LEAGUE MOVES TOO. Everybody who won lifts a little and everybody who
   * lost sinks a little, so a decade of a franchise leaves a league that has
   * changed shape rather than one frozen the way it was written. */
  for (const st of Object.values(fr.standings)) {
    const games = st.wins + st.losses + st.ties;
    if (!games) continue;
    const move = (winPct(st) - 0.5) * 5;
    /* DRIFT FADES. Without the decay it is a random walk with a wall at each
     * end, and twenty seasons of it puts nearly every club in the league hard
     * against one of them: a bimodal league of eight juggernauts and eight
     * hopeless cases, with the middle scraped out and the median quietly three
     * points higher than it started. Fading it toward zero gives what the sport
     * actually looks like — a club that has been good for five years is
     * genuinely better, and a club that was good ten years ago is not. */
    fr.prestigeDrift[st.teamId] = (fr.prestigeDrift[st.teamId] ?? 0) * 0.8 + move;
  }
  if (fr.championId) {
    fr.prestigeDrift[fr.championId] = (fr.prestigeDrift[fr.championId] ?? 0) + 2.5;
  }
  /* AND THE LEAGUE AS A WHOLE STAYS WHERE IT WAS.
   *
   * Drift is meant to say who is rising and who is falling, not to inflate the
   * league. Left uncentred it does inflate it — and it inflates it AGAINST YOU
   * specifically, because your club is the one roster that is stored rather
   * than redrawn: every game you lose is a game thirty-one other clubs won, so
   * a bad decade lifts everybody else's band and leaves yours where it was.
   * Measured, the top of the league ran away to a ninety-two while a coached
   * club sat at seventy-eight wondering what it had done wrong. */
  const ids = Object.keys(fr.prestigeDrift);
  if (ids.length) {
    const mean = ids.reduce((s, id) => s + fr.prestigeDrift[id], 0) / ids.length;
    for (const id of ids) {
      fr.prestigeDrift[id] = Math.round(clamp(fr.prestigeDrift[id] - mean, -5, 5) * 10) / 10;
    }
  }

  moveFanSupport(fr, wins, losses, champion, madePlayoffs);
  settleFinances(fr, roundsPlayed(fr.playoffs, fr.teamId), champion);
  if (fr.challenge) judgeChallengeSeason(fr, wins, losses, champion, madePlayoffs);

  fr.stage = 'offseason';
  fr.offseasonStep = 'review';
  beginOffseason(fr);
}

/** The best season anybody on the roster had, for the history page. */
function mvpOf(fr: Franchise): string | null {
  let best: { name: string; worth: number } | null = null;
  for (const p of fr.roster) {
    const s = fr.seasonStats[p.id];
    if (!s) continue;
    const worth = s.passYards * 0.4 + s.rushYards + s.recYards
      + (s.passTD + s.rushTD + s.recTD) * 40 + s.tackles * 5 + s.sacks * 30 + s.picks * 45;
    if (!best || worth > best.worth) best = { name: `${p.pos} ${p.first} ${p.last}`, worth };
  }
  return best && best.worth > 200 ? best.name : null;
}

/* ------------------------------------------------------------- the offseason */

export function beginOffseason(fr: Franchise): void {
  fr.year += 1;

  const { development, retirements } = ageAndDevelop(fr);
  fr.lastDevelopment = development;
  fr.lastDepartures = retirements;
  for (const r of retirements) {
    push(fr, 'milestone', `${r.pos} ${r.name} retires at ${r.age}.`);
  }

  const notes = ageStaff(fr.staff, new Rng(`nfl:staff:${fr.seed}:${fr.year}`));
  for (const n of notes) push(fr, 'staff', n);

  const expiring = tickContracts(fr);
  void expiring;

  fr.staffMarket = staffMarket(fr.seed, fr.year, 46 + teamOr(fr.teamId).prestige * 4);
  fr.scoutPoints = scoutBudget(fr.facilities.scouting);
  fr.draftClass = [];
  fr.draftCursor = 1;
  fr.freeAgents = [];
  fr.faWave = 0;
  fr.lastDraft = [];
  giveOwnPicks(fr, fr.year + 1);
  fr.offseasonStep = 'review';
}

/** The offseason moves one step at a time and each step opens the next. */
export function advanceOffseason(fr: Franchise): OffseasonStep {
  const i = OFFSEASON_STEPS.indexOf(fr.offseasonStep);
  /* LEAVING FREE AGENCY CLOSES IT. Any wave the coach did not work is run out
   * with whatever offers he left on the table, because a market that stays open
   * behind him is a market he can come back and re-roll. */
  if (fr.offseasonStep === 'freeagency') {
    let guard = 0;
    while (fr.faWave > 0 && fr.faWave <= FA_WAVES && guard++ < 6) resolveWave(fr);
  }
  const next = OFFSEASON_STEPS[Math.min(i + 1, OFFSEASON_STEPS.length - 1)];
  fr.offseasonStep = next;
  onEnterStep(fr, next);
  return next;
}

export function openStep(fr: Franchise, step: OffseasonStep): void {
  onEnterStep(fr, step);
}

function onEnterStep(fr: Franchise, step: OffseasonStep): void {
  if (step === 'freeagency' && !fr.freeAgents.length) {
    /* ANYBODY YOU DID NOT RE-SIGN IS ON THE MARKET, which is what makes the
     * contracts step a decision rather than a formality. */
    const gone = fr.roster.filter((p) => p.contractYears <= 0);
    for (const p of gone) release(fr, p.id);
    for (const p of gone) {
      push(fr, 'signing', `${p.pos} ${p.first} ${p.last}'s contract is up.`);
    }
    fr.freeAgents = generateFreeAgents(fr, gone);
    fr.faWave = 1;
  }
  if (step === 'draft' && !fr.draftClass.length) {
    fr.draftClass = generateClass(fr.seed, fr.year);
    fr.draftCursor = 1;
  }
}

/** Free agency is over when the third wave has closed. */
export const faDone = (fr: Franchise): boolean => fr.faWave > FA_WAVES;

/**
 * CLOSE THE OFFSEASON AND OPEN CAMP.
 *
 * Anything the coach left undone is finished for him: unsigned free agents go
 * elsewhere, unused picks are made by the board, and the squad is topped up to
 * a legal size. A franchise that refuses to start the season because you did
 * not click through a draft is a franchise that has stopped being a game.
 */
export function startNextSeason(fr: Franchise): void {
  const from = fr.offseasonStep;

  /* WHATEVER WAS NEVER OPENED IS OPENED NOW, so the club can work it. */
  onEnterStep(fr, 'freeagency');
  onEnterStep(fr, 'draft');

  /* AND THE FRONT OFFICE FINISHES THE JOB. Everything from the step the coach
   * was standing on is theirs; everything before it was his. */
  autoOffseason(fr, from);

  let guard = 0;
  while (fr.faWave > 0 && fr.faWave <= FA_WAVES && guard++ < 6) resolveWave(fr);

  const slots = draftSlots(fr, draftOrder(fr));
  guard = 0;
  while (fr.draftCursor <= slots.length && guard++ < 200) {
    runDraft(fr, slots);
    const slot = slots[fr.draftCursor - 1];
    if (!slot) break;
    if (slot.ownerId === fr.teamId) autoDraftPick(fr, slot);
  }

  balanceToCap(fr);
  fillOutSquad(fr);
  trimToLimit(fr);
  fr.offseasonStep = 'ready';
  beginSeason(fr);
}

/**
 * THE BOARD'S OWN PICK, for a coach who did not go into the room.
 *
 * The same judgement the other thirty-one rooms use — value, need and what the
 * position is worth — rather than "highest number on the screen", which took a
 * kicker with the first pick in the draft twice in ten seasons.
 */
function autoDraftPick(fr: Franchise, slot: { overall: number; round: number; fromId: string; ownerId: string }): void {
  const best = boardChoice(fr);
  if (!best) { fr.draftCursor += 1; return; }
  best.takenBy = fr.teamId;
  best.takenAt = slot.overall;
  fr.draftCursor += 1;
  fr.roster.push({ ...best.player, contractYears: 4 });
  fr.lastDraft.push({
    round: slot.round, pick: slot.overall,
    name: `${best.first} ${best.last}`, pos: best.pos, grade: best.grade,
  });
}

/**
 * NOBODY FORFEITS.
 *
 * Two jobs, in this order. First every position is brought up to the minimum
 * the ENGINE needs to line up — a squad with two linebackers cannot field a
 * defence, and what it does instead is play the same man twice. Only then is
 * the squad topped up toward a full roster.
 *
 * The men it signs are deliberately poor. They are what a club has to play with
 * when the offseason went badly, and they are the visible cost of it.
 */
export function fillOutSquad(fr: Franchise): void {
  const team = teamOr(fr.teamId);
  const par = clamp(parFor(team, fr.prestigeDrift[fr.teamId] ?? 0) - 14, 40, 60);
  let n = 0;
  const have = (pos: Position): number => fr.roster.filter((p) => p.pos === pos).length;
  const add = (pos: Position): void => {
    const p = makePlayer(`nfl:street:${fr.seed}:${fr.year}:${pos}:${n++}`, {
      pos, par, age: 24, years: 2,
    });
    p.salary = 0.9;
    p.contractYears = 1;
    fr.roster.push(p);
  };
  for (const pos of POSITIONS) {
    let guard = 0;
    while (have(pos) < MINIMUM_SHAPE[pos] && guard++ < 8) add(pos);
  }
  const want: Record<Position, number> = {
    QB: 2, RB: 3, WR: 5, TE: 2, OL: 6, DL: 5, LB: 4, CB: 4, S: 3, K: 1, P: 1,
  };
  let guard = 0;
  while (fr.roster.length < 32 && guard++ < 40) {
    const short = POSITIONS.filter((pos) => have(pos) < want[pos])
      .sort((a, b) => (want[b] - have(b)) - (want[a] - have(a)))[0];
    if (!short) break;
    add(short);
  }
}

/** A roster has a limit, and the worst contracts go when it is passed. */
export function trimToLimit(fr: Franchise): void {
  let guard = 0;
  while (fr.roster.length > ROSTER_LIMIT && guard++ < 30) {
    const worst = [...fr.roster]
      .filter((p) => canCut(fr, p))
      .sort((a, b) => a.overall - b.overall)[0];
    if (!worst) break;
    release(fr, worst.id);
  }
}

/* ---------------------------------------------------------------- the squad */

export function topPerformers(fr: Franchise): { player: Player; line: string }[] {
  const out: { player: Player; line: string; worth: number }[] = [];
  for (const p of fr.roster) {
    const s = fr.seasonStats[p.id];
    if (!s) continue;
    const bits: string[] = [];
    if (s.passAttempts > 0) bits.push(`${s.passYards} pass yds, ${s.passTD} TD`);
    if (s.carries > 0) bits.push(`${s.rushYards} rush yds, ${s.rushTD} TD`);
    if (s.catches > 0) bits.push(`${s.catches} for ${s.recYards}, ${s.recTD} TD`);
    if (s.tackles > 2) bits.push(`${s.tackles} tackles${s.sacks ? `, ${s.sacks} sacks` : ''}`);
    if (!bits.length) continue;
    const worth = s.passYards * 0.4 + s.rushYards + s.recYards
      + (s.passTD + s.rushTD + s.recTD) * 35 + s.tackles * 5 + s.sacks * 25 + s.picks * 40;
    out.push({ player: p, line: bits.join(' · '), worth });
  }
  return out.sort((a, b) => b.worth - a.worth).slice(0, 5)
    .map(({ player, line }) => ({ player, line }));
}

export {
  FACILITY_KEYS, capUsed, gameRoster, recordOf, sortStandings, divisionTable, REGULAR_SEASON_WEEKS,
};
