import { clamp } from '../../../core/math';
import { LEVELS } from '../levels';
import { teamsAtLevel, worldTeam } from '../world';
import { averages } from './season';
import { replayFixture, rosterFor, scheduleYear } from './league';
import { recordResult } from './schedule';
import { emptyStatLine } from './types';
import type { Alumnus, HoopsCareer, StatLine } from './types';
import type { HoopsPosition } from '../data';
import type { BoxLine } from '../types';

export type { Alumnus } from './types';

/* ---------------------------------------------------------------------------
 * WHO LED THE LEAGUE, AND WHO USED TO PLAY HERE
 * ---------------------------------------------------------------------------
 * Two things a career mode needs that basketball did not have, and lacrosse has
 * had for a long time.
 *
 * LEAGUE LEADERS. A statistics screen that only knows your own twelve players is
 * a statistics screen that cannot tell you whether your leading scorer is any
 * good. Nothing is stored for this: every rival fixture is RE-SIMULATED to
 * recover its box score, which works because the fast engine is deterministic —
 * the same fixture, the same seed, the same game. So a forty-programme level
 * costs nothing in the save file and cannot drift out of step with its own
 * results, because the results ARE the box scores.
 *
 * ALUMNI. A programme is what it has produced. When a senior graduates his name
 * has been leaving the save with him, which means a twenty-year dynasty could not
 * tell you who its best player had ever been. They are remembered now, with the
 * line they left on.
 * ------------------------------------------------------------------------- */

export interface LeagueLine {
  playerId: string;
  name: string;
  teamId: string;
  teamAbbr: string;
  pos: HoopsPosition;
  overall: number;
  line: StatLine;
  /** True for the coach's own players. */
  mine: boolean;
}

/**
 * Every player at the level who has played, with his season.
 *
 * Expensive — it replays the level's whole season — so it belongs behind a screen
 * a coach opens rather than on the hub. At forty clubs and thirty games it is
 * about six hundred simulated fixtures, which the fast engine does in a third of
 * a second.
 */
export function leagueStatLines(career: HoopsCareer): LeagueLine[] {
  const out: LeagueLine[] = [];
  const acc = new Map<string, Map<string, StatLine>>();
  /* THE SEASON THE FIXTURE LIST BELONGS TO, which in an offseason is not the year
   * the coach is living in. Replaying with the wrong year would recover a
   * different game entirely. */
  const year = scheduleYear(career);

  /* A simulated fixture hands back a BOX LINE, which knows nothing about games
   * played — one fixture is one game, and a man who never got off the bench did
   * not play in it. */
  const add = (into: StatLine, from: BoxLine): void => {
    if (from.seconds <= 0) return;
    into.games += 1;
    into.seconds += from.seconds; into.points += from.points;
    into.fga += from.fga; into.fgm += from.fgm;
    into.tpa += from.tpa; into.tpm += from.tpm;
    into.fta += from.fta; into.ftm += from.ftm;
    into.offReb += from.offReb; into.defReb += from.defReb;
    into.assists += from.assists; into.steals += from.steals;
    into.blocks += from.blocks; into.turnovers += from.turnovers;
    into.fouls += from.fouls;
  };

  for (const f of career.schedule) {
    if (!f.played) continue;
    // The coach's own squad keeps the real numbers it recorded on the floor.
    if (f.homeId === career.teamId || f.awayId === career.teamId) continue;
    const r = replayFixture(career, f, year);
    for (const side of [r.home, r.away]) {
      let table = acc.get(side.id);
      if (!table) { table = new Map(); acc.set(side.id, table); }
      for (const l of side.lines) {
        const cur = table.get(l.player.id) ?? emptyStatLine();
        add(cur, l.line);
        table.set(l.player.id, cur);
      }
    }
  }

  for (const [teamId, table] of acc) {
    const team = worldTeam(teamId);
    const roster = rosterFor(career, teamId, year);
    for (const p of roster) {
      const line = table.get(p.id);
      if (!line || line.games === 0) continue;
      out.push({
        playerId: p.id,
        name: `${p.first} ${p.last}`,
        teamId,
        teamAbbr: team.abbr,
        pos: p.pos,
        overall: p.overall,
        line,
        mine: false,
      });
    }
  }

  const mine = worldTeam(career.teamId);
  for (const p of career.roster) {
    const line = career.season[p.id];
    if (!line || line.games === 0) continue;
    out.push({
      playerId: p.id,
      name: `${p.first} ${p.last}`,
      teamId: career.teamId,
      teamAbbr: mine.abbr,
      pos: p.pos,
      overall: p.overall,
      line,
      mine: true,
    });
  }
  return out;
}

