/* ---------------------------------------------------------------------------
 * SEASON FORMATS
 * ---------------------------------------------------------------------------
 * One season engine for every level of the sport. A high school class plays a
 * round robin and a district playoff; a college conference plays a schedule,
 * then a conference tournament, then a national bracket; a professional league
 * plays everybody and takes four to the semifinals.
 *
 * The differences live entirely in a SeasonFormat, so the career code that
 * drives a season — play a game, record it, move to the next stage — is the same
 * whether the player is coaching Class D or the PLL.
 *
 * High school reproduces exactly what Dynasty already did, because Dynasty
 * saves and Dynasty balance both depend on it.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import { LEVELS, type Level } from '../data/levels';

export type PlayoffRound = 'R16' | 'QF' | 'SF' | 'F';

/** Which competition a playoff game belongs to. */
export type Bracket = 'league' | 'conference' | 'national';

export const ROUND_ORDER: PlayoffRound[] = ['R16', 'QF', 'SF', 'F'];

export interface SeasonFormat {
  level: Level;
  /** Games in the regular season. */
  regularGames: number;
  /** How many of those are against teams outside your own conference. */
  nonConference: number;
  /** Teams in the conference tournament. 0 = the league has none. */
  conferenceField: number;
  /** Teams in the national bracket. 0 = the champion is decided in-league. */
  nationalField: number;
  /** What the trophy that matters at this level is called. */
  titleName: string;
  /** What a conference title is called, when there is one. */
  conferenceTitleName: string;
  /** Whether winning the conference means anything beyond a banner. */
  autoBid: boolean;
}

/** The competition whose winner is the champion of this level. */
export function titleBracket(format: SeasonFormat): Bracket {
  return format.nationalField > 0 ? 'national' : format.conferenceField > 0 ? 'conference' : 'league';
}

export function formatFor(level: Level, leagueSize: number, levelSize: number): SeasonFormat {
  switch (level) {
    case 'hs':
      // Exactly what the district already did: a round robin inside the class
      // and a playoff of roughly the top half.
      return {
        level,
        regularGames: 12,
        nonConference: 0,
        conferenceField: 0,
        nationalField: 0,
        titleName: 'District Championship',
        conferenceTitleName: 'District Championship',
        autoBid: false,
      };
    case 'd3':
    case 'd2':
    case 'd1': {
      // A college season: conference games, a handful of non-conference
      // fixtures, a conference tournament, then the national bracket.
      const conferenceGames = Math.max(4, Math.min(12, leagueSize - 1));
      const national = levelSize >= 60 ? 16 : levelSize >= 30 ? 8 : 4;
      return {
        level,
        regularGames: conferenceGames + 4,
        nonConference: 4,
        conferenceField: Math.min(6, Math.max(4, leagueSize >= 8 ? 6 : 4)),
        nationalField: national,
        titleName: `${LEVELS[level].short} National Championship`,
        conferenceTitleName: 'Conference Championship',
        autoBid: true,
      };
    }
    case 'semipro':
      return {
        level,
        regularGames: 12,
        nonConference: 4,
        conferenceField: 0,
        nationalField: 4,
        titleName: 'Continental Cup',
        conferenceTitleName: 'Conference Title',
        autoBid: true,
      };
    case 'pll':
      return {
        level,
        regularGames: 10,
        nonConference: 0,
        conferenceField: 0,
        nationalField: 4,
        titleName: 'PLL Championship',
        conferenceTitleName: 'PLL Championship',
        autoBid: false,
      };
  }
}

/** Bracket rounds for a field size, largest first. */
export function roundsFor(field: number): PlayoffRound[] {
  if (field >= 16) return ['R16', 'QF', 'SF', 'F'];
  if (field >= 8) return ['QF', 'SF', 'F'];
  if (field >= 4) return ['SF', 'F'];
  return ['F'];
}

