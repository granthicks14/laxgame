import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { buildRoster, POSITIONS, type Player, type Position } from '../data';
import { LEVELS, MINIMUM_SHAPE, shapeFor, type FootballLevel } from '../levels';
import { rosterFor, teamsAtLevel, worldTeam } from '../world';
import { DIFFICULTIES } from '../tuning';
import { emptyStatLine, type DifficultyKey, type FootballConfig } from '../types';
import type { FootballGame } from '../Game';
import { buildSchedule, sortStandings, standingsFor } from './schedule';
import {
  addLine, quarterSecondsFor, recapOf, rosterOf, scheduleYear, simFixture, simulateRest,
  simulateWeek,
} from './league';
import { pointsForSeason, updateReputation } from './coach';
import { ageSquad, departures, developSquad } from './develop';
import { generateClass, offerBudget, signingDay, visitBudget } from './recruit';
import { emptyCoach, FOOTBALL_CAREER_VERSION, type Fixture, type FootballCareer, type FootballCareerMode } from './types';

/* ---------------------------------------------------------------------------
 * A SEASON, AND THEN THE NEXT ONE
 * ---------------------------------------------------------------------------
 * The career engine. Every state a football career can be in and every way it
 * moves between them, in one place, so there is exactly one opinion about what
 * happens next:
 *
 *   PRESEASON   the squad, the schedule, the tree. Nothing has happened yet.
 *      v
 *   REGULAR     a week at a time. The coach plays his game or simulates it; the
 *               rest of the league plays around him either way.
 *      v
 *   POSTSEASON  a bracket, if he made it. If he did not, it happens without him
 *               and he watches — which is the point of missing it.
 *      v
 *   OFFSEASON   who left, who improved, who is being recruited, what the tree
 *               can afford.
 *      v
 *   PRESEASON again, with a different squad and a year on the clock.
 * ------------------------------------------------------------------------- */

export function createCareer(o: {
  mode: FootballCareerMode;
  teamId: string;
  coachName: string;
  difficulty: DifficultyKey;
  seed?: number;
}): FootballCareer {
  const team = worldTeam(o.teamId);
  if (!team) throw new Error(`no such club: ${o.teamId}`);
  const seed = o.seed ?? new Rng(`fb:new:${Date.now()}`).int(1, 0x7fff_ffff);

  const career: FootballCareer = {
    version: FOOTBALL_CAREER_VERSION,
    mode: o.mode,
    seed,
    year: 1,
    teamId: team.id,
    level: team.level,
    conferenceId: team.conferenceId,
    difficulty: o.difficulty,
    gameLength: null,
    roster: rosterFor(team, 1),
    season: {},
    careerStats: {},
    stage: 'preseason',
    schedule: [],
    standings: {},
    postseasonSeeds: null,
    postseason: [],
    championId: null,
    finish: null,
    titleSeen: true,
    coach: emptyCoach(o.coachName),
    championships: 0,
    history: [],
    alumni: [],
    standingDrift: {},
    recruits: [],
    market: [],
    lastDepartures: [],
    lastDevelopment: [],
    offersLeft: 0,
    visitsLeft: 0,
  };
  beginSeason(career);
  return career;
}

/** Lay out a season: fixtures, an empty table, and a clean set of stat lines. */
export function beginSeason(career: FootballCareer): void {
  career.schedule = buildSchedule(career.level, career.seed, career.year, career.teamId);
  career.standings = standingsFor(career.level, career.schedule);
  career.postseason = [];
  career.postseasonSeeds = null;
  career.championId = null;
  career.finish = null;
  career.season = {};
  career.stage = 'regular';
}

/* ------------------------------------------------------------------ the week */

/** The next fixture the coach himself is in, or null when the season is over. */
export function nextGame(career: FootballCareer): Fixture | null {
  return career.schedule.find((f) => f.featured && !f.played)
    ?? career.postseason.find((f) => f.featured && !f.played)
    ?? null;
}

/** Everything in this week, so a schedule screen can show the round. */
export function weekOf(career: FootballCareer, week: number): Fixture[] {
  return career.schedule.filter((f) => f.week === week);
}