/* --------------------------------------------------------------- the leaders */

export type LeaderCategory =
  | 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks'
  | 'fgPct' | 'tpPct' | 'ftPct' | 'minutes';

export const LEADER_LABEL: Record<LeaderCategory, string> = {
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  steals: 'Steals',
  blocks: 'Blocks',
  fgPct: 'Field goal %',
  tpPct: 'Three point %',
  ftPct: 'Free throw %',
  minutes: 'Minutes',
};

export const LEADER_ORDER: LeaderCategory[] = [
  'points', 'rebounds', 'assists', 'steals', 'blocks', 'fgPct', 'tpPct', 'ftPct',
];

/** How many attempts a man needs before a percentage means anything. */
const QUALIFIER: Partial<Record<LeaderCategory, { of: keyof StatLine; per: number }>> = {
  fgPct: { of: 'fga', per: 4 },
  tpPct: { of: 'tpa', per: 1.5 },
  ftPct: { of: 'fta', per: 1 },
};

export function leaderValue(l: LeagueLine, cat: LeaderCategory): number {
  const a = averages(l.line);
  switch (cat) {
    case 'points': return a.ppg;
    case 'rebounds': return a.rpg;
    case 'assists': return a.apg;
    case 'steals': return a.spg;
    case 'blocks': return a.bpg;
    case 'minutes': return a.mpg;
    case 'fgPct': return a.fgPct;
    case 'tpPct': return a.tpPct;
    case 'ftPct': return a.ftPct;
    default: return 0;
  }
}

/**
 * The top of a category.
 *
 * A PERCENTAGE NEEDS A QUALIFIER, or the leader board is a man who took one shot
 * and made it. Real basketball demands a rate of attempts per game, and so does
 * this.
 */
export function leaders(
  lines: LeagueLine[], cat: LeaderCategory, limit = 10,
): LeagueLine[] {
  const q = QUALIFIER[cat];
  const pool = q
    ? lines.filter((l) => (l.line[q.of] as number) >= q.per * Math.max(1, l.line.games))
    : lines.filter((l) => l.line.games > 0);
  return [...pool]
    .sort((a, b) => leaderValue(b, cat) - leaderValue(a, cat))
    .slice(0, limit);
}

/** Where one of the coach's own players stands at the level. */
export function rankOf(
  lines: LeagueLine[], cat: LeaderCategory, playerId: string,
): { rank: number; of: number } | null {
  const sorted = leaders(lines, cat, lines.length);
  const i = sorted.findIndex((l) => l.playerId === playerId);
  if (i < 0) return null;
  return { rank: i + 1, of: sorted.length };
}

/* ------------------------------------------------------------------- alumni */

/**
 * Remember a man who has left.
 *
 * Called as the offseason lets him go, so his career line is complete. The
 * programme's record is the only place a departed player still exists — every
 * other structure in a career is about who is here now.
 */
export function recordAlumnus(
  career: HoopsCareer, id: string, name: string, pos: HoopsPosition,
  overall: number, reason: string,
): void {
  const line = career.careerStats[id];
  if (!line || line.games === 0) return;
  if (career.alumni.some((a) => a.id === id)) return;
  career.alumni.push({
    id,
    name,
    pos,
    overall,
    year: career.year,
    reason,
    seasons: Math.max(1, line.seasons),
    line: { ...line },
  });
  // A programme remembers its best, not all of them: two hundred names is a list
  // nobody reads, and the ones worth keeping are the ones who played.
  if (career.alumni.length > 120) {
    career.alumni.sort((a, b) => b.line.points - a.line.points);
    career.alumni.length = 120;
  }
}

/** The programme's best ever, by whatever measure the screen asks for. */
export function bestAlumni(
  career: HoopsCareer, cat: 'points' | 'rebounds' | 'assists' = 'points', limit = 12,
): Alumnus[] {
  const of = (a: Alumnus): number => (cat === 'points' ? a.line.points
    : cat === 'rebounds' ? a.line.offReb + a.line.defReb : a.line.assists);
  return [...career.alumni].sort((a, b) => of(b) - of(a)).slice(0, limit);
}

