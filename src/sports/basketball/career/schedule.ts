import { Rng } from '../../../core/rng';
import { LEVELS, type HoopsLevel } from '../levels';
import { teamsAtLevel, teamsInConference, type HoopsWorldTeam } from '../world';
import type { HoopsFixture, HoopsStanding } from './types';

/* ---------------------------------------------------------------------------
 * THE SCHEDULE
 * ---------------------------------------------------------------------------
 * A season of basketball for every programme at a level, built fresh each year
 * from the career's seed and the year, so no two seasons are the same fixture
 * list with different numbers on it.
 *
 * Two kinds of game, and the difference matters. CONFERENCE games are the round
 * robin that decides the table and seeds the conference tournament; every club
 * plays every other one in its conference, home and away where the schedule is
 * long enough. NON-CONFERENCE games are drawn from the rest of the level, and
 * they count toward your record and your reputation but not toward the table —
 * which is why scheduling is a real thing coaches argue about.
 *
 * And one fixture a year that the gym actually cares about: the RIVALRY, fixed
 * for the life of the world so it means something across a whole career.
 * ------------------------------------------------------------------------- */

/**
 * A club's permanent rival: the next one along in its own conference, wrapping
 * round. Fixed by the world rather than the save, so it is the same rivalry in
 * every career and it survives a coach moving on.
 */
export function rivalOf(team: HoopsWorldTeam): string | null {
  const peers = teamsInConference(team.level, team.conferenceId)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  if (peers.length < 2) return null;
  const i = peers.findIndex((t) => t.id === team.id);
  return peers[(i + 1) % peers.length].id;
}

/** Round-robin pairings for a group, using the circle method. */
function roundRobin(ids: string[]): { home: string; away: string }[][] {
  const list = [...ids];
  if (list.length % 2 === 1) list.push('');
  const rounds: { home: string; away: string }[][] = [];
  const n = list.length;
  const fixed = list[0];
  let rotating = list.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const pairs: { home: string; away: string }[] = [];
    const order = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      if (!a || !b) continue;
      // Alternate who is at home each round, so a season is not all one way.
      pairs.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    rounds.push(pairs);
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }
  return rounds;
}

export interface ScheduleOptions {
  level: HoopsLevel;
  seed: number;
  year: number;
  /** The coach's own club, so its fixtures can be marked. */
  teamId: string;
}

/**
 * Build the whole level's season.
 *
 * Every club at the level gets the same number of games, split between its own
 * conference and the rest of the world, and the order is shuffled each year so
 * that January never looks like last January.
 */
