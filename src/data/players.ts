import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import type { Position } from './constants';
import type { GameTeam } from './teams';
import { LEVELS, bandFor, type Level } from './levels';
import { levelSpanOf } from './levelSpan';
import { FIRST_NAMES, LAST_NAMES } from './names';
import { officialRoster, type OfficialPlayer, type RosterSource } from './rosters';
import { CURVES, CURVE_ORDER, archetype, archetypesFor, type DevCurve } from './archetypes';

export interface PlayerAttrs {
  speed: number;
  acceleration: number;
  stamina: number;
  passing: number;
  shooting: number;
  shotPower: number;
  shotAccuracy: number;
  dodging: number;
  defense: number;
  checking: number;
  faceoff: number;
  goalie: number;
  awareness: number;
}

export type Grade = 9 | 10 | 11 | 12;
export const GRADE_LABEL: Record<Grade, string> = {
  9: 'Fr', 10: 'So', 11: 'Jr', 12: 'Sr',
};

export interface PlayerStats {
  gamesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnGoal: number;
  groundBalls: number;
  turnovers: number;
  causedTurnovers: number;
  saves: number;
  goalsAgainst: number;
  faceoffWins: number;
  faceoffTakes: number;
}

export const emptyStats = (): PlayerStats => ({
  gamesPlayed: 0, goals: 0, assists: 0, shots: 0, shotsOnGoal: 0, groundBalls: 0,
  turnovers: 0, causedTurnovers: 0, saves: 0, goalsAgainst: 0, faceoffWins: 0, faceoffTakes: 0,
});

export function addStats(a: PlayerStats, b: PlayerStats): PlayerStats {
  const out = {} as PlayerStats;
  for (const k of Object.keys(a) as (keyof PlayerStats)[]) out[k] = a[k] + b[k];
  return out;
}

/** One offseason in a player's development, kept so a career has a record. */
export interface DevYear {
  year: number;
  from: number;
  to: number;
  outcome: string;
  note: string;
}

/**
 * The part of a player that decides how he grows. Every generated player has
 * one; it is hidden from the coach until scouting or a season of coaching
 * reveals it, which is what makes a recruiting decision a real bet.
 */
export interface DevProfile {
  /** Key into data/archetypes.ts. */
  archetype: string;
  curve: DevCurve;
  /** 0..1 hidden multiplier on how reliably he reaches his ceiling. */
  workRate: number;
  /** Filled in every offseason. */
  history: DevYear[];
}

export interface PlayerData {
  id: string;
  first: string;
  last: string;
  /** 'official' means the NAME, NUMBER, POSITION and GRADE come from a public
   *  roster. Ratings are generated in both cases — see data/rosters.ts. */
  source: RosterSource;
  number: number;
  pos: Position;
  grade: Grade;
  attrs: PlayerAttrs;
  overall: number;
  /** Ceiling this player can develop toward. */
  potential: number;
  /** Development points banked in dynasty mode. */
  xp: number;
  season: PlayerStats;
  career: PlayerStats;
  /** How this player develops. Absent on saves written before it existed. */
  dev?: DevProfile;
  /** An active development project, from the roster hub. */
  project?: string | null;
}

const WEIGHTS: Record<Position, Partial<Record<keyof PlayerAttrs, number>>> = {
  A: { shooting: 0.22, shotAccuracy: 0.15, dodging: 0.18, passing: 0.12, speed: 0.11, shotPower: 0.09, awareness: 0.13 },
  M: { speed: 0.17, stamina: 0.14, passing: 0.14, shooting: 0.13, dodging: 0.11, defense: 0.11, awareness: 0.12, acceleration: 0.08 },
  D: { defense: 0.28, checking: 0.24, awareness: 0.16, speed: 0.14, stamina: 0.1, passing: 0.08 },
  G: { goalie: 0.56, awareness: 0.24, passing: 0.1, acceleration: 0.1 },
  FO: { faceoff: 0.46, checking: 0.16, speed: 0.14, stamina: 0.12, awareness: 0.12 },
};

