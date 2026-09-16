import { Rng } from '../../core/rng';
import { clamp } from '../../core/math';
import { buildRoster, type Player, type Team } from './data';
import { LEVELS, LEVEL_ORDER, teamPar, shapeFor, type FootballLevel } from './levels';

/* ---------------------------------------------------------------------------
 * THE FOOTBALL WORLD
 * ---------------------------------------------------------------------------
 * Every programme the game knows about, from a nine-man district school to a
 * professional club, in one registry so a coaching career can move between tiers
 * without any system needing to know which tier it is looking at.
 *
 * IT IS DERIVED, NOT STORED. A club is one line in the table below plus the
 * level it sits in, and everything else — colours, stadium, conference, the
 * talent band its roster comes from, the roster itself — falls out of that line
 * deterministically. Two consequences, and both of them matter more than the
 * saved bytes: the world is identical in every save on every device, and a save
 * file is the coach's own roster and nothing else, so it cannot go stale when
 * the world changes underneath it.
 * ------------------------------------------------------------------------- */

export type Identity = 'balanced' | 'air' | 'ground' | 'defence' | 'speed' | 'physical';

export const IDENTITY_LABEL: Record<Identity, string> = {
  balanced: 'Balanced',
  air: 'Throws it around',
  ground: 'Runs the ball',
  defence: 'Defence first',
  speed: 'Built on speed',
  physical: 'Physical football',
};

export interface WorldTeam extends Team {
  level: FootballLevel;
  conferenceId: string;
  /** 0-99 WITHIN the level. The best high school and the best club are both 95. */
  standing: number;
  /** 0-99 pull with new players. */
  recruiting: number;
  /** 0-99 quality of the staff already in the building. */
  coaching: number;
  identity: Identity;
  /** The attribute pool this club's roster is drawn from. */
  par: number;
}

/* --------------------------------------------------------------- the table
 *
 * One row per club: the place, the nickname and how strong it is within its own
 * tier. Everything else is derived. They are invented places and invented clubs
 * — the point is a world that feels like the sport, not a licence.
 */
interface Row {
  city: string;
  name: string;
  abbr: string;
  /** 0-99 within the level. */
  standing: number;
  /** How well it recruits relative to how good it is. Some programmes punch up. */
  pull?: number;
}

const HS_SMALL: Row[] = [
  { city: 'Cedar Hollow', name: 'Ironmen', abbr: 'CDH', standing: 74 },
  { city: 'Marlow', name: 'Bobcats', abbr: 'MRL', standing: 62 },
  { city: 'Pine Bluff', name: 'Loggers', abbr: 'PNB', standing: 55 },
  { city: 'Ashgrove', name: 'Ravens', abbr: 'ASH', standing: 49 },
  { city: 'Two Rivers', name: 'Otters', abbr: 'TWR', standing: 44 },
  { city: 'Kestrel', name: 'Hawks', abbr: 'KST', standing: 38 },
  { city: 'Hartley', name: 'Millers', abbr: 'HRT', standing: 33 },
  { city: 'Dunmore', name: 'Colts', abbr: 'DUN', standing: 27 },
  { city: 'Weatherby', name: 'Wolves', abbr: 'WTB', standing: 22 },
  { city: 'Sawgrass', name: 'Gators', abbr: 'SWG', standing: 16 },
  { city: 'Coldspring', name: 'Bears', abbr: 'CLD', standing: 11 },
  { city: 'Little Fork', name: 'Panthers', abbr: 'LTF', standing: 6 },
];