export const currentWeek = (career: FootballCareer): number =>
  nextGame(career)?.week ?? (career.schedule[career.schedule.length - 1]?.week ?? 1);

/** What the coach is about to play, ready for the game screen. */
export function configFor(career: FootballCareer, f: Fixture): FootballConfig {
  const year = scheduleYear(career);
  const home = worldTeam(f.homeId);
  const away = worldTeam(f.awayId);
  if (!home || !away) throw new Error('a fixture names a club that does not exist');
  const mine = f.homeId === career.teamId ? 'home' : 'away';
  return {
    home: { team: home, roster: rosterOf(career, f.homeId, year) },
    away: { team: away, roster: rosterOf(career, f.awayId, year) },
    humanSide: mine,
    quarterSeconds: quarterSecondsFor(career),
    difficulty: DIFFICULTIES[career.difficulty],
    seed: career.seed + f.week * 101,
    label: f.postseason
      ? `${LEVELS[career.level].title} — ${f.postseason}`
      : `Week ${f.week}${f.rivalry ? ' — the rivalry' : ''}`,
  };
}

/** Fold a played game back into the career. */
export function recordPlayed(career: FootballCareer, f: Fixture, game: FootballGame): void {
  f.homeScore = game.score.home;
  f.awayScore = game.score.away;
  f.played = true;

  const ids = new Set(career.roster.map((p) => p.id));
  for (const [id, line] of game.stats) {
    if (!ids.has(id)) continue;
    addLine(career.season, id, line);
    addLine(career.careerStats, id, line);
  }
  f.story = recapOf(career, f);
  afterGame(career, f);
}

/** Simulate the coach's own game rather than playing it. */
export function simulateOwn(career: FootballCareer, f: Fixture): void {
  const r = simFixture(career, f, scheduleYear(career));
  f.homeScore = r.home;
  f.awayScore = r.away;
  f.played = true;
  const mine = f.homeId === career.teamId ? 'home' : 'away';
  for (const { playerId, line } of r.lines[mine]) {
    addLine(career.season, playerId, line);
    addLine(career.careerStats, playerId, line);
  }
  f.story = recapOf(career, f);
  afterGame(career, f);
}

/** The rest of the league plays the same week, and the table is rebuilt. */
function afterGame(career: FootballCareer, f: Fixture): void {
  if (!f.postseason) simulateWeek(career, f.week);
  refresh(career);
  if (!nextGame(career) && career.stage === 'regular') enterPostseason(career);
  else if (f.postseason) advancePostseason(career);
}

export function refresh(career: FootballCareer): void {
  career.standings = standingsFor(career.level, career.schedule);
}

/** Skip ahead: everything up to and including the coach's next game. */
export function simulateToNext(career: FootballCareer): void {
  const next = nextGame(career);
  if (!next) return;
  for (let w = 1; w < next.week; w++) simulateWeek(career, w);
  refresh(career);
}

/** Give up on the season and let it play itself out. */
export function simulateSeason(career: FootballCareer): void {
  simulateRest(career);
  refresh(career);
  if (career.stage === 'regular') enterPostseason(career);
  while (career.stage === 'postseason' && career.postseason.some((f) => !f.played)) {
    const pending = career.postseason.filter((f) => !f.played);
    for (const f of pending) {
      const r = simFixture(career, f, scheduleYear(career));
      f.homeScore = r.home;
      f.awayScore = r.away;
      f.played = true;
      if (f.featured) {
        const mine = f.homeId === career.teamId ? 'home' : 'away';
        for (const { playerId, line } of r.lines[mine]) {
          addLine(career.season, playerId, line);
          addLine(career.careerStats, playerId, line);
        }
      }
    }
    advancePostseason(career);
  }
}

/* ------------------------------------------------------------- the postseason */

const ROUND_NAMES: Record<number, 'quarter' | 'semi' | 'final'> = {
  8: 'quarter', 4: 'semi', 2: 'final',
};

