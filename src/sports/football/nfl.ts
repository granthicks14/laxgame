import { Rng } from '../../core/rng';
import { clamp } from '../../core/math';
import { buildRoster, type Player, type Team } from './data';

/* ---------------------------------------------------------------------------
 * THE LEAGUE
 * ---------------------------------------------------------------------------
 * Thirty-two clubs, two conferences, four divisions each, and the season shape
 * that follows from it: seventeen games, a division to win, a wild card to
 * chase, and one game in February.
 *
 * THE LINE THIS FILE HOLDS, and it is deliberate: the CLUBS are the real ones —
 * the cities, the names, the divisions and the conference structure people
 * already know, because a franchise game whose league you have to learn before
 * you can care about it has thrown away the one thing it got for free. EVERY
 * PLAYER IN IT IS INVENTED. Not one name, likeness or career in this game
 * belongs to a real person; every roster is generated from the club's id, the
 * save's seed and the year, and so is every draft class and every free agent.
 *
 * And nothing here is anybody's artwork. A club is drawn from two colours and
 * its own three letters — original marks made by this game's renderer — because
 * copying a badge is copying a badge whatever else is original.
 *
 * ROSTERS ARE DERIVED, NEVER STORED. The one roster a save keeps is the coach's
 * own. The other thirty-one are rebuilt on demand from (id, seed, year, drift),
 * which is why a thirty-season franchise is a few dozen kilobytes and why the
 * team you scouted is the team you play.
 * ------------------------------------------------------------------------- */

export type Conference = 'AFC' | 'NFC';
export type DivisionName = 'East' | 'North' | 'South' | 'West';

export const CONFERENCES: Conference[] = ['AFC', 'NFC'];
export const DIVISION_NAMES: DivisionName[] = ['East', 'North', 'South', 'West'];

export interface NflTeam extends Team {
  conference: Conference;
  division: DivisionName;
  /** 'AFC East', which is the key everything divisional is grouped by. */
  divisionId: string;
  /**
   * 1-5. How good a roster the club generates before a single season is played,
   * and how attractive it is to a free agent. It DRIFTS: a decade of winning
   * lifts a club and a decade of losing sinks one.
   */
  prestige: number;
  /** 1-5. How much money the club makes, which is not the same as how good it is. */
  market: number;
}

/* A compact table, because thirty-two rows of object literal is unreadable and
 * this is the one file where the whole league has to be seen at once.
 *
 *   id | city | name | abbr | primary | secondary | venue | prestige | market
 */
type Row = [string, string, string, string, string, string, string, number, number];

