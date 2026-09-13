import { clamp } from '../../core/math';
import { Rng } from '../../core/rng';

/* ---------------------------------------------------------------------------
 * TEAMS, PLAYERS AND WHAT MAKES THEM GOOD
 * ---------------------------------------------------------------------------
 * An original league. The cities are real places, the clubs are not: the names,
 * colours, arenas and every player in them are invented for this game.
 *
 * The attributes are basketball's own, and they are not lacrosse's with the
 * labels changed. There is no goalkeeping and no faceoff; there is height, which
 * decides contests, rebounds and blocks in a sport played around a ten-foot rim;
 * there is a handle, because a player who cannot dribble cannot bring the ball up;
 * and shooting splits into three separate skills, because the gap between a
 * player who can finish at the rim and one who can shoot from twenty-five feet is
 * the single most important thing about a modern roster.
 *
 * Everything here is DATA. Adding a team is adding a row; adding a player is
 * adding a row. No gameplay code reads a team id or a player name.
 * ------------------------------------------------------------------------- */

export type HoopsPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export const POSITIONS: HoopsPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export const POSITION_LABEL: Record<HoopsPosition, string> = {
  PG: 'Point guard',
  SG: 'Shooting guard',
  SF: 'Small forward',
  PF: 'Power forward',
  C: 'Centre',
};

export interface HoopsAttrs {
  /** Mid-range shooting. */
  shooting: number;
  /** From beyond the arc. */
  three: number;
  /** Layups, dunks and everything at the rim. */
  finishing: number;
  freeThrow: number;
  /** Ball control: dribbling under pressure, and how hard you are to strip. */
  handle: number;
  /** Vision and delivery. */
  passing: number;
  speed: number;
  strength: number;
  /** Leaping, which is rebounding and blocking. */
  vertical: number;
  /** Guarding the perimeter, and staying in front of a drive. */
  perimeterD: number;
  /** Guarding the paint. */
  interiorD: number;
  steal: number;
  block: number;
  rebounding: number;
  /** Decisions: shot selection, help timing, not throwing it away. */
  iq: number;
  stamina: number;
}

export type AttrKey = keyof HoopsAttrs;

export const ATTR_LABEL: Record<AttrKey, string> = {
  shooting: 'Mid-range',
  three: 'Three-point',
  finishing: 'Finishing',
  freeThrow: 'Free throw',
  handle: 'Handle',
  passing: 'Passing',
  speed: 'Speed',
  strength: 'Strength',
  vertical: 'Vertical',
  perimeterD: 'Perimeter D',
  interiorD: 'Interior D',
  steal: 'Steal',
  block: 'Block',
  rebounding: 'Rebounding',
  iq: 'Basketball IQ',
  stamina: 'Stamina',
};

/**
 * What each position is judged on. A centre who cannot shoot from twenty-five
 * feet is not a bad centre; a point guard who cannot handle it is a bad point
 * guard. The weights say so.
 */
const WEIGHTS: Record<HoopsPosition, Partial<Record<AttrKey, number>>> = {
  PG: {
    handle: 3.0, passing: 3.0, speed: 2.2, three: 2.0, shooting: 1.6,
    finishing: 1.2, iq: 2.2, perimeterD: 1.6, steal: 1.4, freeThrow: 0.8, stamina: 1.0,
  },
  SG: {
    three: 3.0, shooting: 2.4, handle: 1.8, speed: 1.8, finishing: 1.6,
    perimeterD: 1.8, iq: 1.4, passing: 1.2, steal: 1.2, freeThrow: 0.9, stamina: 1.0,
  },
  SF: {
    three: 2.2, shooting: 2.0, finishing: 2.2, speed: 1.6, strength: 1.4,
    perimeterD: 2.0, rebounding: 1.4, iq: 1.6, handle: 1.4, passing: 1.2, stamina: 1.0,
  },
  PF: {
    finishing: 2.6, rebounding: 2.6, interiorD: 2.4, strength: 2.2, shooting: 1.6,
    three: 1.2, vertical: 1.8, block: 1.4, iq: 1.4, stamina: 1.0,
  },
  C: {
    finishing: 2.6, rebounding: 3.0, interiorD: 3.0, block: 2.4, strength: 2.4,
    vertical: 1.8, shooting: 0.8, iq: 1.2, stamina: 1.0,
  },
};