export function enterPostseason(career: FootballCareer): void {
  const info = LEVELS[career.level];
  const table = sortStandings(career.standings);
  const seeds = table.slice(0, info.playoffTeams).map((s) => s.teamId);
  career.postseasonSeeds = seeds;
  career.stage = 'postseason';
  career.postseason = pairUp(career, seeds, 1);

  /* A COACH WHO DID NOT MAKE IT WATCHES. The bracket still happens — a league
   * where the postseason only exists when you are in it is a league that stops
   * being a world the moment you have a bad year. */
  if (!seeds.includes(career.teamId)) {
    while (career.postseason.some((f) => !f.played)) {
      for (const f of career.postseason.filter((x) => !x.played)) {
        const r = simFixture(career, f, scheduleYear(career));
        f.homeScore = r.home;
        f.awayScore = r.away;
        f.played = true;
      }
      advancePostseason(career);
    }
  }
}

function pairUp(career: FootballCareer, seeds: string[], round: number): Fixture[] {
  const name = ROUND_NAMES[seeds.length] ?? 'final';
  const out: Fixture[] = [];
  for (let i = 0; i < seeds.length / 2; i++) {
    const homeId = seeds[i];
    const awayId = seeds[seeds.length - 1 - i];
    out.push({
      id: `po:${round}:${i}`,
      week: 100 + round,
      homeId,
      awayId,
      played: false,
      homeScore: 0,
      awayScore: 0,
      featured: homeId === career.teamId || awayId === career.teamId,
      conference: false,
      rivalry: false,
      postseason: name,
    });
  }
  return out;
}

export function advancePostseason(career: FootballCareer): void {
  if (career.stage !== 'postseason') return;
  const pending = career.postseason.filter((f) => !f.played);
  if (pending.length) return;

  const lastRound = career.postseason.filter((f) =>
    f.week === Math.max(...career.postseason.map((x) => x.week)));
  const winners = lastRound.map((f) => (f.homeScore >= f.awayScore ? f.homeId : f.awayId));

  if (winners.length === 1) {
    career.championId = winners[0];
    finishSeason(career);
    return;
  }
  const round = lastRound[0].week - 100 + 1;
  career.postseason.push(...pairUp(career, winners, round));
}

/* ---------------------------------------------------------------- the season */

export function seasonRecord(career: FootballCareer): { wins: number; losses: number; ties: number } {
  const s = career.standings[career.teamId];
  return { wins: s?.wins ?? 0, losses: s?.losses ?? 0, ties: s?.ties ?? 0 };
}

function finishSeason(career: FootballCareer): void {
  const { wins, losses, ties } = seasonRecord(career);
  const champion = career.championId === career.teamId;
  const info = LEVELS[career.level];

  career.finish = champion
    ? info.title
    : career.postseasonSeeds?.includes(career.teamId)
      ? postseasonExit(career)
      : 'Missed the postseason';

  if (champion) {
    career.championships += 1;
    career.titleSeen = false;
  }

  const s = career.standings[career.teamId];
  career.history.push({
    year: career.year,
    teamId: career.teamId,
    level: career.level,
    wins, losses, ties,
    finish: career.finish,
    champion,
    pointsFor: s?.pointsFor ?? 0,
    pointsAgainst: s?.pointsAgainst ?? 0,
  });

  career.coach.careerWins += wins;
  career.coach.careerLosses += losses;
  career.coach.careerTies += ties;
  career.coach.points += pointsForSeason(career, wins, losses, champion);
  updateReputation(career.coach, wins, losses, champion);

  /* THE WORLD MOVES TOO. Everybody who won lifts a little and everybody who lost
   * sinks a little, so a decade of a career leaves a league that has changed
   * shape rather than one frozen the way it was written. */
  for (const st of Object.values(career.standings)) {
    const games = st.wins + st.losses + st.ties;
    if (games === 0) continue;
    const rate = (st.wins + st.ties * 0.5) / games;
    const move = (rate - 0.5) * 6;
    career.standingDrift[st.teamId] = clamp(
      (career.standingDrift[st.teamId] ?? 0) + move, -28, 28,
    );
  }

  career.stage = 'offseason';
  beginOffseason(career);
}

