import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { simulateGame, type SimResult } from '../sim';
import { rosterFor, worldTeam, type WorldTeam } from '../world';
import { GAME_LENGTHS, type GameLengthKey } from '../tuning';
import { LEVELS } from '../levels';
import { emptyStatLine, type StatLine } from '../types';
import { perksOf } from './coach';
import type { FootballCareer, Fixture } from './types';
import type { Player } from '../data';

/* ---------------------------------------------------------------------------
 * THE REST OF THE LEAGUE
 * ---------------------------------------------------------------------------
 * Six other games are played every week that the coach is not at, and this is
 * where they happen.
 *
 * ROSTERS ARE DERIVED, NEVER STORED. Every club except the coach's own is built
 * from its id and the year on demand, so the schedule screen, a simulated result
 * and a game actually played against that club all see the same twenty-two men,
 * and none of it costs a byte of save file. The coach's OWN roster is the one
 * thing that is stored, because it is the only one he changes.
 *
 * WHICH YEAR TO BUILD THEM FOR is the subtlety, and it is a bug the basketball
 * career had first: a career's `year` advances during the offseason while the
 * schedule still belongs to the season just finished. Anything replaying an old
 * fixture has to ask for the roster of the year that fixture was PLAYED in, or
 * a statistics screen quietly rewrites last season with next season's players.
 * ------------------------------------------------------------------------- */

/** The season a schedule belongs to, which is not always `career.year`. */
export const scheduleYear = (career: FootballCareer): number =>
  (career.stage === 'offseason' || career.stage === 'complete' ? career.year - 1 : career.year);

export function quarterSecondsFor(career: FootballCareer): number {
  const key: GameLengthKey = career.gameLength ?? 'standard';
  return GAME_LENGTHS[key].quarterSeconds;
}

/**
 * THE COACH'S OWN SQUAD, WITH HIS COACHING IN IT.
 *
 * A COPY, always. The perks are a coaching bonus applied for one game, and
 * applying them to the stored roster would compound them every time anybody
 * looked at a team sheet — twenty seasons of that turns a high school into an
 * all-star team by arithmetic rather than by recruiting.
 */
export function coachedRoster(career: FootballCareer): Player[] {
  const perks = perksOf(career.coach);
  return career.roster.map((p) => {
    const a = { ...p.attrs };
    if (p.pos === 'QB') {
      a.throwAccuracy = clamp(a.throwAccuracy + perks.passing, 20, 99);
      a.decision = clamp(a.decision + perks.passing, 20, 99);
    }
    if (p.pos === 'WR' || p.pos === 'TE' || p.pos === 'RB') {
      a.routeRunning = clamp(a.routeRunning + perks.skill, 20, 99);
      a.ballSecurity = clamp(a.ballSecurity + perks.skill, 20, 99);
    }
    if (p.pos === 'OL') a.blocking = clamp(a.blocking + perks.protection * 22, 20, 99);
    if (p.pos === 'DL') {
      a.passRush = clamp(a.passRush + perks.front, 20, 99);
      a.tackling = clamp(a.tackling + perks.front, 20, 99);
    }
    if (p.pos === 'LB') a.tackling = clamp(a.tackling + perks.front, 20, 99);
    if (p.pos === 'CB' || p.pos === 'S') {
      a.coverage = clamp(a.coverage + perks.coverage, 20, 99);
      a.awareness = clamp(a.awareness + perks.coverage, 20, 99);
    }
    return { ...p, attrs: a };
  });
}

/** Any club's roster for a season, the coach's own included. */
export function rosterOf(career: FootballCareer, teamId: string, year: number): Player[] {
  if (teamId === career.teamId) return coachedRoster(career);
  const team = worldTeam(teamId);
  if (!team) return [];
  return rosterFor(team, year + drift(career, teamId));
}

/**
 * A PROGRAMME THAT HAS BEEN WINNING GETS BETTER PLAYERS, and this is how that is
 * said without storing eighty rosters: the drift moves which YEAR of the club's
 * derived squad is used, which shuffles it, and the standing drift moves the
 * band it is drawn from. Small, cumulative, and free.
 */