export function attrKeysFor(pos: HoopsPosition): AttrKey[] {
  return Object.keys(WEIGHTS[pos]) as AttrKey[];
}

export function computeOverall(pos: HoopsPosition, a: HoopsAttrs): number {
  const w = WEIGHTS[pos];
  let sum = 0;
  let total = 0;
  for (const [key, weight] of Object.entries(w) as [AttrKey, number][]) {
    sum += a[key] * weight;
    total += weight;
  }
  return Math.round(sum / Math.max(1, total));
}

export interface HoopsPlayer {
  id: string;
  first: string;
  last: string;
  pos: HoopsPosition;
  number: number;
  /** Inches. Kept in inches because that is how basketball says it: 6'7" is 79. */
  heightIn: number;
  attrs: HoopsAttrs;
  overall: number;
  /** Years in the league, which is what experience means here. */
  years: number;
}

export const shortName = (p: HoopsPlayer): string => `${p.first[0]}. ${p.last}`;
export const fullName = (p: HoopsPlayer): string => `${p.first} ${p.last}`;
export const heightText = (inches: number): string =>
  `${Math.floor(inches / 12)}'${inches % 12}"`;

/* -------------------------------------------------------------------- league */

export interface HoopsTeam {
  id: string;
  city: string;
  /** The club name. */
  name: string;
  abbr: string;
  primary: string;
  secondary: string;
  arena: string;
  conference: 'East' | 'West';
  /**
   * 1..5. Drives how strong a generated roster is, so the league has a real
   * pecking order rather than twelve identical teams.
   */
  prestige: number;
}

export const TEAMS: HoopsTeam[] = [
  { id: 'atl', city: 'Atlas City', name: 'Ironworks', abbr: 'ATL', primary: '#c9452f', secondary: '#f2d6a0', arena: 'The Foundry', conference: 'East', prestige: 5 },
  { id: 'bkl', city: 'Brookline', name: 'Bricklayers', abbr: 'BKL', primary: '#2f4f8f', secondary: '#e8ecf5', arena: 'Kiln Street Arena', conference: 'East', prestige: 4 },
  { id: 'cvt', city: 'Covington', name: 'Current', abbr: 'CVT', primary: '#1f8f8a', secondary: '#0d2a29', arena: 'Riverworks', conference: 'East', prestige: 3 },
  { id: 'har', city: 'Harborough', name: 'Longshoremen', abbr: 'HAR', primary: '#3a3f4a', secondary: '#ffb547', arena: 'Pier Nine', conference: 'East', prestige: 3 },
  { id: 'mfd', city: 'Marshfield', name: 'Harriers', abbr: 'MFD', primary: '#6b3fa0', secondary: '#e4d8f5', arena: 'The Marsh', conference: 'East', prestige: 2 },
  { id: 'pnr', city: 'Pinewood', name: 'Rivermen', abbr: 'PNR', primary: '#2b6b3f', secondary: '#d8e8c8', arena: 'Timberhall', conference: 'East', prestige: 2 },
  { id: 'sde', city: 'Sandelle', name: 'Sunfire', abbr: 'SDE', primary: '#e07b2a', secondary: '#3a1d05', arena: 'Solar Yard', conference: 'West', prestige: 5 },
  { id: 'gvc', city: 'Grand Verde', name: 'Coyotes', abbr: 'GVC', primary: '#8a6b2f', secondary: '#f0e4c0', arena: 'Mesa Center', conference: 'West', prestige: 4 },
  { id: 'nrp', city: 'North Peak', name: 'Alpine', abbr: 'NRP', primary: '#4a7fb5', secondary: '#f4f8fb', arena: 'The Summit', conference: 'West', prestige: 3 },
  { id: 'kvl', city: 'Kestrel Valley', name: 'Falcons', abbr: 'KVL', primary: '#9c2f4a', secondary: '#f5dbe2', arena: 'Aerie Court', conference: 'West', prestige: 3 },
  { id: 'saw', city: 'Saltwater', name: 'Mariners', abbr: 'SAW', primary: '#1f5f8f', secondary: '#cfe8f5', arena: 'The Breakwater', conference: 'West', prestige: 2 },
  { id: 'ddc', city: 'Dry Dock', name: 'Steelheads', abbr: 'DDC', primary: '#5a6570', secondary: '#c9d6e0', arena: 'Dock Nine', conference: 'West', prestige: 2 },
];