export function roundLabel(round: PlayoffRound, bracket: Bracket, format: SeasonFormat): string {
  const names: Record<PlayoffRound, string> = {
    R16: 'First Round',
    QF: 'Quarterfinal',
    SF: 'Semifinal',
    F: bracket === 'national' ? format.titleName
      : bracket === 'conference' ? format.conferenceTitleName
        : format.titleName,
  };
  if (bracket === 'conference' && round !== 'F') return `Conference ${names[round]}`;
  if (bracket === 'national' && round !== 'F') return `National ${names[round]}`;
  return names[round];
}

/* ----------------------------------------------------------- scheduling */

export interface ScheduleEntry {
  id: string;
  week: number;
  homeId: string;
  awayId: string;
  /** True for games inside the coach's own conference. */
  inConference: boolean;
}

/**
 * A regular season: a round robin inside the conference, padded out with
 * non-conference fixtures against teams at the same level. Small conferences
 * play each other twice rather than sitting idle.
 */
export function buildRegularSeason(
  format: SeasonFormat,
  conferenceIds: string[],
  levelIds: string[],
  seed: number,
): ScheduleEntry[] {
  const rng = new Rng(seed);
  const ids = rng.shuffle([...conferenceIds]);
  const games: ScheduleEntry[] = [];
  const homeCount: Record<string, number> = {};
  for (const id of ids) homeCount[id] = 0;

  const list = [...ids];
  if (list.length % 2 === 1) list.push('__BYE__');
  const rounds = list.length - 1;
  const half = list.length / 2;
  const cycles = Math.max(1, Math.round((format.regularGames - format.nonConference) / Math.max(1, ids.length - 1)));

  const rotating = list.slice(1);
  let week = 1;
  for (let r = 0; r < rounds * cycles; r++) {
    const secondCycle = r >= rounds;
    const order = [list[0], ...rotating];
    for (let i = 0; i < half; i++) {
      const a = order[i];
      const b = order[order.length - 1 - i];
      if (a === '__BYE__' || b === '__BYE__') continue;
      let homeId = a;
      let awayId = b;
      if (homeCount[a] > homeCount[b] || (homeCount[a] === homeCount[b] && (r + i) % 2 === 1)) {
        homeId = b;
        awayId = a;
      }
      if (secondCycle) { const t = homeId; homeId = awayId; awayId = t; }
      homeCount[homeId]++;
      games.push({ id: `w${week}-${homeId}-${awayId}`, week, homeId, awayId, inConference: true });
    }
    rotating.unshift(rotating.pop()!);
    week++;
  }

  // Non-conference: everyone plays the same number, drawn from the rest of the
  // level, so the schedule is a real one rather than a private round robin.
  if (format.nonConference > 0) {
    const outside = levelIds.filter((id) => !conferenceIds.includes(id));
    if (outside.length >= 2) {
      for (let n = 0; n < format.nonConference; n++) {
        const pool = rng.shuffle([...outside]);
        for (let i = 0; i < ids.length; i++) {
          const me = ids[i];
          const them = pool[(i + n) % pool.length];
          const atHome = (n + i) % 2 === 0;
          games.push({
            id: `nc${n}-${me}-${them}`,
            week,
            homeId: atHome ? me : them,
            awayId: atHome ? them : me,
            inConference: false,
          });
        }
        week++;
      }
    }
  }

  return games.sort((a, b) => a.week - b.week);
}

/** Standard bracket pairing: 1 plays the lowest seed, 2 the next, and so on. */
export function pairSeeds(seeds: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  const list = [...seeds];
  while (list.length >= 2) {
    const top = list.shift()!;
    const bottom = list.pop()!;
    pairs.push([top, bottom]);
  }
  return pairs;
}

/**
 * Who gets into the national bracket: every conference champion that carries an
 * automatic bid, then the best of the rest until the field is full. Exactly how
 * the real thing works, and it means winning your conference is worth something
 * even in a bad year.
 */
export function selectNationalField(
  field: number,
  autoBids: string[],
  atLarge: { teamId: string; rating: number }[],
): string[] {
  const picked = [...new Set(autoBids)].slice(0, field);
  const remaining = atLarge
    .filter((t) => !picked.includes(t.teamId))
    .sort((a, b) => b.rating - a.rating);
  for (const t of remaining) {
    if (picked.length >= field) break;
    picked.push(t.teamId);
  }
  return picked;
}
