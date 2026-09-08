/* ---------------------------------------------------------------------------
 * PROSPECTS AND FOG OF WAR
 * ---------------------------------------------------------------------------
 * A recruiting class is not a shop window with the prices printed on it. Every
 * prospect has a TRUE player underneath — real attributes, a real ceiling, a
 * real development curve — and the coach cannot see any of it.
 *
 * What the coach sees is two things:
 *
 *   HYPE      the public ranking. Every programme in the country sees the same
 *             number, and it is WRONG, in both directions, by an amount nobody
 *             can measure from the outside.
 *   SCOUTING  what your own people have actually seen. As a prospect's
 *             `scouted` figure climbs, your estimate slides off the public
 *             ranking and onto the truth, and the error bars close.
 *
 * That gap is the entire game. A HIDDEN GEM is a player whose hype sits well
 * below his ceiling — invisible unless you spend scouting on him, and gone the
 * moment somebody else works it out. An OVERRATED prospect is the same mistake
 * in the other direction, and signing one costs you a scholarship and a year.
 *
 * Nothing here is cosmetic: `estimateOf` is what every screen renders, and the
 * true player is only ever revealed when he signs and walks onto your roster.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import type { Position } from '../data/constants';
import { POSITION_LABEL } from '../data/constants';
import {
  ATTR_LABEL, computeOverall, generatePlayer,
  type PlayerAttrs, type PlayerData,
} from '../data/players';
import {
  CURVES, TIERS, archetype, profileLine, tierFor,
  type DevCurve, type PotentialTier,
} from '../data/archetypes';
import { LEVELS, type Level } from '../data/levels';
import type { GameTeam } from '../data/teams';

/** Where a prospect is coming from, which decides what he is called. */
export type ProspectOrigin = 'hs' | 'juco' | 'portal' | 'club' | 'draft' | 'undrafted';

export const ORIGIN_LABEL: Record<ProspectOrigin, string> = {
  hs: 'High school',
  juco: 'Junior college',
  portal: 'Transfer portal',
  club: 'Club / unattached',
  draft: 'Draft class',
  undrafted: 'Undrafted free agent',
};

export interface Suitor {
  teamId: string;
  /** 0..100 — how hard they are chasing him. */
  push: number;
}

export interface Prospect {
  id: string;
  /** The truth. Never rendered directly — always go through estimateOf(). */
  player: PlayerData;
  origin: ProspectOrigin;
  hometown: string;
  /** Public ranking on the overall scale. Wrong, sometimes badly. */
  hype: number;
  /** Rank inside the class by hype, 1 = the consensus number one. */
  nationalRank: number;
  /** 0..100 — how much your own programme has seen of him. */
  scouted: number;
  /** Fixed per prospect so an estimate never jitters between renders. */
  noise: number;
  /** True when his ceiling is well above his ranking. Hidden until scouted. */
  gem: boolean;
  /** True when his ranking is well above his ceiling. Hidden until scouted. */
  overrated: boolean;
  /** 0..100 interest in YOUR programme. */
  interest: number;
  offered: boolean;
  /** Everyone else chasing him. Grows as the class goes on. */
  suitors: Suitor[];
  /** Set once he picks somewhere. Your own id means you signed him. */
  committedTo: string | null;
  /** On the coach's board. Only tracked prospects can be assigned a scout. */
  tracked: boolean;
  /** Things your scouts have actually reported, newest last. */
  notes: string[];
}

/* -------------------------------------------------------------- generation */

const TOWNS = [
  'Dallas', 'Plano', 'Frisco', 'McKinney', 'Southlake', 'Allen', 'Highland Park', 'Denton',
  'Baltimore', 'Annapolis', 'Towson', 'Bethesda', 'Long Island', 'Yorktown', 'Garden City',
  'Syracuse', 'Rochester', 'Fairfield', 'Darien', 'New Canaan', 'Summit', 'Moorestown',
  'Philadelphia', 'Radnor', 'Bethlehem', 'Boston', 'Duxbury', 'Needham', 'Denver', 'Boulder',
  'Salt Lake City', 'Atlanta', 'Charlotte', 'Tampa', 'Chicago', 'Columbus', 'Ann Arbor',
  'Los Angeles', 'San Diego', 'Seattle', 'Portland', 'Austin', 'Houston',
];

/** Positions a class is built from, roughly in the proportion a squad needs. */
const CLASS_SHAPE: Position[] = ['A', 'A', 'M', 'M', 'M', 'M', 'D', 'D', 'D', 'G', 'FO'];

/** The par overall for a level, used for ceilings and for reading a report. */
export function levelPar(level: Level): number {
  const band = LEVELS[level].band;
  return band ? (band.lo + band.hi) / 2 : 62;
}

