import { Rng } from '../../../core/rng';
import { LEVELS, type FootballLevel } from '../levels';
import { teamsAtLevel, type WorldTeam } from '../world';
import type { Fixture, Standing } from './types';

/* ---------------------------------------------------------------------------
 * A SEASON'S FIXTURES
 * ---------------------------------------------------------------------------
 * Football plays ten or twelve games, not eighty, and every one of them matters
 * more than any single game in the other two sports. That shapes the schedule:
 * a round robin is usually too long for the level, so a season is a SELECTION —
 * everybody in your own conference, and then as many out of it as the level's
 * game count allows.
 *
 * THE RIVALRY is picked once, deterministically, and it is the club nearest you
 * in the table. That is the fixture the town cares about, and it is the same
 * fixture every year, which is what makes it a rivalry rather than a label.
 * ------------------------------------------------------------------------- */

export function emptyStanding(teamId: string): Standing {
  return {
    teamId,
    wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0,
    confWins: 0, confLosses: 0,
  };
}

/** Who this club's rivalry is against: the nearest programme in its conference. */
export function rivalOf(team: WorldTeam): string | null {
  const pool = teamsAtLevel(team.level)
    .filter((t) => t.conferenceId === team.conferenceId && t.id !== team.id)
    .sort((a, b) => Math.abs(a.standing - team.standing) - Math.abs(b.standing - team.standing));
  return pool[0]?.id ?? null;
}

/**
 * Build a season.
 *
 * @param level  which tier is playing
 * @param seed   the career's seed, so a schedule is the same on every device
 * @param year   so year two is not year one again
 * @param myId   the coach's own club, which decides `featured`
 */
export function buildSchedule(
  level: FootballLevel, seed: number, year: number, myId: string,
): Fixture[] {
  const info = LEVELS[level];
  const teams = teamsAtLevel(level);
  const rng = new Rng(`fb:sched:${seed}:${year}:${level}`);
  const byId = new Map(teams.map((t) => [t.id, t]));

  /* EVERY PAIR OF CLUBS, ONCE, and then as many of them as the season has room
   * for. Conference games are kept first, because a conference game decides who
   * plays in January and a cross-conference one decides nothing. */
  const pairs: { a: string; b: string; conf: boolean }[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push({
        a: teams[i].id,
        b: teams[j].id,
        conf: teams[i].conferenceId === teams[j].conferenceId,
      });
    }
  }

  // How many games each club still owes.
  const owed = new Map(teams.map((t) => [t.id, info.games]));
  const rivalries = new Map(teams.map((t) => [t.id, rivalOf(t)]));

  const chosen: { a: string; b: string; conf: boolean; rivalry: boolean }[] = [];
  const take = (p: { a: string; b: string; conf: boolean }): void => {
    chosen.push({
      ...p,
      rivalry: rivalries.get(p.a) === p.b || rivalries.get(p.b) === p.a,
    });
    owed.set(p.a, (owed.get(p.a) ?? 0) - 1);
    owed.set(p.b, (owed.get(p.b) ?? 0) - 1);
  };

  // The rivalry is played whatever else happens.
  for (const p of pairs) {
    if (rivalries.get(p.a) === p.b || rivalries.get(p.b) === p.a) take(p);
  }
  // Then conference games, then the rest, until everybody's card is full.
  for (const conf of [true, false]) {
    const rest = pairs
      .filter((p) => p.conf === conf && !chosen.some((c) => c.a === p.a && c.b === p.b))
      .sort(() => rng.next() - 0.5);
    for (const p of rest) {
      if ((owed.get(p.a) ?? 0) <= 0 || (owed.get(p.b) ?? 0) <= 0) continue;
      take(p);
    }
  }

  /* AND THEN ROUND AGAIN, until nobody is short.
   *
   * Twelve clubs can only play each other once for eleven games, so a level that
   * wants twelve leaves everybody one short — and a table where every club has
   * played eleven of its twelve is a table that never finishes, a postseason
   * that seeds off an incomplete record, and a harness that says so. Conference
   * opponents are met twice before anybody else is. */
  let guard = 0;
  while ([...owed.values()].some((n) => n > 0) && guard++ < 6) {
    const again = pairs.filter((p) => (owed.get(p.a) ?? 0) > 0 && (owed.get(p.b) ?? 0) > 0)
      .sort((a, b) => Number(b.conf) - Number(a.conf) || rng.next() - 0.5);
    if (!again.length) break;
    for (const p of again) {
      if ((owed.get(p.a) ?? 0) <= 0 || (owed.get(p.b) ?? 0) <= 0) continue;
      take(p);
    }
  }

  /* SPREAD THEM OVER WEEKS, and never give a club two games in one. A fixture
   * list where somebody plays twice on the same Friday is a fixture list a
   * schedule screen cannot draw. */
  const weeks: typeof chosen[] = [];
  for (const game of chosen.sort(() => rng.next() - 0.5)) {
    let placed = false;
    for (let w = 0; w < weeks.length; w++) {
      const busy = weeks[w].some((g) => g.a === game.a || g.b === game.a
        || g.a === game.b || g.b === game.b);
      if (busy) continue;
      weeks[w].push(game);
      placed = true;
      break;
    }
    if (!placed) weeks.push([game]);
  }

  const out: Fixture[] = [];
  weeks.forEach((week, w) => {
    week.forEach((g, i) => {
      /* HOME AND AWAY ALTERNATE BY YEAR, so a rivalry is at your place every
       * other season rather than always at theirs. */
      const flip = (year + g.a.length) % 2 === 0;
      const homeId = flip ? g.a : g.b;
      const awayId = flip ? g.b : g.a;
      out.push({
        id: `${w}:${i}:${homeId}:${awayId}`,
        week: w + 1,
        homeId,
        awayId,
        played: false,
        homeScore: 0,
        awayScore: 0,
        featured: homeId === myId || awayId === myId,
        conference: g.conf,
        rivalry: g.rivalry,
      });
    });
  });

  void byId;
  return out.sort((a, b) => a.week - b.week);
}