export const teamById = (id: string): HoopsTeam =>
  TEAMS.find((t) => t.id === id) ?? TEAMS[0];

export const teamLabel = (t: HoopsTeam): string => `${t.city} ${t.name}`;

/* ---------------------------------------------------------------- generation */

const FIRST = [
  'Marcus', 'Theo', 'Dario', 'Jalen', 'Kwame', 'Emil', 'Rondell', 'Casey', 'Isiah',
  'Malachi', 'Tobias', 'Amare', 'Dominic', 'Reggie', 'Silas', 'Anton', 'Deshawn',
  'Nikolai', 'Bruno', 'Ezra', 'Terrell', 'Otis', 'Mateo', 'Damien', 'Grant',
  'Joaquin', 'Kelvin', 'Roman', 'Saul', 'Vince', 'Wendell', 'Yusuf', 'Zeke',
  'Elias', 'Omari', 'Trey', 'Lorenzo', 'Rashad', 'Bennett', 'Caleb',
];

const LAST = [
  'Abbott', 'Okafor', 'Vance', 'Brightman', 'Calloway', 'Duplessis', 'Eastwick',
  'Falkner', 'Greaves', 'Holloway', 'Iverson', 'Jennings', 'Kowalczyk', 'Lindgren',
  'Mbeki', 'Nakamura', 'Ortega', 'Prentice', 'Quill', 'Ravenel', 'Sandoval',
  'Thibodeaux', 'Ulrich', 'Voss', 'Whitlock', 'Ximenes', 'Yeboah', 'Zabala',
  'Ashworth', 'Beaumont', 'Castellan', 'Draper', 'Ferreira', 'Gustafsson',
  'Hargrove', 'Ilunga', 'Jankowski', 'Kettering', 'Larkin', 'Mortimer',
];

/** Typical height by position, in inches, and how much it varies. */
const HEIGHT: Record<HoopsPosition, [mean: number, sd: number]> = {
  PG: [74, 1.8], SG: [77, 1.8], SF: [79, 1.8], PF: [81, 1.7], C: [83, 1.8],
};

/**
 * An archetype within a position, so a roster is not five copies of an average.
 * A shooting big and a rim-running big are both centres and play nothing alike.
 */
interface Archetype {
  label: string;
  /** Attribute nudges, in rating points. */
  bias: Partial<Record<AttrKey, number>>;
}