export interface ClassOptions {
  level: Level;
  /** Drives how good the class is at the top. */
  size: number;
  origin: ProspectOrigin;
  /** A shell team whose ratings set the pool the class is drawn from. */
  shell: GameTeam;
}

/**
 * Builds one recruiting class. The hype figure is generated LAST, from the
 * truth plus an error — which is exactly how a real ranking goes wrong. Most
 * errors are small; a few are large, and those are the gems and the busts.
 */
export function buildClass(seed: string, opts: ClassOptions): Prospect[] {
  const rng = new Rng(seed);
  const out: Prospect[] = [];
  const used = new Set<number>();
  const par = levelPar(opts.level);

  for (let i = 0; i < opts.size; i++) {
    const pos = CLASS_SHAPE[i % CLASS_SHAPE.length];
    // Depth spreads the class from blue-chip down to project. The best of a
    // class is a long way above the worst, which is what makes it a class.
    const depth = (i / Math.max(1, opts.size - 1)) * 7;

    // A HIDDEN GEM is not a player who is slightly better than his ranking. He
    // is a player who belongs at the top of the class and is ranked in the
    // middle of it, because nobody has seen him. So the truth is generated from
    // a much better slot than his ranking, and the ranking is generated from a
    // SHADOW player at the slot he was actually ranked in — which is exactly
    // the mistake a ranking service makes. Overrated prospects are the same
    // error pointing the other way.
    // Where in the rankings a mistake is likely: nobody "hides" at number one,
    // and nobody is overrated at number twenty-eight. Gems live at the back of
    // the class, busts at the front.
    const place = i / Math.max(1, opts.size - 1);
    const gemChance = 0.015 + place * 0.14;
    const bustChance = 0.13 - place * 0.1;
    const roll = rng.next();
    const gem = roll < gemChance;
    const overrated = !gem && roll < gemChance + bustChance;
    const trueDepth = gem ? depth * 0.18 : overrated ? depth * 1.4 + 2.6 : depth;

    const player = generatePlayer(rng, opts.shell, pos, {
      depth: trueDepth,
      grade: 9,
      level: opts.level,
      potentialBonus: gem ? rng.range(2, 6) : rng.range(0, 3),
    }, used);

    // What a ranking service thinks he is, built from where he was ranked.
    const shadow = gem || overrated
      ? generatePlayer(rng, opts.shell, pos, { depth, grade: 9, level: opts.level }, new Set<number>())
      : player;
    const seen = shadow.potential * 0.55 + shadow.overall * 0.45;
    const hype = Math.round(clamp(seen + rng.gauss(0, 4.5), 25, 99));

    out.push({
      id: `pr-${seed}-${i}`,
      player,
      origin: opts.origin,
      hometown: rng.pick(TOWNS),
      hype,
      nationalRank: 0,
      scouted: 0,
      noise: rng.range(-1, 1),
      gem,
      overrated,
      interest: Math.round(clamp(rng.gauss(22, 12), 0, 55)),
      offered: false,
      suitors: [],
      committedTo: null,
      tracked: false,
      notes: [],
    });
  }

  out.sort((a, b) => b.hype - a.hype);
  out.forEach((p, i) => { p.nationalRank = i + 1; });
  void par;
  return out;
}

/* ------------------------------------------------------------- fog of war */

export interface Estimate {
  /** Best guess at what he is right now. */
  overall: number;
  /** Best guess at his ceiling. */
  potential: number;
  /** Plus or minus, in overall points. Zero means you know. */
  margin: number;
  /** Null until your scouts have watched him enough to say. */
  archetypeKey: string | null;
  curve: DevCurve | null;
  tier: PotentialTier | null;
  /** A one-line read, always safe to render. */
  line: string;
  /** 0..4 — how much of the picture you have, for the confidence pips. */
  confidence: number;
}

const REVEAL_ARCHETYPE = 30;
const REVEAL_TIER = 50;
const REVEAL_CURVE = 72;
const REVEAL_FULL = 92;

/**
 * What YOU can say about this prospect. At zero scouting it is the public
 * ranking and nothing else. Every point of scouting slides the estimate off the
 * ranking and toward the truth, and narrows the error bar around it.
 */