/** How a club is doing, for the table. */
export function standingsFor(
  level: FootballLevel, schedule: Fixture[],
): Record<string, Standing> {
  const table: Record<string, Standing> = {};
  for (const t of teamsAtLevel(level)) table[t.id] = emptyStanding(t.id);

  for (const f of schedule) {
    if (!f.played) continue;
    const home = table[f.homeId];
    const away = table[f.awayId];
    if (!home || !away) continue;
    home.pointsFor += f.homeScore;
    home.pointsAgainst += f.awayScore;
    away.pointsFor += f.awayScore;
    away.pointsAgainst += f.homeScore;
    if (f.homeScore > f.awayScore) {
      home.wins++;
      away.losses++;
      if (f.conference) { home.confWins++; away.confLosses++; }
    } else if (f.awayScore > f.homeScore) {
      away.wins++;
      home.losses++;
      if (f.conference) { away.confWins++; home.confLosses++; }
    } else {
      home.ties++;
      away.ties++;
    }
  }
  return table;
}

/**
 * THE ORDER OF THE TABLE, and the tiebreakers are the sport's own: record
 * first, then the conference record, then head to head as points scored against
 * everybody. A table that sorts by wins alone leaves two 8-2 clubs in whatever
 * order the array happened to be in, which changes who plays in January.
 */
export function sortStandings(table: Record<string, Standing>): Standing[] {
  const pct = (s: Standing): number => {
    const g = s.wins + s.losses + s.ties;
    return g === 0 ? 0 : (s.wins + s.ties * 0.5) / g;
  };
  const confPct = (s: Standing): number => {
    const g = s.confWins + s.confLosses;
    return g === 0 ? 0 : s.confWins / g;
  };
  return Object.values(table).sort((a, b) =>
    pct(b) - pct(a)
    || confPct(b) - confPct(a)
    || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
    || b.pointsFor - a.pointsFor
    || a.teamId.localeCompare(b.teamId));
}

export const recordOf = (s: Standing | undefined): string =>
  (s ? `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}` : '0-0');
