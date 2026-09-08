/* ---------------------------------------------------------------------------
 * ARCHETYPES, DEVELOPMENT CURVES AND CEILINGS
 * ---------------------------------------------------------------------------
 * Two attackmen with the same overall are not the same player. One is a sniper
 * who needs a feeder; the other creates his own shot and drags a slide. This
 * file is the vocabulary the rest of the game uses to say which is which, and
 * it does three jobs:
 *
 *   ARCHETYPE   what kind of player he is. Biases his attributes at creation
 *               and biases where his growth lands every offseason.
 *   CURVE       WHEN he improves. An early developer is close to finished as a
 *               sophomore; a late bloomer looks ordinary for two years and then
 *               becomes the best player on the field. This is the single reason
 *               a scouting report can be right about the numbers and still be
 *               wrong about the player.
 *   TIER        how high his ceiling is, in words a coach would use.
 *
 * None of it is cosmetic: development.ts reads the curve and the archetype, the
 * scouting system hides them behind fog of war, and the recruiting board is a
 * bet on which of them you have correctly identified.
 * ------------------------------------------------------------------------- */

import type { Position } from './constants';
import type { PlayerAttrs } from './players';

export type DevCurve = 'early' | 'steady' | 'late' | 'boom-bust';

export interface CurveInfo {
  label: string;
  blurb: string;
  /** Growth multiplier by class year, freshman first. */
  byYear: [number, number, number, number];
  /** Spread on every year's growth roll. Boom-or-bust lives here. */
  variance: number;
  /** Share of a class that develops this way. */
  weight: number;
}

export const CURVES: Record<DevCurve, CurveInfo> = {
  early: {
    label: 'Early developer',
    blurb: 'Arrives close to finished. Contributes straight away and gains little after that.',
    byYear: [1.45, 1.15, 0.7, 0.45],
    variance: 0.8,
    weight: 0.26,
  },
  steady: {
    label: 'Steady',
    blurb: 'Improves a little every year. What you scout is roughly what you get.',
    byYear: [1.1, 1.05, 0.95, 0.8],
    variance: 0.9,
    weight: 0.42,
  },
  late: {
    label: 'Late bloomer',
    blurb: 'Looks ordinary for two years, then makes a jump nobody saw coming.',
    byYear: [0.55, 0.85, 1.5, 1.55],
    variance: 1.0,
    weight: 0.22,
  },
  'boom-bust': {
    label: 'Boom or bust',
    blurb: 'Enormous range. He is either a star or he never puts it together.',
    byYear: [1.2, 1.2, 1.05, 0.85],
    variance: 2.1,
    weight: 0.1,
  },
};

export const CURVE_ORDER: DevCurve[] = ['early', 'steady', 'late', 'boom-bust'];

/* ---------------------------------------------------------------- ceilings */

export type PotentialTier = 'depth' | 'rotation' | 'starter' | 'allconf' | 'allamerican' | 'generational';

export interface TierInfo {
  label: string;
  short: string;
  /** How far above the level's own par a ceiling has to sit to earn this. */
  above: number;
}

export const TIERS: Record<PotentialTier, TierInfo> = {
  depth: { label: 'Depth piece', short: 'DEP', above: -12 },
  rotation: { label: 'Rotation player', short: 'ROT', above: -5 },
  starter: { label: 'Future starter', short: 'ST', above: 2 },
  allconf: { label: 'All-conference ceiling', short: 'AC', above: 8 },
  allamerican: { label: 'All-American ceiling', short: 'AA', above: 14 },
  generational: { label: 'Generational talent', short: 'GEN', above: 20 },
};

export const TIER_ORDER: PotentialTier[] = [
  'depth', 'rotation', 'starter', 'allconf', 'allamerican', 'generational',
];

/** Which ceiling tier a potential belongs to, measured against a level's par. */
export function tierFor(potential: number, par: number): PotentialTier {
  let out: PotentialTier = 'depth';
  for (const t of TIER_ORDER) if (potential - par >= TIERS[t].above) out = t;
  return out;
}

/* -------------------------------------------------------------- archetypes */

export interface ArchetypeInfo {
  key: string;
  label: string;
  pos: Position;
  /** One line a scout would actually say. */
  blurb: string;
  /** Attribute offsets applied on top of the position profile. */
  lean: Partial<Record<keyof PlayerAttrs, number>>;
  /** Attributes his growth concentrates in. */
  grows: (keyof PlayerAttrs)[];
}

const A: ArchetypeInfo[] = [
  {
    key: 'sniper', label: 'Sniper', pos: 'A',
    blurb: 'Catches and finishes. Give him a feeder and he scores forty.',
    lean: { shotAccuracy: 7, shooting: 5, shotPower: 3, dodging: -6, passing: -3 },
    grows: ['shotAccuracy', 'shooting', 'shotPower'],
  },
  {
    key: 'dodger', label: 'Isolation dodger', pos: 'A',
    blurb: 'Creates his own shot and drags a slide every time he touches it.',
    lean: { dodging: 9, acceleration: 5, shooting: 2, shotAccuracy: -4, awareness: -2 },
    grows: ['dodging', 'acceleration', 'shooting'],
  },
  {
    key: 'feeder', label: 'Quarterback', pos: 'A',
    blurb: 'Sees the field from X and puts it where only his man can catch it.',
    lean: { passing: 10, awareness: 7, shooting: -5, shotPower: -4 },
    grows: ['passing', 'awareness'],
  },
  {
    key: 'crease', label: 'Crease finisher', pos: 'A',
    blurb: 'Lives inside. Not quick, but nobody is better within five yards.',
    lean: { shotAccuracy: 6, awareness: 5, speed: -6, dodging: -5, shotPower: 4 },
    grows: ['shotAccuracy', 'awareness'],
  },
];