function postseasonExit(career: FootballCareer): string {
  const mine = career.postseason.filter((f) => f.featured && f.played);
  const last = mine[mine.length - 1];
  if (!last) return 'Made the postseason';
  const label = last.postseason === 'final' ? `Lost the ${LEVELS[career.level].title.toLowerCase()}`
    : last.postseason === 'semi' ? 'Lost in the semi-final'
      : 'Lost in the quarter-final';
  return label;
}

/* ------------------------------------------------------------- the offseason */

export function beginOffseason(career: FootballCareer): void {
  career.year += 1;

  const { leaving, alumni } = departures(career);
  const goneIds = new Set(leaving.map((p) => p.id));
  career.lastDepartures = leaving.map((p) => {
    const a = alumni.find((x) => x.id === p.id);
    return { name: `${p.first} ${p.last}`, pos: p.pos, reason: a?.reason ?? 'left' };
  });
  career.alumni.push(...alumni);
  career.roster = career.roster.filter((p) => !goneIds.has(p.id));

  ageSquad(career);
  career.lastDevelopment = developSquad(career);

  career.recruits = generateClass(career);
  career.offersLeft = offerBudget(career);
  career.visitsLeft = visitBudget(career);
  career.market = [];
}

/** True when there is nothing left for the coach to decide this offseason. */
export const offseasonDone = (career: FootballCareer): boolean =>
  career.recruits.every((r) => r.committedTo !== null);

/**
 * CLOSE THE OFFSEASON AND OPEN NEXT SEASON.
 *
 * Recruits arrive, the roster is topped up to a legal size if signing day left
 * it short — a squad that cannot field eleven men is not a squad — and the
 * schedule is redrawn.
 */
export function startNextSeason(career: FootballCareer): void {
  const { signed } = signingDay(career);
  career.roster.push(...signed);

  fillOutSquad(career);

  career.recruits = [];
  career.market = [];
  beginSeason(career);
}

/**
 * WALK-ONS, AND A FLOOR NOTHING IS ALLOWED TO GO UNDER.
 *
 * Two jobs, in this order, and the order is the point. First every position is
 * brought up to the minimum the ENGINE needs to line up — a squad with two
 * linebackers cannot field a defence, and what it does instead is play the same
 * man twice and read as a forty in run defence. Only then is the squad topped up
 * toward the level's roster size.
 *
 * Walk-ons are deliberately poor. They are what a programme has to play with
 * when recruiting went badly, and they are the visible cost of it.
 */
function fillOutSquad(career: FootballCareer): void {
  const info = LEVELS[career.level];
  const shape = shapeFor(career.level);
  const pool = buildRoster(`fb:walkon:${career.seed}:${career.year}`, {
    par: info.par - info.spread,
    spread: 6,
  });
  let n = 0;
  const add = (p: Player): void => {
    career.roster.push({ ...p, id: `${p.id}:w${career.year}:${n++}`, years: 1, age: 18 });
  };
  const have = (pos: Position): number => career.roster.filter((x) => x.pos === pos).length;

  // The floor, whatever it costs in squad size.
  for (const pos of POSITIONS) {
    let guard = 0;
    while (have(pos) < MINIMUM_SHAPE[pos] && guard++ < 8) {
      const body = pool.find((p) => p.pos === pos);
      if (!body) break;
      add(body);
    }
  }
  // Then toward a full squad, emptiest position first.
  const shortfall = (pos: Position): number => shape[pos] - have(pos);
  const rest = [...pool].sort((a, b) => shortfall(b.pos) - shortfall(a.pos));
  for (const p of rest) {
    if (career.roster.length >= info.rosterSize) break;
    if (have(p.pos) >= shape[p.pos]) continue;
    add(p);
  }
}

/* --------------------------------------------------------------- the squad */

/** Season leaders on the coach's own roster, for the hub. */
export function topPerformers(career: FootballCareer): { player: Player; line: string }[] {
  const out: { player: Player; line: string; worth: number }[] = [];
  for (const p of career.roster) {
    const s = career.season[p.id];
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

/** Every club at this level, for the standings screen. */
export const clubsHere = (level: FootballLevel) => teamsAtLevel(level);

export const blankLine = emptyStatLine;