/** The attributes that actually move a player's overall at this position. */
export function positionKeys(pos: Position): (keyof PlayerAttrs)[] {
  return Object.keys(WEIGHTS[pos]) as (keyof PlayerAttrs)[];
}

export function computeOverall(pos: Position, a: PlayerAttrs): number {
  const w = WEIGHTS[pos];
  let sum = 0;
  let total = 0;
  for (const key of Object.keys(w) as (keyof PlayerAttrs)[]) {
    const weight = w[key]!;
    sum += a[key] * weight;
    total += weight;
  }
  return Math.round(sum / total);
}

/* --------------------------------------------------------------- superstars */

/**
 * Star tiers. Calibrated against the actual generated distribution (npm run
 * ratings): across the league's 800 players, ~4.6% reach 86 and ~1% reach 90,
 * so a star is roughly one per squad and an elite player is a handful in the
 * whole district — rare enough that the mark means something.
 */
export const STAR_OVERALL = 86;
export const ELITE_OVERALL = 90;

export type StarTier = 0 | 1 | 2;

export function starTier(overall: number): StarTier {
  if (overall >= ELITE_OVERALL) return 2;
  if (overall >= STAR_OVERALL) return 1;
  return 0;
}

export const STAR_LABEL: Record<StarTier, string> = { 0: '', 1: 'Star', 2: 'Elite' };

export function fullName(p: PlayerData): string {
  return `${p.first} ${p.last}`;
}
export function shortName(p: PlayerData): string {
  return `${p.first[0]}. ${p.last}`;
}

/** Base attribute means for a position, expressed as offsets from the pool rating. */
const POS_PROFILE: Record<Position, Partial<Record<keyof PlayerAttrs, number>>> = {
  A: { shooting: +8, shotAccuracy: +7, shotPower: +5, dodging: +9, passing: +4, defense: -16, checking: -14, faceoff: -12, goalie: -30, stamina: -3 },
  M: { stamina: +9, speed: +4, passing: +3, shooting: +1, dodging: +2, defense: +1, checking: -1, faceoff: -4, goalie: -30 },
  D: { defense: +11, checking: +12, awareness: +5, shooting: -18, shotAccuracy: -16, dodging: -12, faceoff: -8, goalie: -28, stamina: +2 },
  G: { goalie: +26, awareness: +10, speed: -10, dodging: -18, shooting: -20, checking: -10, faceoff: -14, stamina: -4 },
  FO: { faceoff: +24, checking: +7, stamina: +4, shooting: -10, shotAccuracy: -9, dodging: -5, goalie: -30 },
};

/** Which team rating feeds each position group, in within-level terms. */
function rawPool(team: GameTeam, pos: Position): number {
  switch (pos) {
    case 'A': return team.attack;
    case 'M': return team.midfield;
    case 'D': return team.defense;
    case 'G': return team.goalie;
    case 'FO': return team.faceoff;
  }
}

/**
 * The absolute attribute pool for a position group. High school ratings ARE the
 * player scale; every level above maps its own range onto a higher band, which
 * is the single mechanism that makes a step up the ladder a genuine step up.
 */
function poolRating(team: GameTeam, pos: Position, level: Level): number {
  return bandFor(level, rawPool(team, pos), levelSpanOf(level));
}

const ATTR_KEYS: (keyof PlayerAttrs)[] = [
  'speed', 'acceleration', 'stamina', 'passing', 'shooting', 'shotPower', 'shotAccuracy',
  'dodging', 'defense', 'checking', 'faceoff', 'goalie', 'awareness',
];

export const ATTR_LABEL: Record<keyof PlayerAttrs, string> = {
  speed: 'Speed', acceleration: 'Accel', stamina: 'Stamina', passing: 'Passing',
  shooting: 'Shooting', shotPower: 'Power', shotAccuracy: 'Accuracy', dodging: 'Dodge',
  defense: 'Defense', checking: 'Check', faceoff: 'Faceoff', goalie: 'Goalie', awareness: 'IQ',
};