/* ------------------------------------------------------- programme records */

export interface ProgrammeRecord {
  label: string;
  value: string;
  who: string;
  year: number | null;
}

/**
 * The record book. What this programme has never done better than.
 *
 * Built from the season history and the alumni, so it grows with the career and
 * costs nothing to keep — a twenty-year dynasty has a wall worth reading, which
 * is most of why anybody runs one for twenty years.
 */
export function programmeRecords(career: HoopsCareer): ProgrammeRecord[] {
  const out: ProgrammeRecord[] = [];
  const hist = career.history;

  if (hist.length) {
    const bestWins = [...hist].sort((a, b) => b.wins - a.wins)[0];
    out.push({
      label: 'Most wins in a season',
      value: `${bestWins.wins}-${bestWins.losses}`,
      who: `${LEVELS[bestWins.level].short}`,
      year: bestWins.year,
    });
    const worst = [...hist].sort((a, b) => a.wins - b.wins)[0];
    out.push({
      label: 'Fewest wins in a season',
      value: `${worst.wins}-${worst.losses}`,
      who: `${LEVELS[worst.level].short}`,
      year: worst.year,
    });
    const titles = hist.filter((h) => h.champion);
    out.push({
      label: 'Championships',
      value: String(titles.length),
      who: titles.length ? titles.map((t) => t.year).join(', ') : 'none yet',
      year: null,
    });
    const streak = longestStreak(hist);
    if (streak.length > 1) {
      out.push({
        label: 'Best run of winning seasons',
        value: `${streak.length} seasons`,
        who: `${streak.from}-${streak.to}`,
        year: null,
      });
    }
  }

  const scorer = bestAlumni(career, 'points', 1)[0];
  if (scorer) {
    out.push({
      label: 'Most career points',
      value: String(scorer.line.points),
      who: `${scorer.name} (${scorer.seasons} seasons)`,
      year: scorer.year,
    });
  }
  const rebounder = bestAlumni(career, 'rebounds', 1)[0];
  if (rebounder) {
    out.push({
      label: 'Most career rebounds',
      value: String(rebounder.line.offReb + rebounder.line.defReb),
      who: rebounder.name,
      year: rebounder.year,
    });
  }
  const passer = bestAlumni(career, 'assists', 1)[0];
  if (passer) {
    out.push({
      label: 'Most career assists',
      value: String(passer.line.assists),
      who: passer.name,
      year: passer.year,
    });
  }
  return out;
}

function longestStreak(
  hist: HoopsCareer['history'],
): { length: number; from: number; to: number } {
  let best = { length: 0, from: 0, to: 0 };
  let run = 0;
  let start = 0;
  for (const h of hist) {
    const winning = h.wins > h.losses;
    if (winning) {
      if (run === 0) start = h.year;
      run++;
      if (run > best.length) best = { length: run, from: start, to: h.year };
    } else run = 0;
  }
  return best;
}

/* -------------------------------------------------------- the level's table */

export interface LevelStanding {
  teamId: string;
  abbr: string;
  name: string;
  /** Points scored and conceded a game, from the results that happened. */
  scored: number;
  conceded: number;
  pace: number;
}

/** How every programme at the level is actually playing, from its own results. */
export function levelForm(career: HoopsCareer): LevelStanding[] {
  const out: LevelStanding[] = [];
  for (const t of teamsAtLevel(career.level)) {
    const row = career.standings[t.id];
    if (!row) continue;
    const games = Math.max(1, row.wins + row.losses);
    out.push({
      teamId: t.id,
      abbr: t.abbr,
      name: `${t.city} ${t.name}`,
      scored: row.pointsFor / games,
      conceded: row.pointsAgainst / games,
      pace: clamp((row.pointsFor + row.pointsAgainst) / games, 0, 400),
    });
  }
  return out.sort((a, b) => (b.scored - b.conceded) - (a.scored - a.conceded));
}

/* ------------------------------------------------------------- integrity */

