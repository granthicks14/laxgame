import { Rng } from '../../../core/rng';
import {
  DIVISION_NAMES, GAMES_PER_TEAM, PLAYOFF_TEAMS_PER_CONFERENCE, REGULAR_SEASON_WEEKS,
  TEAMS, divisionsIn, nflTeam, rivalOf, teamOr, teamsInConference, teamsInDivision,
  type Conference,
} from '../nfl';
import type { Fixture, SeedEntry, Standing } from './types';

/* ---------------------------------------------------------------------------
 * SEVENTEEN GAMES
 * ---------------------------------------------------------------------------
 * The real shape, because the real shape is what makes a division race a
 * division race:
 *
 *   6   your own division, home and away. These are the games that decide it.
 *   4   one other division in your conference, rotating every year.
 *   4   one division in the other conference, rotating every year.
 *   2   the clubs that finished where you finished, in the two divisions you
 *       are not playing in full.
 *   1   and one more of those, from the other conference.
 *
 * Every one of those rotations is a SYMMETRIC pairing worked out from the year
 * alone, which is what makes the whole thing consistent: if you are playing
 * them, they are playing you, and nobody has to store a fixture list to find
 * out. A schedule that is not symmetric produces a league where one club has
 * played eighteen games and another fifteen, and a table that never settles.
 *
 * Eighteen weeks and seventeen games, so everybody gets a bye.
 * ------------------------------------------------------------------------- */

export function emptyStanding(teamId: string): Standing {
  return {
    teamId,
    wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0,
    divWins: 0, divLosses: 0,
    confWins: 0, confLosses: 0,
    streak: 0,
  };
}

const divIndex = (name: string): number => DIVISION_NAMES.indexOf(name as never);

/** The three ways to split four divisions into two pairs; the year picks one. */
const PAIRINGS: [number, number][][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

/** Which division in your own conference you play in full this year. */
function intraPartner(divIdx: number, year: number): number {
  const pairing = PAIRINGS[year % 3];
  for (const [a, b] of pairing) {
    if (a === divIdx) return b;
    if (b === divIdx) return a;
  }
  return (divIdx + 1) % 4;
}

/** ...and which division in the other one. */
const interPartner = (divIdx: number, year: number, conf: Conference): number =>
  (conf === 'AFC' ? (divIdx + year) % 4 : ((divIdx - year) % 4 + 4) % 4);

/** The 17th game: a club that finished where you did, in a third division. */
const seventeenth = (divIdx: number, year: number, conf: Conference): number =>
  (conf === 'AFC' ? (divIdx + year + 2) % 4 : ((divIdx - year + 2) % 4 + 4) % 4);

/**
 * WHERE EACH CLUB FINISHED IN ITS DIVISION LAST YEAR, which is what the
 * same-place fixtures are drawn from. Before a season has been played it is the
 * clubs' own standing, so a first season still has a shape.
 */
export function divisionRanks(
  lastRank: Record<string, number>, drift: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const divisionId of TEAMS.map((t) => t.divisionId).filter((d, i, a) => a.indexOf(d) === i)) {
    const teams = teamsInDivision(divisionId).slice().sort((a, b) => {
      const ra = lastRank[a.id];
      const rb = lastRank[b.id];
      if (ra !== undefined && rb !== undefined) return ra - rb;
      return (b.prestige + (drift[b.id] ?? 0) / 8) - (a.prestige + (drift[a.id] ?? 0) / 8)
        || a.id.localeCompare(b.id);
    });
    teams.forEach((t, i) => { out[t.id] = i; });
  }
  return out;
}

interface Pair { a: string; b: string; division: boolean; conference: boolean }