interface GenOpts {
  /** Depth chart slot: 0 = best on the line, higher = deeper. */
  depth: number;
  grade?: Grade;
  /** Supplied when the identity comes from a public roster. */
  first?: string;
  last?: string;
  number?: number;
  source?: RosterSource;
  /** Extra ceiling, earned by a programme that develops players well. */
  potentialBonus?: number;
  /** Which tier of the sport this player belongs to. Defaults to high school. */
  level?: Level;
}

/**
 * Compresses the top of the scale so the best programmes produce excellent
 * players rather than a roster of identical 99s. The knee sits near the top of
 * the level's own band: without that, every professional would be squashed back
 * into the high school range and the whole ladder would collapse.
 */
function softCap(v: number, level: Level): number {
  const band = LEVELS[level].band;
  const knee = band ? band.lo + (band.hi - band.lo) * 0.72 : 82;
  return v <= knee ? v : knee + (v - knee) * 0.42;
}

function makeAttrs(
  rng: Rng, team: GameTeam, pos: Position, opts: GenOpts, lean?: Partial<Record<keyof PlayerAttrs, number>>,
): PlayerAttrs {
  const level = opts.level ?? 'hs';
  // Depth costs less the higher you go: a professional bench is not a drop-off
  // the way a high school third line is.
  const depthStep = LEVELS[level].ageSystem === 'hs' ? 5.5 : LEVELS[level].ageSystem === 'college' ? 3.6 : 2.4;
  const base = poolRating(team, pos, level) - opts.depth * depthStep;
  const profile = POS_PROFILE[pos];
  const speedBias = (team.speed - 72) * 0.35;
  const attrs = {} as PlayerAttrs;
  for (const key of ATTR_KEYS) {
    // The archetype leans the profile: a sniper and a dodger are built from the
    // same pool but are not the same attackman.
    const off = (profile[key] ?? 0) + (lean?.[key] ?? 0);
    let v = base + off + rng.gauss(0, 5.5);
    if (key === 'speed' || key === 'acceleration') v += speedBias;
    attrs[key] = Math.round(clamp(softCap(v, level), 25, 99));
  }
  return attrs;
}

/**
 * Picks an archetype and a development curve. The curve is weighted, not
 * uniform: most players are steady, a fifth are late bloomers, and one in ten
 * is boom-or-bust — rare enough that finding one matters.
 */
export function makeDevProfile(rng: Rng, pos: Position): DevProfile {
  const options = archetypesFor(pos);
  const arch = options.length ? rng.pick(options).key : 'steady';
  let roll = rng.next();
  let curve: DevCurve = 'steady';
  for (const c of CURVE_ORDER) {
    roll -= CURVES[c].weight;
    if (roll <= 0) { curve = c; break; }
  }
  return { archetype: arch, curve, workRate: rng.range(0.55, 1), history: [] };
}

/** Backfills a development profile on a player from an older save. */
export function ensureDevProfile(p: PlayerData, rng: Rng): DevProfile {
  if (!p.dev) p.dev = makeDevProfile(rng, p.pos);
  return p.dev;
}