export function buildSeason(opts: ScheduleOptions): HoopsFixture[] {
  const info = LEVELS[opts.level];
  const rng = new Rng(`hoops:sched:${opts.level}:${opts.seed}:${opts.year}`);
  const all = teamsAtLevel(opts.level);
  const byId = new Map(all.map((t) => [t.id, t]));
  const fixtures: HoopsFixture[] = [];
  const counts = new Map<string, number>(all.map((t) => [t.id, 0]));
  let n = 0;

  const add = (
    home: string, away: string, conference: boolean, rivalry: boolean,
  ): void => {
    fixtures.push({
      id: `g${n++}`,
      round: 0,
      homeId: home,
      awayId: away,
      played: false,
      homeScore: 0,
      awayScore: 0,
      featured: home === opts.teamId || away === opts.teamId,
      conference,
      rivalry,
    });
    counts.set(home, (counts.get(home) ?? 0) + 1);
    counts.set(away, (counts.get(away) ?? 0) + 1);
  };

  /* --- conference play: a round robin, doubled if the season is long enough. */
  const conferences = new Set(all.map((t) => t.conferenceId));
  for (const conf of conferences) {
    const ids = teamsInConference(opts.level, conf).map((t) => t.id).sort();
    const single = roundRobin(ids);
    const singleGames = ids.length - 1;
    // How many times round: enough to fill the conference allowance.
    const passes = Math.max(1, Math.round(info.conferenceGames / Math.max(1, singleGames)));
    for (let pass = 0; pass < passes; pass++) {
      for (const round of single) {
        for (const pair of round) {
          // Flip the whole second pass, so everybody gets a home and an away.
          const home = pass % 2 === 0 ? pair.home : pair.away;
          const away = pass % 2 === 0 ? pair.away : pair.home;
          const rival = rivalOf(byId.get(home)!) === away
            || rivalOf(byId.get(away)!) === home;
          add(home, away, true, rival);
        }
      }
    }
  }

  /* --- non-conference: fill everybody up to the level's game count.
   *
   * Greedy pairing gets almost all the way there and then strands two or three
   * clubs a game short, because the last programmes still needing a game turn
   * out to share a conference and there is nobody left to play. So there is a
   * REPAIR PASS: take a fixture between two clubs from elsewhere, break it, and
   * hand each half to one of the stranded pair. Nobody's card changes length
   * except the two that were short, and every club ends on a full season. */
  const target = info.games;
  const sameConf = (x: string, y: string): boolean =>
    byId.get(x)!.conferenceId === byId.get(y)!.conferenceId;
  const shortOf = (): HoopsWorldTeam[] => all
    .filter((t) => (counts.get(t.id) ?? 0) < target)
    .sort((x, y) => (counts.get(x.id) ?? 0) - (counts.get(y.id) ?? 0));

  for (let guard = 0; guard < 6000; guard++) {
    const needy = shortOf();
    if (needy.length < 2) break;
    const a = needy[0];
    const pool = needy.slice(1).filter((t) => !sameConf(t.id, a.id));
    if (!pool.length) break;
    // Prefer an opponent of a similar standard: a season of nothing but blowouts
    // in either direction tells a coach nothing.
    const sorted = pool.sort((x, y) =>
      Math.abs(x.standing - a.standing) - Math.abs(y.standing - a.standing));
    const near = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.45)));
    const b = near[rng.int(0, near.length - 1)];
    const aHome = (counts.get(a.id) ?? 0) % 2 === 0;
    add(aHome ? a.id : b.id, aHome ? b.id : a.id, false, false);
  }

  // The repair pass, for whoever greed stranded.
  for (let guard = 0; guard < 200; guard++) {
    const needy = shortOf();
    if (needy.length < 2) break;
    const [a, b] = needy;
    const donor = fixtures.findIndex((f) => !f.conference
      && !sameConf(f.homeId, a.id) && !sameConf(f.awayId, a.id)
      && !sameConf(f.homeId, b.id) && !sameConf(f.awayId, b.id));
    if (donor < 0) break;
    const { homeId: x, awayId: y } = fixtures[donor];
    fixtures.splice(donor, 1);
    counts.set(x, (counts.get(x) ?? 0) - 1);
    counts.set(y, (counts.get(y) ?? 0) - 1);
    add(a.id, x, false, false);
    add(y, b.id, false, false);
  }

  /* --- the order of the season. Shuffled, then numbered. */
  const shuffled = rng.shuffle(fixtures);
  // Rivalry games land late, where they belong.
  shuffled.sort((a, b) => (a.rivalry ? 1 : 0) - (b.rivalry ? 1 : 0));
  const rounds = Math.max(1, target);
  shuffled.forEach((f, i) => {
    f.id = `g${i}`;
    f.round = Math.floor((i / shuffled.length) * rounds) + 1;
  });
  return shuffled;
}

/* ------------------------------------------------------------- the standings */

export const emptyStanding = (teamId: string): HoopsStanding => ({
  teamId,
  wins: 0, losses: 0, confWins: 0, confLosses: 0,
  pointsFor: 0, pointsAgainst: 0,
  homeWins: 0, homeLosses: 0, awayWins: 0, awayLosses: 0,
  streak: 0,
});