const HS_BIG: Row[] = [
  { city: 'Grantham', name: 'Titans', abbr: 'GRA', standing: 88 },
  { city: 'North Vale', name: 'Vikings', abbr: 'NVL', standing: 80 },
  { city: 'Emberton', name: 'Firebirds', abbr: 'EMB', standing: 72, pull: 82 },
  { city: 'Ridgeway', name: 'Chargers', abbr: 'RDG', standing: 64 },
  { city: 'Falcon Heights', name: 'Falcons', abbr: 'FHT', standing: 57 },
  { city: 'Brackenridge', name: 'Knights', abbr: 'BRK', standing: 50 },
  { city: 'Sable Creek', name: 'Cougars', abbr: 'SBC', standing: 43 },
  { city: 'Thornbury', name: 'Spartans', abbr: 'THB', standing: 36 },
  { city: 'Halloway', name: 'Warriors', abbr: 'HAL', standing: 29 },
  { city: 'Crestline', name: 'Eagles', abbr: 'CRL', standing: 22 },
  { city: 'Fairmount', name: 'Rams', abbr: 'FRM', standing: 15 },
  { city: 'Belhaven', name: 'Mustangs', abbr: 'BLH', standing: 8 },
];

const JUCO: Row[] = [
  { city: 'Copper Valley', name: 'Miners', abbr: 'CPV', standing: 86 },
  { city: 'Sandhill', name: 'Roadrunners', abbr: 'SND', standing: 77 },
  { city: 'Greenwater', name: 'Cyclones', abbr: 'GRW', standing: 68 },
  { city: 'Oakridge', name: 'Lumberjacks', abbr: 'OAK', standing: 60 },
  { city: 'Fort Adley', name: 'Cadets', abbr: 'FTA', standing: 52 },
  { city: 'Mesa Linda', name: 'Sunhawks', abbr: 'MSL', standing: 44 },
  { city: 'Rockbridge', name: 'Quarry', abbr: 'RKB', standing: 36 },
  { city: 'Laurel Park', name: 'Bulldogs', abbr: 'LRL', standing: 28 },
  { city: 'Shoreham', name: 'Mariners', abbr: 'SHR', standing: 20 },
  { city: 'Kingsley', name: 'Lions', abbr: 'KNG', standing: 12 },
];

const COLLEGE_SMALL: Row[] = [
  { city: 'Wexford', name: 'Foresters', abbr: 'WEX', standing: 90 },
  { city: 'Saint Albin', name: 'Crusaders', abbr: 'STA', standing: 82 },
  { city: 'Brightwater', name: 'Admirals', abbr: 'BRW', standing: 74 },
  { city: 'Highmoor', name: 'Highlanders', abbr: 'HGM', standing: 66, pull: 76 },
  { city: 'Calder', name: 'Blue Hens', abbr: 'CLD', standing: 58 },
  { city: 'Pemberton', name: 'Pioneers', abbr: 'PEM', standing: 50 },
  { city: 'Winslow', name: 'Wildcats', abbr: 'WNS', standing: 42 },
  { city: 'Ashfield', name: 'Ashmen', abbr: 'ASF', standing: 34 },
  { city: 'Glenmara', name: 'Gaels', abbr: 'GLN', standing: 26 },
  { city: 'Rothbury', name: 'Royals', abbr: 'RTH', standing: 18 },
  { city: 'Ivy Creek', name: 'Owls', abbr: 'IVY', standing: 11 },
  { city: 'Danforth', name: 'Dragons', abbr: 'DAN', standing: 5 },
];

const COLLEGE_BIG: Row[] = [
  { city: 'Tallahatchie', name: 'Thunder', abbr: 'TAL', standing: 94, pull: 96 },
  { city: 'Morrow State', name: 'Bison', abbr: 'MOR', standing: 87 },
  { city: 'Union Ridge', name: 'Red Wolves', abbr: 'UNR', standing: 80 },
  { city: 'Cascadia', name: 'Timberwolves', abbr: 'CAS', standing: 73 },
  { city: 'Port Meridian', name: 'Mariners', abbr: 'PTM', standing: 66 },
  { city: 'Arrowhead', name: 'Braves', abbr: 'ARW', standing: 59 },
  { city: 'Sierra Norte', name: 'Condors', abbr: 'SNT', standing: 52 },
  { city: 'Carrick', name: 'Celtics', abbr: 'CRK', standing: 45 },
  { city: 'Golden Plains', name: 'Sodbusters', abbr: 'GPL', standing: 38 },
  { city: 'Vandermeer', name: 'Vanguards', abbr: 'VDM', standing: 31 },
  { city: 'Iron Gate', name: 'Forgemen', abbr: 'IRG', standing: 23 },
  { city: 'Lakemont', name: 'Loons', abbr: 'LKM', standing: 15 },
];

