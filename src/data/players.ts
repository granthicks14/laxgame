import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import type { Position } from './constants';
import type { TeamData } from './teams';
import { FIRST_NAMES, LAST_NAMES } from './names';

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

export interface PlayerData {
  id: string;
  first: string;
  last: string;
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
}

const WEIGHTS: Record<Position, Partial<Record<keyof PlayerAttrs, number>>> = {
  A: { shooting: 0.22, shotAccuracy: 0.15, dodging: 0.18, passing: 0.12, speed: 0.11, shotPower: 0.09, awareness: 0.13 },
  M: { speed: 0.17, stamina: 0.14, passing: 0.14, shooting: 0.13, dodging: 0.11, defense: 0.11, awareness: 0.12, acceleration: 0.08 },
  D: { defense: 0.28, checking: 0.24, awareness: 0.16, speed: 0.14, stamina: 0.1, passing: 0.08 },
  G: { goalie: 0.56, awareness: 0.24, passing: 0.1, acceleration: 0.1 },
  FO: { faceoff: 0.46, checking: 0.16, speed: 0.14, stamina: 0.12, awareness: 0.12 },
};

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

/** Which team rating feeds each position group. */
function poolRating(team: TeamData, pos: Position): number {
  switch (pos) {
    case 'A': return team.attack;
    case 'M': return team.midfield;
    case 'D': return team.defense;
    case 'G': return team.goalie;
    case 'FO': return team.faceoff;
  }
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
}

/** Compresses the top of the scale so the best programs produce excellent
 *  players rather than a roster of identical 99s. */
function softCap(v: number): number {
  const knee = 82;
  return v <= knee ? v : knee + (v - knee) * 0.42;
}

function makeAttrs(rng: Rng, team: TeamData, pos: Position, opts: GenOpts): PlayerAttrs {
  const base = poolRating(team, pos) - opts.depth * 5.5;
  const profile = POS_PROFILE[pos];
  const speedBias = (team.speed - 72) * 0.35;
  const attrs = {} as PlayerAttrs;
  for (const key of ATTR_KEYS) {
    const off = profile[key] ?? 0;
    let v = base + off + rng.gauss(0, 5.5);
    if (key === 'speed' || key === 'acceleration') v += speedBias;
    attrs[key] = Math.round(clamp(softCap(v), 25, 97));
  }
  return attrs;
}

let uid = 0;
function nextId(): string {
  return `p${(++uid).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function generatePlayer(
  rng: Rng, team: TeamData, pos: Position, opts: GenOpts, usedNumbers: Set<number>,
): PlayerData {
  const grade: Grade = opts.grade ?? (rng.pick([9, 10, 10, 11, 11, 11, 12, 12, 12, 12]) as Grade);
  // Underclassmen are rawer but have more room to grow.
  const youthPenalty = { 9: 9, 10: 5, 11: 2, 12: 0 }[grade];
  const attrs = makeAttrs(rng, team, pos, opts);
  for (const k of ATTR_KEYS) attrs[k] = Math.round(clamp(attrs[k] - youthPenalty, 25, 99));

  const overall = computeOverall(pos, attrs);
  const growthRoom = { 9: 16, 10: 12, 11: 7, 12: 3 }[grade];
  const potential = Math.round(clamp(overall + rng.range(2, growthRoom), overall, 99));

  let number = 0;
  const preferred = pos === 'G' ? [1, 30, 31, 33, 35] : pos === 'D' ? [2, 3, 4, 5, 6, 40, 44] : [];
  for (const n of rng.shuffle([...preferred])) {
    if (!usedNumbers.has(n)) { number = n; break; }
  }
  while (number === 0) {
    const n = rng.int(1, 49);
    if (!usedNumbers.has(n)) number = n;
  }
  usedNumbers.add(number);

  return {
    id: nextId(),
    first: rng.pick(FIRST_NAMES),
    last: rng.pick(LAST_NAMES),
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

export const ROSTER_SIZE = ROSTER_SHAPE.reduce((n, s) => n + s.count, 0);

export function generateRoster(team: TeamData, seed: number | string): PlayerData[] {
  const rng = new Rng(`${team.id}:${seed}`);
  const used = new Set<number>();
  const roster: PlayerData[] = [];
  for (const { pos, count } of ROSTER_SHAPE) {
    for (let i = 0; i < count; i++) {
      roster.push(generatePlayer(rng, team, pos, { depth: i }, used));
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