const AFC_EAST: Row[] = [
  ['buf', 'Buffalo', 'Bills', 'BUF', '#00338d', '#c60c30', 'The Lakefront', 4, 3],
  ['mia', 'Miami', 'Dolphins', 'MIA', '#008e97', '#fc4c02', 'Bayfront Park', 3, 4],
  ['ne', 'New England', 'Patriots', 'NE', '#002244', '#c60c30', 'The Mill Yard', 3, 4],
  ['nyj', 'New York', 'Jets', 'NYJ', '#125740', '#ffffff', 'The Meadow', 2, 5],
];
const AFC_NORTH: Row[] = [
  ['bal', 'Baltimore', 'Ravens', 'BAL', '#241773', '#9e7c0c', 'Harbour Yard', 4, 3],
  ['cin', 'Cincinnati', 'Bengals', 'CIN', '#fb4f14', '#000000', 'Riverbend', 3, 3],
  ['cle', 'Cleveland', 'Browns', 'CLE', '#311d00', '#ff3c00', 'The Dawg Pound', 2, 3],
  ['pit', 'Pittsburgh', 'Steelers', 'PIT', '#101820', '#ffb612', 'The Point', 4, 3],
];
const AFC_SOUTH: Row[] = [
  ['hou', 'Houston', 'Texans', 'HOU', '#03202f', '#a71930', 'The Bayou Bowl', 3, 4],
  ['ind', 'Indianapolis', 'Colts', 'IND', '#002c5f', '#ffffff', 'The Circle', 3, 3],
  ['jax', 'Jacksonville', 'Jaguars', 'JAX', '#006778', '#d7a22a', 'The Landing', 2, 2],
  ['ten', 'Tennessee', 'Titans', 'TEN', '#0c2340', '#4b92db', 'Riverside', 2, 3],
];
const AFC_WEST: Row[] = [
  ['den', 'Denver', 'Broncos', 'DEN', '#fb4f14', '#002244', 'Mile High Field', 3, 3],
  ['kc', 'Kansas City', 'Chiefs', 'KC', '#e31837', '#ffb81c', 'The Bluffs', 5, 3],
  ['lv', 'Las Vegas', 'Raiders', 'LV', '#101820', '#a5acaf', 'The Black Hole', 2, 3],
  ['lac', 'Los Angeles', 'Chargers', 'LAC', '#0080c6', '#ffc20e', 'Bolt Yard', 3, 5],
];
const NFC_EAST: Row[] = [
  ['dal', 'Dallas', 'Cowboys', 'DAL', '#003594', '#869397', 'The Star Bowl', 4, 5],
  ['nyg', 'New York', 'Giants', 'NYG', '#0b2265', '#a71930', 'The Meadow', 3, 5],
  ['phi', 'Philadelphia', 'Eagles', 'PHI', '#004c54', '#a5acaf', 'The Nest', 4, 4],
  ['was', 'Washington', 'Commanders', 'WAS', '#5a1414', '#ffb612', 'The Capitol Bowl', 2, 4],
];
const NFC_NORTH: Row[] = [
  ['chi', 'Chicago', 'Bears', 'CHI', '#0b162a', '#c83803', 'The Lakeshore', 2, 5],
  ['det', 'Detroit', 'Lions', 'DET', '#0076b6', '#b0b7bc', 'The Motor Dome', 3, 3],
  ['gb', 'Green Bay', 'Packers', 'GB', '#203731', '#ffb612', 'The Frozen Field', 4, 2],
  ['min', 'Minnesota', 'Vikings', 'MIN', '#4f2683', '#ffc62f', 'The Longhouse', 3, 3],
];
const NFC_SOUTH: Row[] = [
  ['atl', 'Atlanta', 'Falcons', 'ATL', '#a71930', '#000000', 'The Aerie', 3, 4],
  ['car', 'Carolina', 'Panthers', 'CAR', '#0085ca', '#101820', 'Queen City Bowl', 2, 3],
  ['no', 'New Orleans', 'Saints', 'NO', '#d3bc8d', '#101820', 'The Quarter Dome', 3, 3],
  ['tb', 'Tampa Bay', 'Buccaneers', 'TB', '#d50a0a', '#34302b', 'The Cove', 3, 3],
];
const NFC_WEST: Row[] = [
  ['ari', 'Arizona', 'Cardinals', 'ARI', '#97233f', '#000000', 'The Desert Bowl', 2, 3],
  ['lar', 'Los Angeles', 'Rams', 'LAR', '#003594', '#ffa300', 'The Coliseum Yard', 3, 5],
  ['sf', 'San Francisco', '49ers', 'SF', '#aa0000', '#b3995d', 'The Bay Bowl', 4, 4],
  ['sea', 'Seattle', 'Seahawks', 'SEA', '#002244', '#69be28', 'The Sound', 4, 3],
];

const TABLE: [Conference, DivisionName, Row[]][] = [
  ['AFC', 'East', AFC_EAST], ['AFC', 'North', AFC_NORTH],
  ['AFC', 'South', AFC_SOUTH], ['AFC', 'West', AFC_WEST],
  ['NFC', 'East', NFC_EAST], ['NFC', 'North', NFC_NORTH],
  ['NFC', 'South', NFC_SOUTH], ['NFC', 'West', NFC_WEST],
];

function build(): NflTeam[] {
  const out: NflTeam[] = [];
  for (const [conference, division, rows] of TABLE) {
    for (const [id, city, name, abbr, primary, secondary, stadium, prestige, market] of rows) {
      out.push({
        id,
        city,
        name,
        abbr,
        primary,
        secondary,
        stadium,
        conference,
        division,
        divisionId: `${conference} ${division}`,
        prestige,
        market,
      });
    }
  }
  return out;
}