const SEMIPRO: Row[] = [
  { city: 'Harbor City', name: 'Dockers', abbr: 'HBC', standing: 88 },
  { city: 'Steelhaven', name: 'Furnace', abbr: 'STH', standing: 78 },
  { city: 'Granite Falls', name: 'Granite', abbr: 'GRF', standing: 68 },
  { city: 'Redstone', name: 'Drillers', abbr: 'RDS', standing: 58 },
  { city: 'Cape Verity', name: 'Breakers', abbr: 'CPV', standing: 48 },
  { city: 'Northgate', name: 'Sentries', abbr: 'NGT', standing: 38 },
  { city: 'Willowmere', name: 'Wraiths', abbr: 'WLW', standing: 28 },
  { city: 'Dry Gulch', name: 'Rattlers', abbr: 'DRG', standing: 18 },
];

const PRO: Row[] = [
  { city: 'Bay Harbor', name: 'Kraken', abbr: 'BAY', standing: 92 },
  { city: 'Capital', name: 'Statesmen', abbr: 'CAP', standing: 85 },
  { city: 'Motorton', name: 'Pistons', abbr: 'MTN', standing: 78 },
  { city: 'Summit City', name: 'Summit', abbr: 'SMT', standing: 71 },
  { city: 'Gulfshore', name: 'Stingrays', abbr: 'GLF', standing: 64 },
  { city: 'Northwind', name: 'Blizzard', abbr: 'NWD', standing: 57 },
  { city: 'Copperfield', name: 'Kings', abbr: 'CPF', standing: 50 },
  { city: 'Riverbend', name: 'Ramblers', abbr: 'RVB', standing: 43 },
  { city: 'Stonepeak', name: 'Avalanche', abbr: 'STP', standing: 36 },
  { city: 'Old Colony', name: 'Minutemen', abbr: 'OLC', standing: 29 },
  { city: 'Solano', name: 'Sundevils', abbr: 'SOL', standing: 22 },
  { city: 'Ironhold', name: 'Anvils', abbr: 'IRH', standing: 14 },
];

const ROWS: Record<FootballLevel, Row[]> = {
  'hs-small': HS_SMALL,
  'hs-big': HS_BIG,
  juco: JUCO,
  'college-small': COLLEGE_SMALL,
  'college-big': COLLEGE_BIG,
  semipro: SEMIPRO,
  pro: PRO,
};

/* ---------------------------------------------------------------- colours
 *
 * Generated from the club's own id so that every team in a seventy-club world
 * has a look without seventy hand-picked pairs, and so the same club is the
 * same colour in every save. The palettes are kept dark enough to wear as a
 * home kit and far enough apart that two clubs on one field never blur.
 */
const PRIMARIES = [
  '#1d3f8f', '#8f1d24', '#1d6b3f', '#5a2d8f', '#8f5a1d', '#0f4f5c',
  '#7a1d5a', '#2d5a1d', '#1d2d5a', '#6b2a1d', '#3f3f8f', '#8f7a1d',
];
const SECONDARIES = [
  '#f0c419', '#e8e2d4', '#f07c19', '#a8d8ff', '#ffe9a8', '#c4f0d8',
  '#ffb8d8', '#d8f0a8', '#c8c8ff', '#ffd0b8', '#e8e8f8', '#fff0b8',
];

