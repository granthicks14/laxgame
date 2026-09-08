/* ---------------------------------------------------------------------------
 * SCOUTS
 * ---------------------------------------------------------------------------
 * You do not scout players. Your people do, and they are not interchangeable.
 *
 * A scout has a SPECIALTY (a position group or a part of the country), a
 * QUALITY (how fast and how accurately he works) and a TRAIT that changes what
 * he is actually good for. A cheap regional scout who knows every club coach in
 * Maryland will find you a defenceman nobody else has heard of; he will tell
 * you nothing useful about a goalie in California.
 *
 * Scouts cost Coach Points every season, which is the same currency that buys
 * your staff and your development projects. That is the whole budget problem: a
 * programme that scouts brilliantly is a programme that coaches worse, unless
 * it is winning enough to afford both.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import type { Position } from '../data/constants';
import { POSITION_LABEL } from '../data/constants';
import { LEVELS, type Level } from '../data/levels';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import type { Prospect } from './prospects';

export type ScoutTrait = 'gems' | 'thorough' | 'connected' | 'regional' | 'evaluator';

export interface TraitInfo {
  label: string;
  blurb: string;
}

export const TRAITS: Record<ScoutTrait, TraitInfo> = {
  gems: {
    label: 'Eye for a sleeper',
    blurb: 'Finds the player the rankings missed. Slower on everyone else.',
  },
  thorough: {
    label: 'Thorough',
    blurb: 'Works a prospect faster than anyone. No particular instinct for talent.',
  },
  connected: {
    label: 'Connected',
    blurb: 'Knows the families. Everyone he watches warms to your programme.',
  },
  regional: {
    label: 'Regional man',
    blurb: 'Owns his patch. Outside it he is guessing like everybody else.',
  },
  evaluator: {
    label: 'Pure evaluator',
    blurb: 'His reports are the ones you can trust. He is not fast.',
  },
};

export type Specialty = Position | 'all';

export interface Scout {
  id: string;
  name: string;
  specialty: Specialty;
  /** 1..5. Drives both speed and how quickly the error bars close. */
  quality: number;
  trait: ScoutTrait;
  /** Coach Points per season. */
  salary: number;
  /** Prospect this scout is currently working, or null if idle. */
  assignedTo: string | null;
}

export function specialtyLabel(s: Specialty): string {
  return s === 'all' ? 'National' : `${POSITION_LABEL[s]}s`;
}

const QUALITY_LABEL = ['', 'Volunteer', 'Part-time', 'Full-time', 'Regarded', 'Elite'];

export function qualityLabel(q: number): string {
  return QUALITY_LABEL[clamp(Math.round(q), 1, 5)];
}

/** What a scout would cost. Steep at the top: an elite scout is a real choice. */
function salaryFor(quality: number, trait: ScoutTrait): number {
  const base = [0, 3, 6, 9, 13, 19][clamp(Math.round(quality), 1, 5)];
  return base + (trait === 'gems' || trait === 'evaluator' ? 2 : 0);
}

/**
 * The pool of scouts willing to work for a programme at this level. A high
 * school cannot hire a national scout with an eye for sleepers; a Division I
 * programme can, if it will pay for him.
 */
export function scoutMarket(seed: string, level: Level, prestige: number, count = 6): Scout[] {
  const rng = new Rng(seed);
  const ceiling = level === 'hs' ? 3
    : level === 'd3' ? 4
      : LEVELS[level].ageSystem === 'pro' ? 5 : 5;
  const floor = level === 'hs' ? 1 : 2;
  const out: Scout[] = [];
  const traits: ScoutTrait[] = ['gems', 'thorough', 'connected', 'regional', 'evaluator'];
  const specialties: Specialty[] = ['all', 'A', 'M', 'D', 'G', 'FO'];

  for (let i = 0; i < count; i++) {
    // Prestige opens the top of the market rather than making scouts cheaper.
    const lift = prestige > 75 ? 1 : prestige > 55 ? 0.5 : 0;
    const quality = clamp(Math.round(rng.range(floor, ceiling + 0.99) + lift), 1, ceiling);
    const trait = rng.pick(traits);
    const specialty = i === 0 ? 'all' : rng.pick(specialties);
    out.push({
      id: `sc-${seed}-${i}`,
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      specialty,
      quality,
      trait,
      salary: salaryFor(quality, trait),
      assignedTo: null,
    });
  }
  return out;
}

/**
 * How much of a prospect one scout uncovers in a week, 0..100 scale.
 * A specialist on his own position group works roughly twice as fast as a
 * generalist, which is why a staff of three narrow scouts beats one good one.
 */
export function weeklyProgress(scout: Scout, p: Prospect): number {
  // A scout watches a prospect several times a week. A good one has a full read
  // inside a month and a half, which has to be true or the class closes before
  // anybody has learned anything.
  let rate = 6 + scout.quality * 3.4;
  if (scout.specialty === p.player.pos) rate *= 1.75;
  else if (scout.specialty !== 'all') rate *= 0.45;
  if (scout.trait === 'thorough') rate *= 1.35;
  if (scout.trait === 'evaluator') rate *= 0.8;
  if (scout.trait === 'gems') rate *= p.gem ? 1.9 : 0.75;
  if (scout.trait === 'regional') rate *= 1.15;
  return rate;
}

/** Interest a scout builds simply by being around the family. */
export function weeklyRapport(scout: Scout): number {
  if (scout.trait === 'connected') return 1.6 + scout.quality * 0.35;
  return 0.25 + scout.quality * 0.1;
}

/**
 * A scout's read is not perfectly honest. A poor scout's report drifts; an
 * evaluator's does not. This shrinks the prospect's stored noise as he works,
 * which is what makes a good scout's estimate worth more than a bad one's.
 */
export function noiseDecay(scout: Scout): number {
  const base = 0.955 - scout.quality * 0.012;
  return scout.trait === 'evaluator' ? base - 0.05 : base;
}

/** Total salary of a hired staff. */
export function scoutingBill(scouts: Scout[]): number {
  return scouts.reduce((n, s) => n + s.salary, 0);
}