/** Every game the league plays this year, as an unordered set of pairings. */
export function seasonPairs(year: number, ranks: Record<string, number>): Pair[] {
  const pairs: Pair[] = [];
  const seen = new Set<string>();
  const key = (a: string, b: string, n: number): string =>
    `${[a, b].sort().join('|')}:${n}`;

  const add = (a: string, b: string, n = 0): void => {
    const k = key(a, b, n);
    if (seen.has(k)) return;
    seen.add(k);
    const ta = teamOr(a);
    const tb = teamOr(b);
    pairs.push({
      a, b,
      division: ta.divisionId === tb.divisionId,
      conference: ta.conference === tb.conference,
    });
  };

  for (const team of TEAMS) {
    const d = divIndex(team.division);
    const conf = team.conference;

    // Six: your own division, home and away.
    for (const other of teamsInDivision(team.divisionId)) {
      if (other.id === team.id) continue;
      add(team.id, other.id, 0);
      add(team.id, other.id, 1);
    }

    // Four: one division in your own conference.
    const intra = divisionsIn(conf)[intraPartner(d, year)];
    for (const other of teamsInDivision(intra)) add(team.id, other.id, 0);

    // Four: one division in the other.
    const otherConf: Conference = conf === 'AFC' ? 'NFC' : 'AFC';
    const inter = divisionsIn(otherConf)[interPartner(d, year, conf)];
    for (const other of teamsInDivision(inter)) add(team.id, other.id, 0);

    // Two: same place, the two divisions in your conference you are not playing.
    const myRank = ranks[team.id] ?? 0;
    for (const divisionId of divisionsIn(conf)) {
      if (divisionId === team.divisionId || divisionId === intra) continue;
      const match = teamsInDivision(divisionId).find((t) => (ranks[t.id] ?? 0) === myRank);
      if (match) add(team.id, match.id, 0);
    }

    // And one more of those, from the other conference.
    const far = divisionsIn(otherConf)[seventeenth(d, year, conf)];
    const match = teamsInDivision(far).find((t) => (ranks[t.id] ?? 0) === myRank);
    if (match) add(team.id, match.id, 0);
  }
  return pairs;
}

/**
 * EIGHTEEN WEEKS, and nobody plays twice in one.
 *
 * Seventeen games in eighteen weeks leaves exactly one bye each, which is tight
 * enough that a plain greedy pass gets stuck. So this is a repair loop: throw
 * every game at a week, then keep moving the ones that clash until none of them
 * do. It is deterministic from the seed, it converges in a few thousand moves,
 * and `npm run gridiron-league` fails if it ever does not.
 */
function assignWeeks(pairs: Pair[], rng: Rng): number[] {
  const weeks = REGULAR_SEASON_WEEKS;
  const cap = Math.ceil(pairs.length / weeks);
  const at = pairs.map(() => rng.int(0, weeks - 1));

  /* Incremental state: how full each week is, and how many games each club has
   * in it. Recomputing either from scratch inside the loop turns a fast solver
   * into a slow one for no benefit. */
  const load = new Array<number>(weeks).fill(0);
  const teamWeek = new Map<string, number>();
  const tw = (id: string, w: number): number => teamWeek.get(`${id}:${w}`) ?? 0;
  const bumpTeam = (id: string, w: number, n: number): void => {
    teamWeek.set(`${id}:${w}`, tw(id, w) + n);
  };
  const place = (i: number, w: number): void => {
    at[i] = w;
    load[w]++;
    bumpTeam(pairs[i].a, w, 1);
    bumpTeam(pairs[i].b, w, 1);
  };
  const lift = (i: number): void => {
    const w = at[i];
    load[w]--;
    bumpTeam(pairs[i].a, w, -1);
    bumpTeam(pairs[i].b, w, -1);
  };
  at.forEach((w, i) => { load[w]++; bumpTeam(pairs[i].a, w, 1); bumpTeam(pairs[i].b, w, 1); });

  const clashing = (i: number): boolean =>
    tw(pairs[i].a, at[i]) > 1 || tw(pairs[i].b, at[i]) > 1 || load[at[i]] > cap;

  /* MINIMUM CONFLICTS. Take a game that is in the wrong week, cost every week
   * it could be in, and move it to the cheapest one. A move that cannot be free
   * is still taken — it displaces somebody else, who is fixed on a later pass —
   * which is exactly what lets it get out of a corner instead of jamming. */
  const cost = (i: number, w: number): number => {
    const a = tw(pairs[i].a, w) - (at[i] === w ? 1 : 0);
    const b = tw(pairs[i].b, w) - (at[i] === w ? 1 : 0);
    const over = Math.max(0, load[w] - (at[i] === w ? 1 : 0) + 1 - cap);
    return (a > 0 ? 6 : 0) + (b > 0 ? 6 : 0) + over;
  };

  let bad = pairs.map((_, i) => i).filter(clashing);
  for (let step = 0; step < 60_000 && bad.length; step++) {
    const i = bad[rng.int(0, bad.length - 1)];
    let best = at[i];
    let bestCost = Infinity;
    const offset = rng.int(0, weeks - 1);
    for (let n = 0; n < weeks; n++) {
      const w = (offset + n) % weeks;
      const c = cost(i, w) + (w === at[i] ? 0.5 : 0);
      if (c < bestCost) { bestCost = c; best = w; }
    }
    if (best !== at[i]) {
      lift(i);
      place(i, best);
    }
    if (step % 64 === 0 || bestCost > 0) bad = pairs.map((_, k) => k).filter(clashing);
  }
  return at.map((w) => w + 1);
}