const drift = (career: FootballCareer, teamId: string): number =>
  Math.round((career.standingDrift[teamId] ?? 0) / 20);

export function simFixture(career: FootballCareer, f: Fixture, year: number): SimResult {
  return simulateGame(
    { id: f.homeId, roster: rosterOf(career, f.homeId, year) },
    { id: f.awayId, roster: rosterOf(career, f.awayId, year) },
    `${career.seed}:${year}:${f.id}`,
    quarterSecondsFor(career),
  );
}

/** Play out every unplayed fixture in a week that the coach is not in. */
export function simulateWeek(career: FootballCareer, week: number): void {
  const year = scheduleYear(career);
  for (const f of career.schedule) {
    if (f.week !== week || f.played || f.featured) continue;
    const r = simFixture(career, f, year);
    f.homeScore = r.home;
    f.awayScore = r.away;
    f.played = true;
  }
}

/** Everything left, for a coach who wants the season over with. */
export function simulateRest(career: FootballCareer): void {
  const year = scheduleYear(career);
  for (const f of career.schedule) {
    if (f.played) continue;
    const r = simFixture(career, f, year);
    f.homeScore = r.home;
    f.awayScore = r.away;
    f.played = true;
    if (f.featured) recordFeatured(career, f, r);
  }
}

/**
 * A SIMULATED GAME OF THE COACH'S OWN still has to leave a box score behind,
 * or a coach who simulates half his season has half a statistics page and half
 * his players have no numbers next to them for the year.
 */
export function recordFeatured(career: FootballCareer, f: Fixture, r: SimResult): void {
  const mine = f.homeId === career.teamId ? 'home' : 'away';
  for (const { playerId, line } of r.lines[mine]) {
    addLine(career.season, playerId, line);
    addLine(career.careerStats, playerId, line);
  }
  f.story = recapOf(career, f);
}

export function addLine(
  bag: Record<string, StatLine>, id: string, add: StatLine,
): void {
  const cur = bag[id] ?? emptyStatLine();
  for (const k of Object.keys(cur) as (keyof StatLine)[]) cur[k] += add[k];
  bag[id] = cur;
}

/** One sentence about a finished game of the coach's own. */
export function recapOf(career: FootballCareer, f: Fixture): { headline: string; line: string } {
  const mine = f.homeId === career.teamId ? 'home' : 'away';
  const us = mine === 'home' ? f.homeScore : f.awayScore;
  const them = mine === 'home' ? f.awayScore : f.homeScore;
  const other = worldTeam(mine === 'home' ? f.awayId : f.homeId);
  const name = other ? other.name : 'the opposition';
  const margin = us - them;

  if (margin > 0) {
    if (margin >= 21) {
      return { headline: 'Never in doubt', line: `${us}-${them} over ${name}, and it was over by the half.` };
    }
    if (margin <= 3) {
      return { headline: 'By a field goal', line: `${us}-${them}. One score in it at the end against ${name}.` };
    }
    return { headline: 'A win', line: `${us}-${them} against ${name}.` };
  }
  if (margin === 0) return { headline: 'Tied', line: `${us}-${them} with ${name}, and nobody could separate them.` };
  if (margin >= -3) {
    return { headline: 'One score short', line: `${them}-${us} to ${name}. A play either way.` };
  }
  if (margin <= -21) {
    return { headline: 'Taken apart', line: `${them}-${us} to ${name}. Nothing worked.` };
  }
  return { headline: 'Beaten', line: `${them}-${us} to ${name}.` };
}

/** Who this club is, for a header. */
export function clubOf(career: FootballCareer): WorldTeam | null {
  return worldTeam(career.teamId);
}

/** The level's own default game length, used when the coach has not chosen. */
export function defaultLengthFor(career: FootballCareer): GameLengthKey {
  return LEVELS[career.level].games >= 12 ? 'standard' : 'short';
}

/** A deterministic stream for a career's own decisions. */
export const careerRng = (career: FootballCareer, what: string): Rng =>
  new Rng(`fb:${career.seed}:${career.year}:${what}`);