/**
 * PROVE THE CAREER STILL ADDS UP, and repair it where it does not.
 *
 * A management save is a machine that runs for twenty years, and the way one dies
 * is quietly: a standings row that drifts a game out of step with the fixture
 * list, a career total that stops matching the seasons that fed it, a champion
 * recorded for a year the history has no entry for. None of that shows up on a
 * screen until a coach notices his record says 18-12 and counts nineteen wins in
 * the schedule, and by then the save is years old.
 *
 * So the table is REBUILT FROM THE RESULTS whenever a career is opened. The
 * fixtures are the truth — they are what actually happened — and anything derived
 * from them that disagrees is wrong by definition and is replaced. What cannot be
 * rebuilt is reported instead, in words a player can act on.
 *
 * Returns the list of problems found. An empty list is the healthy case.
 */
export function validateCareer(career: HoopsCareer): string[] {
  const problems: string[] = [];

  /* 1. THE TABLE, rebuilt from the fixture list. Postseason games are excluded
   *    because they are not part of a regular-season record. */
  const before = JSON.stringify(career.standings);
  for (const row of Object.values(career.standings)) {
    row.wins = 0; row.losses = 0;
    row.confWins = 0; row.confLosses = 0;
    row.pointsFor = 0; row.pointsAgainst = 0;
    row.homeWins = 0; row.homeLosses = 0;
    row.awayWins = 0; row.awayLosses = 0;
    row.streak = 0;
  }
  for (const f of career.schedule) {
    if (!f.played || f.postseason) continue;
    recordResult(career.standings, f);
  }
  if (JSON.stringify(career.standings) !== before) {
    const mine = career.standings[career.teamId];
    problems.push(
      'the table did not match the fixture list and was rebuilt from it'
      + (mine ? ` — your record is ${mine.wins}-${mine.losses}` : ''),
    );
  }

  /* 2. THE COACH'S OWN RECORD has to count exactly the games he has played. */
  const mine = career.standings[career.teamId];
  if (mine) {
    const played = career.schedule.filter(
      (f) => f.featured && f.played && !f.postseason,
    ).length;
    const counted = mine.wins + mine.losses;
    if (counted !== played) {
      problems.push(`your record counts ${counted} of ${played} completed games`);
    }
  }

  /* 3. CAREER TOTALS cannot be smaller than the history that produced them. */
  const fromHistory = career.history.reduce(
    (n, h) => ({ w: n.w + h.wins, l: n.l + h.losses }), { w: 0, l: 0 },
  );
  if (career.careerWins < fromHistory.w || career.careerLosses < fromHistory.l) {
    problems.push(
      `career record ${career.careerWins}-${career.careerLosses} is behind the `
      + `${career.history.length} seasons on record (${fromHistory.w}-${fromHistory.l})`,
    );
    career.careerWins = Math.max(career.careerWins, fromHistory.w);
    career.careerLosses = Math.max(career.careerLosses, fromHistory.l);
  }

  /* 4. TITLES have to be titles somebody actually won. */
  const titles = career.history.filter((h) => h.champion).length;
  if (career.championships !== titles && career.history.length > 0) {
    problems.push(
      `${career.championships} championships recorded but ${titles} in the history`,
    );
    career.championships = titles;
  }

  /* 5. A STAT LINE cannot have more starts than games, and a career line cannot
   *    cover more seasons than the career has had. */
  for (const [id, line] of Object.entries(career.careerStats)) {
    if (line.starts > line.games) {
      problems.push(`${id} has ${line.starts} starts in ${line.games} games`);
      line.starts = line.games;
    }
    if (line.seasons > career.history.length + 1) {
      problems.push(`${id} has ${line.seasons} seasons in a ${career.history.length}-season career`);
      line.seasons = career.history.length + 1;
    }
  }

  /* 6. NOBODY IS ON THE WALL TWICE, and nobody is on it while still on the
   *    roster — either would double-count him everywhere he appears. */
  const seen = new Set<string>();
  const here = new Set(career.roster.map((p) => p.id));
  career.alumni = career.alumni.filter((a) => {
    if (seen.has(a.id)) { problems.push(`${a.name} was on the wall twice`); return false; }
    if (here.has(a.id)) { problems.push(`${a.name} is on the wall and the roster`); return false; }
    seen.add(a.id);
    return true;
  });

  return problems;
}
