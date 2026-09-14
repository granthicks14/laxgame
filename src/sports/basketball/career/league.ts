import { clamp } from '../../../core/math';
import { Rng } from '../../../core/rng';
import { buildRoster, starters, teamRatings, type HoopsPlayer } from '../data';
import { LEVELS, rosterOptionsFor, teamPar } from '../levels';
import { bestSchemeFor, resolveScheme, type ResolvedScheme } from '../schemes';
import { simulateGame, type SimResult, type SimTeam } from '../sim';
import { teamsAtLevel, worldTeam, type HoopsWorldTeam } from '../world';
import { perksOf } from './coach';
import { modsFor } from './difficulty';
import type { HoopsCareer, HoopsFixture } from './types';

/* ---------------------------------------------------------------------------
 * THE LEAGUE AROUND YOU
 * ---------------------------------------------------------------------------
 * Two hundred and forty programmes, and the save stores exactly one roster: your
 * own. Every other squad in the world is DERIVED here, from the club, the
 * career's seed and the year — so it is identical every time it is asked for,
 * it changes from season to season the way a real roster does, and a twenty-year
 * career weighs a few dozen kilobytes instead of a few megabytes.
 *
 * What IS stored about rival programmes is the one thing that cannot be derived:
 * how far each has drifted from the standing it was written with. Win for a
 * decade and your club becomes a place players want to be; lose for a decade and
 * it does not. That drift is a single number per club, and only for the ones
 * that have actually moved.
 * ------------------------------------------------------------------------- */

/** A club's standing today: what it was written with, plus what it has become. */
export function standingOf(career: HoopsCareer, teamId: string): number {
  const base = worldTeam(teamId).standing;
  return clamp(base + (career.standingDrift[teamId] ?? 0), 1, 99);
}

/** The attribute pool a club's squad is drawn from this season. */
export function parOf(career: HoopsCareer, teamId: string): number {
  const team = worldTeam(teamId);
  return teamPar(team.level, standingOf(career, teamId));
}

/**
 * A club's squad.
 *
 * The coach's own is the one in the save, because he has built it. Everybody
 * else's is generated from the world — and re-generated every season, which is
 * how a rival programme graduates its seniors, signs its class and comes back
 * different without a single byte being stored about it.
 */
export function rosterFor(career: HoopsCareer, teamId: string): HoopsPlayer[] {
  if (teamId === career.teamId) return career.roster;
  const team = worldTeam(teamId);
  return buildRoster(
    `${teamId}:${career.seed}:${career.year}`,
    career.seed + career.year,
    rosterOptionsFor(team.level, parOf(career, teamId)),
  );
}

/** What a club runs. The coach picks his own; everybody else plays to its squad. */
export function schemeFor(career: HoopsCareer, teamId: string): ResolvedScheme {
  const roster = rosterFor(career, teamId);
  const par = parOf(career, teamId);
  if (teamId === career.teamId) {
    return resolveScheme(career.offense, career.defense, roster, par);
  }
  const best = bestSchemeFor(roster, par);
  return resolveScheme(best.offense, best.defense, roster, par);
}

/**
 * What a coach is worth on the floor, as a multiplier the engines read.
 *
 * The human's number comes from the tree he has actually bought. An AI
 * programme's comes from the staff it already has, which is written into the
 * world — a blue blood has better coaching than a team at the bottom, and that
 * is a fact about the world rather than a bonus for being the computer.
 */
export function coachingOf(career: HoopsCareer, teamId: string): number {
  if (teamId === career.teamId) return perksOf(career.coach).gameday;
  const t = worldTeam(teamId);
  return 0.94 + (t.coaching / 99) * 0.12;
}

export function simTeam(career: HoopsCareer, teamId: string): SimTeam {
  return {
    id: teamId,
    roster: rosterFor(career, teamId),
    scheme: schemeFor(career, teamId),
    coaching: coachingOf(career, teamId),
  };
}

/** Play a fixture with the fast engine and write the result into it. */
export function simulateFixture(career: HoopsCareer, f: HoopsFixture): SimResult {
  const info = LEVELS[career.level];
  const r = simulateGame(simTeam(career, f.homeId), simTeam(career, f.awayId), {
    seed: `${career.seed}:${career.year}:${f.id}`,
    quarterSeconds: info.quarterSeconds,
  });
  f.homeScore = r.home.score;
  f.awayScore = r.away.score;
  f.played = true;
  return r;
}

/* ----------------------------------------------------------------- ratings */

export interface ClubSnapshot {
  team: HoopsWorldTeam;
  standing: number;
  overall: number;
  offense: number;
  defense: number;
  depth: number;
  best: HoopsPlayer | null;
}