const M: ArchetypeInfo[] = [
  {
    key: 'twoway', label: 'Two-way middie', pos: 'M',
    blurb: 'Never comes off. Wins his matchup at both ends without ever leading the stat sheet.',
    lean: { stamina: 8, defense: 6, checking: 4, shooting: -3 },
    grows: ['stamina', 'defense', 'awareness'],
  },
  {
    key: 'runner', label: 'Transition runner', pos: 'M',
    blurb: 'Turns a ground ball into a shot before the defence is set.',
    lean: { speed: 8, acceleration: 8, stamina: 4, defense: -4 },
    grows: ['speed', 'acceleration'],
  },
  {
    key: 'shooter', label: 'Outside shooter', pos: 'M',
    blurb: 'Steps into it from twelve yards and does not need a screen.',
    lean: { shotPower: 9, shooting: 6, shotAccuracy: 3, defense: -6, stamina: -2 },
    grows: ['shotPower', 'shooting', 'shotAccuracy'],
  },
  {
    key: 'grinder', label: 'Ground-ball grinder', pos: 'M',
    blurb: 'Wins the fifty-fifty ball and the game turns on it.',
    lean: { checking: 7, stamina: 6, awareness: 4, shooting: -5, dodging: -4 },
    grows: ['checking', 'stamina', 'awareness'],
  },
];

const D: ArchetypeInfo[] = [
  {
    key: 'lockdown', label: 'Lockdown pole', pos: 'D',
    blurb: 'Takes the other team\'s best player and erases him.',
    lean: { defense: 9, awareness: 6, speed: 3, passing: -4 },
    grows: ['defense', 'awareness'],
  },
  {
    key: 'takeaway', label: 'Takeaway defender', pos: 'D',
    blurb: 'Hunts the ball. Gambles, and mostly wins.',
    lean: { checking: 10, acceleration: 5, defense: -3, awareness: -3 },
    grows: ['checking', 'acceleration'],
  },
  {
    key: 'physical', label: 'Physical close D', pos: 'D',
    blurb: 'Nobody enjoys the eight minutes they spend against him.',
    lean: { checking: 7, defense: 5, stamina: 4, speed: -5 },
    grows: ['checking', 'defense'],
  },
  {
    key: 'cover', label: 'Cover pole', pos: 'D',
    blurb: 'Runs with midfielders and clears the ball himself.',
    lean: { speed: 8, passing: 6, stamina: 5, checking: -5 },
    grows: ['speed', 'passing', 'stamina'],
  },
];

const G: ArchetypeInfo[] = [
  {
    key: 'reflex', label: 'Reflex goalie', pos: 'G',
    blurb: 'Saves things he has no business saving, and lets in one a week he should have had.',
    lean: { goalie: 7, acceleration: 6, awareness: -6 },
    grows: ['goalie', 'acceleration'],
  },
  {
    key: 'positional', label: 'Positional goalie', pos: 'G',
    blurb: 'Always where the ball is going. Rarely spectacular, rarely beaten.',
    lean: { awareness: 9, goalie: 3, acceleration: -4 },
    grows: ['awareness', 'goalie'],
  },
  {
    key: 'outlet', label: 'Outlet goalie', pos: 'G',
    blurb: 'Starts the break the moment he has it. Your clear is a weapon.',
    lean: { passing: 12, awareness: 5, goalie: -3 },
    grows: ['passing', 'awareness'],
  },
];

const FO: ArchetypeInfo[] = [
  {
    key: 'clamp', label: 'Clamp specialist', pos: 'FO',
    blurb: 'Wins it clean to himself and the possession battle is over by halftime.',
    lean: { faceoff: 8, checking: 3, stamina: -3, speed: -4 },
    grows: ['faceoff'],
  },
  {
    key: 'athlete', label: 'Athletic FOGO', pos: 'FO',
    blurb: 'Loses the clamp and beats you to the ball anyway.',
    lean: { speed: 8, acceleration: 7, faceoff: -3, stamina: 4 },
    grows: ['speed', 'acceleration', 'faceoff'],
  },
  {
    key: 'wing', label: 'Wing-play FOGO', pos: 'FO',
    blurb: 'Ties it up and trusts his wings. Plays the whole possession.',
    lean: { checking: 8, awareness: 6, stamina: 5, faceoff: -4 },
    grows: ['checking', 'awareness', 'stamina'],
  },
];

export const ARCHETYPES: ArchetypeInfo[] = [...A, ...M, ...D, ...G, ...FO];

const BY_KEY = new Map(ARCHETYPES.map((a) => [a.key, a]));
const BY_POS = new Map<Position, ArchetypeInfo[]>();
for (const a of ARCHETYPES) {
  const list = BY_POS.get(a.pos) ?? [];
  list.push(a);
  BY_POS.set(a.pos, list);
}

export function archetypesFor(pos: Position): ArchetypeInfo[] {
  return BY_POS.get(pos) ?? [];
}

export function archetype(key: string): ArchetypeInfo | null {
  return BY_KEY.get(key) ?? null;
}

/** A short scouting-sheet line: "Late-blooming sniper, All-conference ceiling". */
export function profileLine(archetypeKey: string, curve: DevCurve, tier: PotentialTier): string {
  const a = archetype(archetypeKey);
  const name = a ? a.label : 'Player';
  const prefix = curve === 'late' ? 'Late-blooming '
    : curve === 'early' ? 'Early-maturing '
      : curve === 'boom-bust' ? 'Unpredictable ' : '';
  return `${prefix}${prefix ? name.toLowerCase() : name} · ${TIERS[tier].label}`;
}