export const TEAMS: NflTeam[] = build();

const BY_ID = new Map(TEAMS.map((t) => [t.id, t]));

export const nflTeam = (id: string): NflTeam | null => BY_ID.get(id) ?? null;

/** Never null, for the hundred places on screen that only want a name. */
export function teamOr(id: string): NflTeam {
  return BY_ID.get(id) ?? TEAMS[0];
}

export const DIVISION_IDS: string[] = TEAMS
  .map((t) => t.divisionId)
  .filter((d, i, all) => all.indexOf(d) === i);

export const divisionOf = (id: string): NflTeam[] => {
  const team = nflTeam(id);
  return team ? TEAMS.filter((t) => t.divisionId === team.divisionId) : [];
};

export const teamsInDivision = (divisionId: string): NflTeam[] =>
  TEAMS.filter((t) => t.divisionId === divisionId);

export const teamsInConference = (conference: Conference): NflTeam[] =>
  TEAMS.filter((t) => t.conference === conference);

export const divisionsIn = (conference: Conference): string[] =>
  DIVISION_NAMES.map((d) => `${conference} ${d}`);

/** The one fixture a town cares about: the nearest club in the division. */
export function rivalOf(id: string): string | null {
  const team = nflTeam(id);
  if (!team) return null;
  const pool = divisionOf(id).filter((t) => t.id !== id)
    .sort((a, b) => Math.abs(a.prestige - team.prestige) - Math.abs(b.prestige - team.prestige)
      || a.id.localeCompare(b.id));
  return pool[0]?.id ?? null;
}

/* ------------------------------------------------------------------ rosters */

/**
 * THE BAND A CLUB'S PLAYERS ARE DRAWN FROM.
 *
 * Prestige sets the middle of it and drift moves it, so a club that has been
 * winning for five years is genuinely harder to beat in year six and one that
 * has been losing is genuinely easier. The range is deliberately narrow: this is
 * one league, not a pyramid, and the difference between the best roster and the
 * worst is a handful of rating points and a quarterback.
 */
export const PAR_BASE = 54;
export const PAR_PER_PRESTIGE = 3.2;
/** The band a middling club is drawn from, which everything else is judged against. */
export const LEAGUE_PAR = PAR_BASE + PAR_PER_PRESTIGE * 3;

export const parFor = (team: NflTeam, drift = 0): number =>
  clamp(PAR_BASE + team.prestige * PAR_PER_PRESTIGE + drift, 54, 76);

/** How far the best man on a roster sits above the last. */
export const ROSTER_SPREAD = 12;

/**
 * A CLUB'S SQUAD FOR A SEASON, built the same way every time it is asked for.
 *
 * `seed` is the save's, so two franchises see two different leagues; `year`
 * moves it on, so a club you beat in year one is not the same club in year six.
 */
export function rosterFor(team: NflTeam, seed: number, year: number, drift = 0): Player[] {
  return buildRoster(`nfl:${seed}:${team.id}:${year}`, {
    par: parFor(team, drift),
    spread: ROSTER_SPREAD,
  });
}

/* ------------------------------------------------------------------ colours */

/**
 * A READABLE BADGE. Two of these colours are picked by a club and some of them
 * are nearly black on nearly black, so the secondary is only used as a badge
 * outline when it can actually be seen against the primary.
 */
export function badgeColours(team: NflTeam): { fill: string; edge: string; text: string } {
  const lum = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  };
  const a = lum(team.primary);
  const b = lum(team.secondary);
  return {
    fill: team.primary,
    edge: Math.abs(a - b) > 0.18 ? team.secondary : (a > 0.5 ? '#101318' : '#f2f4f8'),
    text: a > 0.55 ? '#12151b' : '#ffffff',
  };
}

/* -------------------------------------------------------------- the bracket */

/** How many clubs from each conference reach January. */
export const PLAYOFF_TEAMS_PER_CONFERENCE = 7;
export const REGULAR_SEASON_WEEKS = 18;
export const GAMES_PER_TEAM = 17;

/** A deterministic stream keyed to the league rather than to a career. */
export const leagueRng = (seed: number, what: string): Rng => new Rng(`nfl:${seed}:${what}`);