export function snapshot(career: HoopsCareer, teamId: string): ClubSnapshot {
  const roster = rosterFor(career, teamId);
  const r = teamRatings(roster);
  const best = [...roster].sort((a, b) => b.overall - a.overall)[0] ?? null;
  return {
    team: worldTeam(teamId),
    standing: standingOf(career, teamId),
    overall: r.overall,
    offense: r.offense,
    defense: r.defense,
    depth: r.depth,
    best,
  };
}

/** Every club at the coach's level, strongest squad first. */
export function powerRanking(career: HoopsCareer): ClubSnapshot[] {
  return teamsAtLevel(career.level)
    .map((t) => snapshot(career, t.id))
    .sort((a, b) => b.overall - a.overall);
}

/** Where the coach's own squad ranks among its peers, 1 being the best. */
export function squadRank(career: HoopsCareer): { rank: number; of: number } {
  const teams = teamsAtLevel(career.level);
  const mine = teamRatings(career.roster).overall;
  let better = 0;
  for (const t of teams) {
    if (t.id === career.teamId) continue;
    if (teamRatings(rosterFor(career, t.id)).overall > mine) better++;
  }
  return { rank: better + 1, of: teams.length };
}

/* ------------------------------------------------------------------- drift */

/**
 * What a season does to a programme's standing in the sport.
 *
 * Winning lifts a club, losing sinks it, and both are slow: a programme is what
 * it has been for a decade, not what it was last March. The drift is capped, so
 * no club can climb out of its own level or fall out of the bottom of it — the
 * pyramid is the pyramid.
 */
export function driftStanding(
  career: HoopsCareer, teamId: string, wins: number, losses: number, champion: boolean,
): void {
  const games = Math.max(1, wins + losses);
  const pct = wins / games;
  const base = worldTeam(teamId).standing;
  const move = (pct - 0.5) * 5 + (champion ? 4 : 0);
  const now = (career.standingDrift[teamId] ?? 0) + move;
  // Never more than fifteen points from where the club was written: a career can
  // change a programme, not relocate it to another division.
  const capped = clamp(now, -15, 15);
  const bounded = clamp(base + capped, 3, 97) - base;
  if (Math.abs(bounded) < 0.05) delete career.standingDrift[teamId];
  else career.standingDrift[teamId] = Math.round(bounded * 10) / 10;
}

/**
 * The whole level's programmes drift a little every season, from their own
 * simulated results, so the pecking order is alive rather than a fixture list.
 */
export function driftLeague(career: HoopsCareer): void {
  for (const [id, s] of Object.entries(career.standings)) {
    if (id === career.teamId) continue;
    driftStanding(career, id, s.wins, s.losses, career.championId === id);
  }
}

/* ------------------------------------------------------------ the first job */

/**
 * The squad a coach INHERITS.
 *
 * Deliberately worse than the programme deserves, by an amount the difficulty
 * decides. Taking a job is taking over somebody else's mess, and the first thing
 * a new coach should feel is how far there is to go — a career that starts with
 * a squad already good enough to win is a career with nothing in it.
 */
export function inheritedRoster(
  teamId: string, seed: number, hole: number, situationPenalty = 0,
): HoopsPlayer[] {
  const team = worldTeam(teamId);
  const par = teamPar(team.level, team.standing) - hole - situationPenalty;
  return buildRoster(`${teamId}:inherit:${seed}`, seed, rosterOptionsFor(team.level, par));
}

/**
 * How far a squad is from the standard of its own level, in rating points.
 * Negative means it is behind, which is what a rebuilding job looks like.
 */
export function squadGap(career: HoopsCareer): number {
  const info = LEVELS[career.level];
  const peers = teamsAtLevel(career.level)
    .filter((t) => t.id !== career.teamId)
    .map((t) => teamRatings(rosterFor(career, t.id)).overall);
  const mean = peers.reduce((a, b) => a + b, 0) / Math.max(1, peers.length);
  void info;
  return Math.round((teamRatings(career.roster).overall - mean) * 10) / 10;
}

/** The best player on the coach's squad, for a dashboard line. */
export function bestPlayer(roster: HoopsPlayer[]): HoopsPlayer | null {
  return [...roster].sort((a, b) => b.overall - a.overall)[0] ?? null;
}

/** The five who will start, in position order. */
export const startingFive = starters;

/** Slightly different every career: what the league expects of this club. */
export function expectedWinPct(career: HoopsCareer): number {
  const standing = standingOf(career, career.teamId);
  const mods = modsFor(career.tier);
  // A club's own place in the pecking order, plus what the tier's boards demand.
  const base = 0.34 + (standing / 99) * 0.3;
  return clamp(base + mods.expectation, 0.18, 0.82);
}

/** A stable per-career random stream, for anything that must not re-roll. */
export function careerRng(career: HoopsCareer, tag: string): Rng {
  return new Rng(`hoops:${career.seed}:${career.year}:${tag}`);
}