const ARCHETYPES: Record<HoopsPosition, Archetype[]> = {
  PG: [
    { label: 'Floor general', bias: { passing: 10, iq: 9, three: -3, finishing: -3 } },
    { label: 'Scoring guard', bias: { three: 9, shooting: 7, passing: -5, iq: -2 } },
    { label: 'Pest', bias: { steal: 12, perimeterD: 10, speed: 6, three: -6, shooting: -4 } },
  ],
  SG: [
    { label: 'Sharpshooter', bias: { three: 12, freeThrow: 8, handle: -4, interiorD: -5 } },
    { label: 'Slasher', bias: { finishing: 11, speed: 8, three: -7, shooting: -2 } },
    { label: 'Two-way wing', bias: { perimeterD: 10, steal: 6, three: 3, handle: -3 } },
  ],
  SF: [
    { label: 'Stretch wing', bias: { three: 10, shooting: 6, rebounding: -4, interiorD: -4 } },
    { label: 'Point forward', bias: { passing: 11, handle: 8, iq: 6, three: -4 } },
    { label: 'Wing stopper', bias: { perimeterD: 12, strength: 6, steal: 5, three: -6 } },
  ],
  PF: [
    { label: 'Stretch four', bias: { three: 14, shooting: 8, interiorD: -6, rebounding: -4 } },
    { label: 'Bruiser', bias: { strength: 11, rebounding: 9, interiorD: 7, three: -12, speed: -4 } },
    { label: 'Rim runner', bias: { finishing: 10, vertical: 10, speed: 5, three: -10 } },
  ],
  C: [
    { label: 'Anchor', bias: { interiorD: 12, block: 11, rebounding: 8, finishing: -3, speed: -4 } },
    { label: 'Post scorer', bias: { finishing: 11, strength: 8, shooting: 5, block: -4 } },
    { label: 'Modern five', bias: { three: 16, shooting: 10, passing: 6, interiorD: -6, strength: -5 } },
  ],
};

/** Base attribute means, before position and archetype shape them. */
function baseAttrs(rng: Rng, pool: number, pos: HoopsPosition): HoopsAttrs {
  const n = (offset = 0, sd = 6.5): number =>
    clamp(Math.round(rng.gauss(pool + offset, sd)), 25, 99);
  const big = pos === 'C' || pos === 'PF';
  const guard = pos === 'PG' || pos === 'SG';
  return {
    shooting: n(guard ? 3 : big ? -8 : 0),
    three: n(guard ? 5 : big ? -14 : 1),
    finishing: n(big ? 6 : 0),
    freeThrow: n(guard ? 4 : big ? -6 : 0),
    handle: n(guard ? 10 : big ? -16 : 0),
    passing: n(pos === 'PG' ? 12 : big ? -9 : 1),
    speed: n(guard ? 8 : big ? -9 : 2),
    strength: n(big ? 10 : guard ? -8 : 0),
    vertical: n(big ? 3 : 2),
    perimeterD: n(guard ? 7 : big ? -11 : 2),
    interiorD: n(big ? 12 : guard ? -13 : -2),
    steal: n(guard ? 6 : -2),
    block: n(big ? 11 : guard ? -13 : -3),
    rebounding: n(big ? 14 : guard ? -14 : -1),
    iq: n(0, 7.5),
    stamina: n(2, 7),
  };
}

export interface GeneratedTeam {
  team: HoopsTeam;
  roster: HoopsPlayer[];
}

/**
 * Build a team's roster from a seed. Same seed, same roster — the whole league is
 * reproducible, which is what lets the balance harnesses mean anything.
 */