/**
 * Build a season.
 *
 * @param seed   the franchise's, so two saves see two different leagues
 * @param year   which rotation the league is on
 * @param myId   your club, which decides `featured`
 * @param ranks  where everybody finished last year
 */
export function buildSchedule(
  seed: number, year: number, myId: string, ranks: Record<string, number>,
): Fixture[] {
  const pairs = seasonPairs(year, ranks);
  const rng = new Rng(`nfl:sched:${seed}:${year}`);
  const weeks = assignWeeks(pairs, rng);

  /* WHO HOSTS.
   *
   * A running balance of home minus away, and every game goes to whichever of
   * the two is further behind on it. The ORDER MATTERS and the first version got
   * it wrong: the pairs come out of the loop above club by club, so walking them
   * in that order hands one club seventeen straight away games before anybody
   * else has played one. Shuffled, the same greedy lands everybody on eight or
   * nine — and the divisional pair splits itself, because the second meeting
   * sees a balance the first one moved. */
  const order = pairs.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const balance = new Map<string, number>();
  const bal = (id: string): number => balance.get(id) ?? 0;
  const homeOf = new Array<string>(pairs.length);
  for (const i of order) {
    const p = pairs[i];
    const takeA = bal(p.a) !== bal(p.b) ? bal(p.a) < bal(p.b) : (year + i) % 2 === 0;
    const homeId = takeA ? p.a : p.b;
    const awayId = takeA ? p.b : p.a;
    homeOf[i] = homeId;
    balance.set(homeId, bal(homeId) + 1);
    balance.set(awayId, bal(awayId) - 1);
  }

  const out: Fixture[] = [];
  pairs.forEach((p, i) => {
    const homeId = homeOf[i];
    const awayId = homeId === p.a ? p.b : p.a;

    const rival = rivalOf(homeId) === awayId || rivalOf(awayId) === homeId;
    out.push({
      id: `${year}:${i}:${homeId}:${awayId}`,
      week: weeks[i],
      homeId,
      awayId,
      played: false,
      homeScore: 0,
      awayScore: 0,
      featured: homeId === myId || awayId === myId,
      division: p.division,
      conference: p.conference,
      rivalry: rival && p.division,
    });
  });
  return out.sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
}

/** Which week a club has off. */
export function byeWeek(schedule: Fixture[], teamId: string): number | null {
  const played = new Set(schedule
    .filter((f) => f.homeId === teamId || f.awayId === teamId)
    .map((f) => f.week));
  for (let w = 1; w <= REGULAR_SEASON_WEEKS; w++) if (!played.has(w)) return w;
  return null;
}

/* ------------------------------------------------------------------- table */

export function standingsFor(schedule: Fixture[]): Record<string, Standing> {
  const table: Record<string, Standing> = {};
  for (const t of TEAMS) table[t.id] = emptyStanding(t.id);

  for (const f of [...schedule].sort((a, b) => a.week - b.week)) {
    if (!f.played) continue;
    const home = table[f.homeId];
    const away = table[f.awayId];
    if (!home || !away) continue;
    home.pointsFor += f.homeScore;
    home.pointsAgainst += f.awayScore;
    away.pointsFor += f.awayScore;
    away.pointsAgainst += f.homeScore;

    const bump = (w: Standing, l: Standing): void => {
      w.wins++;
      l.losses++;
      w.streak = w.streak >= 0 ? w.streak + 1 : 1;
      l.streak = l.streak <= 0 ? l.streak - 1 : -1;
      if (f.division) { w.divWins++; l.divLosses++; }
      if (f.conference) { w.confWins++; l.confLosses++; }
    };
    if (f.homeScore > f.awayScore) bump(home, away);
    else if (f.awayScore > f.homeScore) bump(away, home);
    else {
      home.ties++;
      away.ties++;
      home.streak = 0;
      away.streak = 0;
    }
  }
  return table;
}