export function blankStandings(level: HoopsLevel): Record<string, HoopsStanding> {
  const out: Record<string, HoopsStanding> = {};
  for (const t of teamsAtLevel(level)) out[t.id] = emptyStanding(t.id);
  return out;
}

/** Fold one result into the table. */
export function recordResult(
  standings: Record<string, HoopsStanding>, f: HoopsFixture,
): void {
  const home = standings[f.homeId] ?? (standings[f.homeId] = emptyStanding(f.homeId));
  const away = standings[f.awayId] ?? (standings[f.awayId] = emptyStanding(f.awayId));
  const homeWon = f.homeScore > f.awayScore;

  home.pointsFor += f.homeScore;
  home.pointsAgainst += f.awayScore;
  away.pointsFor += f.awayScore;
  away.pointsAgainst += f.homeScore;

  if (homeWon) {
    home.wins++; home.homeWins++; away.losses++; away.awayLosses++;
    home.streak = home.streak >= 0 ? home.streak + 1 : 1;
    away.streak = away.streak <= 0 ? away.streak - 1 : -1;
    if (f.conference) { home.confWins++; away.confLosses++; }
  } else {
    away.wins++; away.awayWins++; home.losses++; home.homeLosses++;
    away.streak = away.streak >= 0 ? away.streak + 1 : 1;
    home.streak = home.streak <= 0 ? home.streak - 1 : -1;
    if (f.conference) { away.confWins++; home.confLosses++; }
  }
}

export interface TableRow extends HoopsStanding {
  team: HoopsWorldTeam;
  /** Games behind the leader, in the table this row is part of. */
  behind: number;
  pointDiff: number;
}

const winPct = (s: HoopsStanding): number =>
  (s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : 0);

const confPct = (s: HoopsStanding): number =>
  (s.confWins + s.confLosses > 0 ? s.confWins / (s.confWins + s.confLosses) : 0);

/**
 * The table.
 *
 * Ordered by conference record first where a conference is what is being shown —
 * that is what seeds a conference tournament — and by overall record where the
 * whole level is. Point difference breaks a tie, then the club's own standing,
 * so a table is never in an arbitrary order.
 */
function buildTable(
  rows: HoopsStanding[], teams: Map<string, HoopsWorldTeam>, byConference: boolean,
): TableRow[] {
  const pct = byConference ? confPct : winPct;
  const sorted = [...rows]
    .filter((r) => teams.has(r.teamId))
    .sort((a, b) => pct(b) - pct(a)
      || winPct(b) - winPct(a)
      || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
      || teams.get(b.teamId)!.standing - teams.get(a.teamId)!.standing);
  const leader = sorted[0];
  return sorted.map((r) => ({
    ...r,
    team: teams.get(r.teamId)!,
    pointDiff: r.pointsFor - r.pointsAgainst,
    behind: leader
      ? ((leader.wins - r.wins) + (r.losses - leader.losses)) / 2
      : 0,
  }));
}

export function levelTable(
  standings: Record<string, HoopsStanding>, level: HoopsLevel,
): TableRow[] {
  const teams = new Map(teamsAtLevel(level).map((t) => [t.id, t]));
  return buildTable(Object.values(standings), teams, false);
}

export function conferenceTable(
  standings: Record<string, HoopsStanding>, level: HoopsLevel, conferenceId: string,
): TableRow[] {
  const teams = new Map(teamsInConference(level, conferenceId).map((t) => [t.id, t]));
  return buildTable(Object.values(standings), teams, true);
}

/** The coach's own row, wherever it is. */
export function rowFor(
  standings: Record<string, HoopsStanding>, teamId: string,
): HoopsStanding {
  return standings[teamId] ?? emptyStanding(teamId);
}

export const recordText = (s: HoopsStanding): string => `${s.wins}-${s.losses}`;

export function streakText(s: HoopsStanding): string {
  if (!s.streak) return '—';
  return `${Math.abs(s.streak)} ${s.streak > 0 ? 'W' : 'L'}`;
}