export function estimateOf(p: Prospect, par = 70): Estimate {
  const t = clamp(p.scouted / 100, 0, 1);
  const known = t * t * (3 - 2 * t); // smoothstep: early scouting tells you least
  const truthO = p.player.overall;
  const truthP = p.player.potential;

  const margin = Math.max(0, Math.round(13 * (1 - known)));
  const blendO = p.hype * (1 - known) + truthO * known;
  const blendP = p.hype * (1 - known) + truthP * known;
  const wobble = p.noise * margin * 0.55;

  const overall = Math.round(clamp(blendO + wobble, 20, 99));
  const potential = Math.round(clamp(Math.max(blendP + wobble, overall), 20, 99));

  const archetypeKey = p.scouted >= REVEAL_ARCHETYPE ? p.player.dev?.archetype ?? null : null;
  const tier = p.scouted >= REVEAL_TIER ? tierFor(truthP, par) : null;
  const curve = p.scouted >= REVEAL_CURVE ? p.player.dev?.curve ?? null : null;

  const confidence = p.scouted >= REVEAL_FULL ? 4
    : p.scouted >= REVEAL_CURVE ? 3
      : p.scouted >= REVEAL_TIER ? 2
        : p.scouted >= REVEAL_ARCHETYPE ? 1 : 0;

  const line = archetypeKey && tier
    ? profileLine(archetypeKey, curve ?? 'steady', tier)
    : archetypeKey
      ? archetype(archetypeKey)?.label ?? 'Unknown quantity'
      : 'Not yet scouted';

  return { overall, potential, margin, archetypeKey, curve, tier, line, confidence };
}

/** The one attribute range a report will show, per attribute. */
export function attrEstimate(p: Prospect, key: keyof PlayerAttrs): { value: number; margin: number } {
  const t = clamp(p.scouted / 100, 0, 1);
  const known = t * t * (3 - 2 * t);
  const margin = Math.max(0, Math.round(15 * (1 - known)));
  // Each attribute gets its own stable offset so the sheet does not look like
  // one number repeated with noise.
  const off = Math.sin(Rng.hash(`${p.id}:${key}`) % 1000) * margin * 0.6;
  const base = p.player.attrs[key] * known + (p.hype - 4) * (1 - known);
  return { value: Math.round(clamp(base + off, 20, 99)), margin };
}

/** True when your own scouts have seen enough to call the gap out loud. */
export function gemKnown(p: Prospect): boolean {
  return p.gem && p.scouted >= REVEAL_TIER;
}

export function bustKnown(p: Prospect): boolean {
  return p.overrated && p.scouted >= REVEAL_TIER;
}

/* ------------------------------------------------------------- the report */

/**
 * The written scouting report. It says only what your scouts have earned the
 * right to say, so an unscouted prospect reads as a rumour and a fully scouted
 * one reads as a file.
 */
export function scoutingReport(p: Prospect, par = 70): string[] {
  const est = estimateOf(p, par);
  const lines: string[] = [];
  const name = `${p.player.first} ${p.player.last}`;
  const posName = POSITION_LABEL[p.player.pos];

  if (p.scouted < 10) {
    lines.push(`${name} is a ${posName} out of ${p.hometown}. Ranked #${p.nationalRank} in the class.`);
    lines.push('Nobody from this programme has watched him play. Everything above is somebody else\'s opinion.');
    return lines;
  }

  lines.push(`${name}, ${posName}, ${p.hometown}. Consensus ranking #${p.nationalRank}.`);
  lines.push(`We have him around ${est.overall} now, ceiling ${est.potential}${est.margin ? ` (±${est.margin})` : ''}.`);

  const arch = est.archetypeKey ? archetype(est.archetypeKey) : null;
  if (arch) lines.push(`${arch.label}. ${arch.blurb}`);

  if (est.tier) lines.push(`Ceiling: ${TIERS[est.tier].label}.`);
  if (est.curve) lines.push(`${CURVES[est.curve].label}. ${CURVES[est.curve].blurb}`);

  if (gemKnown(p)) {
    lines.push(`He is ranked well below what we think he is. If we are right, he is the best value in this class — and word will get out.`);
  } else if (bustKnown(p)) {
    lines.push('The ranking is ahead of the player. We would be paying for a reputation.');
  }

  if (est.confidence >= 4) {
    const wr = p.player.dev?.workRate ?? 0.7;
    lines.push(wr > 0.85 ? 'First one in the building. He will get everything out of himself.'
      : wr < 0.65 ? 'Talented, but we would have to drag it out of him.'
        : 'Normal worker. Coachable.');
  }

  for (const n of p.notes.slice(-3)) lines.push(n);
  return lines;
}

/** The three attributes a scout would lead with, from what is known. */
export function reportHighlights(p: Prospect): { label: string; value: number; margin: number }[] {
  const keys = (Object.keys(p.player.attrs) as (keyof PlayerAttrs)[]);
  return keys
    .map((k) => ({ key: k, ...attrEstimate(p, k) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
    .map((a) => ({ label: ATTR_LABEL[a.key], value: a.value, margin: a.margin }));
}

/** Refresh a prospect's true overall after any change to his attributes. */
export function syncProspect(p: Prospect): void {
  p.player.overall = computeOverall(p.player.pos, p.player.attrs);
}