export const winPct = (s: Standing): number => {
  const g = s.wins + s.losses + s.ties;
  return g === 0 ? 0 : (s.wins + s.ties * 0.5) / g;
};

const rate = (w: number, l: number): number => (w + l === 0 ? 0 : w / (w + l));

/** Head to head, which is the first thing that actually separates two clubs. */
function headToHead(schedule: Fixture[], a: string, b: string): number {
  let n = 0;
  for (const f of schedule) {
    if (!f.played) continue;
    const involves = (f.homeId === a && f.awayId === b) || (f.homeId === b && f.awayId === a);
    if (!involves) continue;
    const aScore = f.homeId === a ? f.homeScore : f.awayScore;
    const bScore = f.homeId === b ? f.homeScore : f.awayScore;
    n += Math.sign(aScore - bScore);
  }
  return n;
}

/**
 * THE ORDER OF A TABLE, with the sport's own tiebreakers in the sport's own
 * order: record, head to head, division record, conference record, and then
 * points. Two 11-6 clubs left in whatever order the array happened to be in is
 * two clubs whose season came down to an array.
 */
export function sortStandings(
  table: Standing[], schedule: Fixture[],
): Standing[] {
  return [...table].sort((a, b) =>
    winPct(b) - winPct(a)
    || headToHead(schedule, b.teamId, a.teamId)
    || rate(b.divWins, b.divLosses) - rate(a.divWins, a.divLosses)
    || rate(b.confWins, b.confLosses) - rate(a.confWins, a.confLosses)
    || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
    || b.pointsFor - a.pointsFor
    || a.teamId.localeCompare(b.teamId));
}

export const divisionTable = (
  table: Record<string, Standing>, schedule: Fixture[], divisionId: string,
): Standing[] => sortStandings(
  teamsInDivision(divisionId).map((t) => table[t.id]).filter(Boolean), schedule,
);

export const conferenceTable = (
  table: Record<string, Standing>, schedule: Fixture[], conference: Conference,
): Standing[] => sortStandings(
  teamsInConference(conference).map((t) => table[t.id]).filter(Boolean), schedule,
);

export const recordOf = (s: Standing | undefined): string =>
  (s ? `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}` : '0-0');

/* --------------------------------------------------------- the playoff picture */

/**
 * SEVEN FROM EACH CONFERENCE: four division winners, seeded by record, and then
 * the three best of everybody else. The top seed sits out the first weekend.
 *
 * This is computed from whatever has been played so far, so it is a live
 * playoff picture in October as well as a bracket in January — which is most of
 * what makes week eleven worth caring about.
 */
export function seedsFor(
  table: Record<string, Standing>, schedule: Fixture[], conference: Conference,
): SeedEntry[] {
  const winners: Standing[] = [];
  for (const divisionId of divisionsIn(conference)) {
    const top = divisionTable(table, schedule, divisionId)[0];
    if (top) winners.push(top);
  }
  const ordered = sortStandings(winners, schedule);
  const wildPool = conferenceTable(table, schedule, conference)
    .filter((s) => !ordered.some((w) => w.teamId === s.teamId));
  const wilds = wildPool.slice(0, PLAYOFF_TEAMS_PER_CONFERENCE - ordered.length);

  const out: SeedEntry[] = [];
  ordered.forEach((s, i) => {
    out.push({
      teamId: s.teamId,
      seed: i + 1,
      divisionId: nflTeam(s.teamId)?.divisionId ?? null,
      bye: i === 0,
    });
  });
  wilds.forEach((s, i) => {
    out.push({
      teamId: s.teamId,
      seed: ordered.length + i + 1,
      divisionId: null,
      bye: false,
    });
  });
  return out;
}

export const madeIt = (seeds: SeedEntry[] | undefined, teamId: string): SeedEntry | null =>
  seeds?.find((s) => s.teamId === teamId) ?? null;

/** True once every club has played its seventeen. */
export const seasonComplete = (schedule: Fixture[]): boolean =>
  schedule.every((f) => f.played);

export const gamesOf = (schedule: Fixture[], teamId: string): Fixture[] =>
  schedule.filter((f) => f.homeId === teamId || f.awayId === teamId);

export { GAMES_PER_TEAM, REGULAR_SEASON_WEEKS };