let uid = 0;
function nextId(): string {
  return `p${(++uid).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function generatePlayer(
  rng: Rng, team: GameTeam, pos: Position, opts: GenOpts, usedNumbers: Set<number>,
): PlayerData {
  const level = opts.level ?? 'hs';
  const grade: Grade = opts.grade ?? (rng.pick([9, 10, 10, 11, 11, 11, 12, 12, 12, 12]) as Grade);
  // Younger players are rawer but have more room to grow. A professional roster
  // ages the other way: a rookie is raw, a veteran is finished and starting to
  // slide, so the penalty curve flattens and the ceilings close.
  const pro = LEVELS[level].ageSystem === 'pro';
  const youthPenalty = pro
    ? { 9: 5, 10: 2, 11: 0, 12: 1 }[grade]
    : { 9: 9, 10: 5, 11: 2, 12: 0 }[grade];
  const dev = makeDevProfile(rng, pos);
  const attrs = makeAttrs(rng, team, pos, opts, archetype(dev.archetype)?.lean);
  for (const k of ATTR_KEYS) attrs[k] = Math.round(clamp(attrs[k] - youthPenalty, 25, 99));

  const overall = computeOverall(pos, attrs);
  // A programme known for developing players attracts recruits with more in
  // them, which is the only way a small programme ever climbs. Rooms narrow as
  // the level rises: nobody arrives in the PLL with fifteen points of upside.
  const roomBase = pro
    ? { 9: 8, 10: 5, 11: 3, 12: 1 }[grade]
    : LEVELS[level].ageSystem === 'college'
      ? { 9: 13, 10: 10, 11: 6, 12: 2 }[grade]
      : { 9: 16, 10: 12, 11: 7, 12: 3 }[grade];
  // The curve moves the ceiling as well as the timing: a late bloomer is worth
  // more than he looks, an early developer is worth roughly what he looks.
  const curveRoom = { early: 0.6, steady: 1, late: 1.45, 'boom-bust': 1.7 }[dev.curve];
  const growthRoom = (roomBase + (opts.potentialBonus ?? 0)) * curveRoom;
  const potential = Math.round(clamp(overall + rng.range(2, Math.max(3, growthRoom)), overall, 99));

  let number = 0;
  if (opts.number !== undefined && !usedNumbers.has(opts.number)) number = opts.number;
  const preferred = pos === 'G' ? [1, 30, 31, 33, 35] : pos === 'D' ? [2, 3, 4, 5, 6, 40, 44] : [];
  if (number === 0) {
    for (const n of rng.shuffle([...preferred])) {
      if (!usedNumbers.has(n)) { number = n; break; }
    }
  }
  while (number === 0) {
    const n = rng.int(1, 49);
    if (!usedNumbers.has(n)) number = n;
  }
  usedNumbers.add(number);

  return {
    dev,
    project: null,
    id: nextId(),
    first: opts.first ?? rng.pick(FIRST_NAMES),
    last: opts.last ?? rng.pick(LAST_NAMES),
    source: opts.source ?? 'generated',
    number,
    pos,
    grade,
    attrs,
    overall,
    potential,
    xp: 0,
    season: emptyStats(),
    career: emptyStats(),
  };
}

/** Roster shape: 4 attack, 7 midfield, 6 defense, 2 goalies, 1 faceoff specialist. */
export const ROSTER_SHAPE: { pos: Position; count: number }[] = [
  { pos: 'A', count: 4 },
  { pos: 'M', count: 7 },
  { pos: 'D', count: 6 },
  { pos: 'G', count: 2 },
  { pos: 'FO', count: 1 },
];

/** Squads get deeper as the level rises, which is half of why they are harder. */
const LEVEL_SHAPE: Partial<Record<Level, { pos: Position; count: number }[]>> = {
  d3: [{ pos: 'A', count: 5 }, { pos: 'M', count: 9 }, { pos: 'D', count: 8 }, { pos: 'G', count: 3 }, { pos: 'FO', count: 1 }],
  d2: [{ pos: 'A', count: 5 }, { pos: 'M', count: 9 }, { pos: 'D', count: 8 }, { pos: 'G', count: 3 }, { pos: 'FO', count: 1 }],
  d1: [{ pos: 'A', count: 6 }, { pos: 'M', count: 10 }, { pos: 'D', count: 8 }, { pos: 'G', count: 3 }, { pos: 'FO', count: 2 }],
  semipro: [{ pos: 'A', count: 5 }, { pos: 'M', count: 8 }, { pos: 'D', count: 6 }, { pos: 'G', count: 2 }, { pos: 'FO', count: 1 }],
  pll: [{ pos: 'A', count: 5 }, { pos: 'M', count: 7 }, { pos: 'D', count: 5 }, { pos: 'G', count: 2 }, { pos: 'FO', count: 1 }],
};

export function rosterShape(level: Level): { pos: Position; count: number }[] {
  return LEVEL_SHAPE[level] ?? ROSTER_SHAPE;
}

export const ROSTER_SIZE = ROSTER_SHAPE.reduce((n, s) => n + s.count, 0);

/** Splits a published "First Last" name without mangling suffixes or initials. */
function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/**
 * Builds a team's roster. If a public roster has been imported for this team,
 * the real names, numbers, positions and grades are used and only the RATINGS
 * are generated. Otherwise the whole squad is fictional. Either way the squad
 * is filled out to ROSTER_SHAPE so the match engine always has a full team.
 */
export function generateRoster(
  team: GameTeam, seed: number | string, level: Level = 'hs',
): PlayerData[] {
  const rng = new Rng(`${team.id}:${seed}`);
  const used = new Set<number>();
  const roster: PlayerData[] = [];
  const official = officialRoster(team.id);
  const shape = rosterShape(level);

  // Bucket any imported players by position so they fill their own slots first.
  const pool = new Map<Position, OfficialPlayer[]>();
  if (official) {
    for (const p of official.players) {
      const pos = p.position ?? 'M';
      const list = pool.get(pos) ?? [];
      list.push(p);
      pool.set(pos, list);
    }
  }

  for (const { pos, count } of shape) {
    const listed = pool.get(pos) ?? [];
    for (let i = 0; i < count; i++) {
      const real = listed[i];
      if (real) {
        const { first, last } = splitName(real.name);
        roster.push(generatePlayer(rng, team, pos, {
          depth: i, grade: real.grade, first, last, number: real.number, source: 'official', level,
        }, used));
      } else {
        roster.push(generatePlayer(rng, team, pos, { depth: i, level }, used));
      }
    }
  }
  return sortDepthChart(roster);
}

const POS_ORDER: Position[] = ['A', 'M', 'D', 'G', 'FO'];

/** Order a roster by position group then by overall, so index 0 of each group starts. */
export function sortDepthChart(roster: PlayerData[]): PlayerData[] {
  return [...roster].sort((a, b) => {
    const pa = POS_ORDER.indexOf(a.pos);
    const pb = POS_ORDER.indexOf(b.pos);
    if (pa !== pb) return pa - pb;
    return b.overall - a.overall;
  });
}

/** The ten who take the field: 1 G, 3 D, 3 M, 3 A. The FOGO takes a midfield
 *  spot for faceoffs. A thin roster is padded from whoever is left so a damaged
 *  save can never produce a team with holes in it. */
export function starters(roster: PlayerData[]): PlayerData[] {
  const sorted = sortDepthChart(roster);
  const take = (pos: Position, n: number) => sorted.filter((p) => p.pos === pos).slice(0, n);
  const picked = [...take('G', 1), ...take('D', 3), ...take('M', 3), ...take('A', 3)];
  if (picked.length >= 10) return picked;
  const spare = sorted.filter((p) => !picked.includes(p));
  while (picked.length < 10 && spare.length) picked.push(spare.shift()!);
  while (picked.length < 10 && sorted.length) picked.push(sorted[picked.length % sorted.length]);
  return picked;
}

export function faceoffMan(roster: PlayerData[]): PlayerData {
  const fo = roster.filter((p) => p.pos === 'FO' || p.pos === 'M');
  fo.sort((a, b) => b.attrs.faceoff - a.attrs.faceoff);
  return fo[0] ?? roster[0];
}

/** Recompute overall after attribute changes (development, training). */
export function refreshOverall(p: PlayerData): void {
  p.overall = computeOverall(p.pos, p.attrs);
}

export const ATTR_KEYS_ORDER = ATTR_KEYS;