function colourFor(id: string): { primary: string; secondary: string } {
  const rng = new Rng(`fb:colour:${id}`);
  const p = PRIMARIES[rng.int(0, PRIMARIES.length - 1)];
  let s = SECONDARIES[rng.int(0, SECONDARIES.length - 1)];
  // Never a kit whose trim disappears into its own shirt.
  if (s === p) s = SECONDARIES[0];
  return { primary: p, secondary: s };
}

const STADIUM_WORDS = ['Field', 'Stadium', 'Bowl', 'Park', 'Coliseum', 'Grounds'];

function identityFor(id: string, standing: number): Identity {
  const rng = new Rng(`fb:identity:${id}`);
  const pool: Identity[] = standing > 70
    ? ['balanced', 'air', 'speed', 'physical', 'defence', 'ground']
    : ['ground', 'defence', 'physical', 'balanced', 'air', 'speed'];
  return pool[rng.int(0, pool.length - 1)];
}

/** Which conference a club sits in, which is just the half of the table it is in. */
function conferenceFor(level: FootballLevel, index: number, total: number): string {
  return `${level}:${index < total / 2 ? 'north' : 'south'}`;
}

export const CONFERENCE_LABEL: Record<string, string> = {
  north: 'Northern',
  south: 'Southern',
};

let cache: WorldTeam[] | null = null;

/** Every club in the world, built once. */
export function allTeams(): WorldTeam[] {
  if (cache) return cache;
  const out: WorldTeam[] = [];
  for (const level of LEVEL_ORDER) {
    const rows = ROWS[level];
    rows.forEach((row, i) => {
      const id = `${level}:${row.abbr.toLowerCase()}`;
      const colours = colourFor(id);
      const rng = new Rng(`fb:team:${id}`);
      out.push({
        id,
        city: row.city,
        name: row.name,
        abbr: row.abbr,
        primary: colours.primary,
        secondary: colours.secondary,
        stadium: `${row.city} ${STADIUM_WORDS[rng.int(0, STADIUM_WORDS.length - 1)]}`,
        conference: conferenceFor(level, i, rows.length),
        prestige: 1 + Math.round((row.standing / 99) * 4),
        level,
        conferenceId: conferenceFor(level, i, rows.length),
        standing: row.standing,
        /* RECRUITING IS NOT THE SAME AS BEING GOOD. A programme with a name can
         * pull players it has no business pulling, and one that wins with
         * nobody is the most interesting job on the board. */
        recruiting: clamp(row.pull ?? row.standing + rng.range(-12, 12), 3, 99),
        coaching: clamp(row.standing + rng.range(-16, 10), 3, 99),
        identity: identityFor(id, row.standing),
        par: teamPar(level, row.standing),
      });
    });
  }
  cache = out;
  return out;
}

export const teamsAtLevel = (level: FootballLevel): WorldTeam[] =>
  allTeams().filter((t) => t.level === level);

export function worldTeam(id: string): WorldTeam | null {
  return allTeams().find((t) => t.id === id) ?? null;
}

/**
 * A CLUB'S ROSTER FOR A GIVEN YEAR, derived rather than stored.
 *
 * The seed is the club and the year, so the same club has the same squad every
 * time anybody asks — a schedule screen, a simulated result and a game you
 * actually play all see identical players — and none of it takes a byte of save
 * file. The coach's OWN roster is the one thing that is stored, because it is
 * the only one he changes.
 */
export function rosterFor(team: WorldTeam, year: number): Player[] {
  const info = LEVELS[team.level];
  return buildRoster(`${team.id}:${year}`, {
    par: team.par,
    spread: 11,
  }).slice(0, Math.max(22, info.rosterSize));
}

/** The squad shape a club at this level should be carrying. */
export const squadShape = shapeFor;

/** Every team, sorted strongest first within a level. */
export function ladder(level: FootballLevel): WorldTeam[] {
  return teamsAtLevel(level).sort((a, b) => b.standing - a.standing);
}