export function generateRoster(team: HoopsTeam, seed: number | string): HoopsPlayer[] {
  const rng = new Rng(`hoops:${team.id}:${seed}`);
  // Prestige is the pecking order: the best club's rotation is roughly fifteen
  // rating points above the worst one's, which is about a real league's spread.
  const pool = 52 + team.prestige * 3.4;
  const used = new Set<number>();
  const names = new Set<string>();
  const roster: HoopsPlayer[] = [];

  // Ten players: a starting five and a five-man bench, which is the rotation a
  // game actually uses.
  const slots: HoopsPosition[] = ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SG', 'SF', 'PF', 'C'];

  slots.forEach((pos, i) => {
    const starter = i < 5;
    // Bench players are worse, and the drop is real: a thin bench should hurt.
    const tier = starter ? rng.range(3.5, 9) : rng.range(-11, -2.5);
    const attrs = baseAttrs(rng, pool + tier, pos);

    const arch = rng.pick(ARCHETYPES[pos]);
    for (const [key, delta] of Object.entries(arch.bias) as [AttrKey, number][]) {
      attrs[key] = clamp(attrs[key] + delta, 25, 99);
    }

    const [hm, hsd] = HEIGHT[pos];
    const heightIn = Math.round(clamp(rng.gauss(hm, hsd), 68, 88));
    // Height is not an attribute the player sets, but it feeds the ones it
    // should: a taller man rebounds, blocks and defends the paint better.
    const tall = (heightIn - hm) / 4;
    attrs.rebounding = clamp(Math.round(attrs.rebounding + tall * 3), 25, 99);
    attrs.block = clamp(Math.round(attrs.block + tall * 3), 25, 99);
    attrs.interiorD = clamp(Math.round(attrs.interiorD + tall * 2), 25, 99);
    attrs.speed = clamp(Math.round(attrs.speed - tall * 1.5), 25, 99);

    let num = rng.int(0, 55);
    while (used.has(num)) num = rng.int(0, 55);
    used.add(num);

    let first = rng.pick(FIRST);
    let last = rng.pick(LAST);
    let guard = 0;
    while (names.has(`${first} ${last}`) && guard++ < 40) {
      first = rng.pick(FIRST);
      last = rng.pick(LAST);
    }
    names.add(`${first} ${last}`);

    roster.push({
      id: `h${rng.int(0, 0x7fff_ffff).toString(36)}${rng.int(0, 0x7fff_ffff).toString(36)}`,
      first, last, pos, number: num, heightIn, attrs,
      overall: computeOverall(pos, attrs),
      years: rng.int(0, 14),
    });
  });

  // Best first inside each position, so the starting five really is the best five.
  return roster;
}

/** The five who start: the best player at each position. */
export function starters(roster: HoopsPlayer[]): HoopsPlayer[] {
  return POSITIONS.map((pos) => {
    const atPos = roster.filter((p) => p.pos === pos).sort((a, b) => b.overall - a.overall);
    return atPos[0] ?? roster[0];
  });
}

export function bench(roster: HoopsPlayer[]): HoopsPlayer[] {
  const five = new Set(starters(roster).map((p) => p.id));
  return roster.filter((p) => !five.has(p.id)).sort((a, b) => b.overall - a.overall);
}

/** A team's ratings, derived from the five who play. Never stored. */
export interface HoopsRatings {
  overall: number;
  offense: number;
  defense: number;
  shooting: number;
  inside: number;
  rebounding: number;
  ballHandling: number;
  /** Average of the whole rotation, so a thin bench shows up. */
  depth: number;
}

export function teamRatings(roster: HoopsPlayer[]): HoopsRatings {
  const five = starters(roster);
  const avg = (f: (p: HoopsPlayer) => number, list = five): number =>
    Math.round(list.reduce((n, p) => n + f(p), 0) / Math.max(1, list.length));
  return {
    overall: avg((p) => p.overall),
    offense: avg((p) => (p.attrs.shooting + p.attrs.three + p.attrs.finishing
      + p.attrs.passing) / 4),
    defense: avg((p) => (p.attrs.perimeterD + p.attrs.interiorD + p.attrs.steal
      + p.attrs.block) / 4),
    shooting: avg((p) => (p.attrs.three * 2 + p.attrs.shooting) / 3),
    inside: avg((p) => (p.attrs.finishing + p.attrs.interiorD + p.attrs.strength) / 3),
    rebounding: avg((p) => p.attrs.rebounding),
    ballHandling: avg((p) => (p.attrs.handle + p.attrs.passing + p.attrs.iq) / 3),
    depth: avg((p) => p.overall, roster),
  };
}

/** The whole league, generated once from one seed. */
export function generateLeague(seed: number | string): GeneratedTeam[] {
  return TEAMS.map((team) => ({ team, roster: generateRoster(team, seed) }));
}
