/* ---------------------------------------------------------------------------
 * PLAYER DEVELOPMENT
 * ---------------------------------------------------------------------------
 * The old model gave everybody roughly +1 a year, which made a four-year
 * dynasty pointless: the freshman you recruited left about as good as he
 * arrived. Development now depends on the things that actually decide it.
 *
 *   GRADE          a ninth grader has years of growth in him; a senior does not
 *   ROOM           how far he is from his own ceiling
 *   PLAYING TIME   minutes and production, from the season he just played
 *   COACHING       your development and conditioning tracks
 *   LUCK           the same player can break out or stall
 *
 * Outcomes are banded so a season reads as a story rather than a number:
 * BREAKOUT, STRONG, NORMAL, LIMITED and, for older players at their ceiling,
 * REGRESSION. Nobody is guaranteed anything, and the ceiling is real — coaching
 * raises the odds of reaching it, never the ceiling itself.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import {
  ATTR_KEYS_ORDER, ensureDevProfile, positionKeys, refreshOverall,
  type Grade, type PlayerAttrs, type PlayerData,
} from '../data/players';
import { CURVES, archetype } from '../data/archetypes';
import { LEVELS, type Level } from '../data/levels';
import { project } from './projects';
import type { CoachEffects } from './coaching';

export type DevOutcome = 'breakout' | 'strong' | 'normal' | 'limited' | 'regression';

export const DEV_LABEL: Record<DevOutcome, string> = {
  breakout: 'Breakout season',
  strong: 'Strong development',
  normal: 'Normal development',
  limited: 'Limited development',
  regression: 'Stepped back',
};

export interface DevResult {
  player: PlayerData;
  from: number;
  to: number;
  outcome: DevOutcome;
  /** The attributes that moved most, for the report. */
  highlights: string[];
}

/** Games a player has to feature in before playing time counts as "a season". */
const FULL_SEASON_GAMES = 8;

/** Overall points a season of development is worth, before the dice. */
const BANDS: Record<DevOutcome, [number, number]> = {
  breakout: [4.5, 8],
  strong: [2.6, 4.5],
  normal: [1, 2.6],
  limited: [0, 1],
  regression: [-3, -1],
};

/**
 * Develops one player by a year. `focusKeys` are the attributes the season's
 * practice focus emphasised, which bias where the growth lands.
 *
 * Growth is expressed in OVERALL points and then pushed into the attributes
 * that actually decide a player's overall at his position. Spreading points at
 * random across all thirteen attributes is what made the old model produce
 * +1 a year no matter what: an attacking midfielder's goalie rating can climb
 * all it likes and he is no better a player.
 */
export function developPlayer(
  p: PlayerData, rng: Rng, fx: CoachEffects, focusKeys: (keyof PlayerAttrs)[],
  level: Level = 'hs',
): DevResult {
  const before = p.overall;
  const room = Math.max(0, p.potential - p.overall);
  const dev = ensureDevProfile(p, rng);
  const curve = CURVES[dev.curve];

  // Age curve, shaped by the player's own development curve. A late bloomer's
  // third year is when everything arrives; an early developer's first year is.
  const byGrade: Record<Grade, number> = { 9: 1.35, 10: 1.15, 11: 0.85, 12: 0.55 };
  const yearIndex = Math.min(3, Math.max(0, p.grade - 9));
  // Professionals do not have class years to improve through: a rookie improves,
  // a veteran holds and then slides, whatever curve he was drafted with.
  const pro = LEVELS[level].ageSystem === 'pro';
  const age = pro
    ? byGrade[p.grade] * 0.7
    : byGrade[p.grade] * curve.byYear[yearIndex];

  // Playing time: appearances and production both count. A player who never got
  // on the field does not develop like a starter, but he does not stall either.
  const games = p.season.gamesPlayed;
  const minutesFactor = clamp(0.55 + (games / FULL_SEASON_GAMES) * 0.55, 0.55, 1.15);
  const production = p.season.goals * 2 + p.season.assists * 1.6 + p.season.groundBalls * 0.5
    + p.season.causedTurnovers * 1.4 + p.season.saves * 0.35;
  const productionFactor = clamp(0.9 + production / 70, 0.9, 1.35);

  // Headroom. A player at his ceiling gains almost nothing, whoever coaches him.
  const roomFactor = clamp(room / 9, 0.1, 1.2);

  // Work rate is the hidden half of a prospect: two players with the same
  // ceiling do not both reach it.
  const scale = age * minutesFactor * productionFactor * roomFactor
    * fx.developmentRate * (0.7 + dev.workRate * 0.45);

  // The dice, spread by his curve. A boom-or-bust player's season is a much
  // wider distribution than a steady one's — that is the whole bet.
  const roll = clamp(0.5 + (rng.next() - 0.5) * curve.variance, 0, 0.999);
  const breakoutChance = clamp(0.07 * fx.breakoutRate * age * roomFactor, 0.01, 0.32);
  const strongChance = breakoutChance + clamp(0.24 * fx.developmentRate, 0.12, 0.46);

  let outcome: DevOutcome;
  if (roll < breakoutChance) outcome = 'breakout';
  else if (roll < strongChance) outcome = 'strong';
  else if (roll < strongChance + 0.44) outcome = 'normal';
  else outcome = 'limited';

  // Regression: only for upperclassmen at their ceiling who barely played. It
  // should be uncommon and always explicable.
  const stagnant = room <= 1 && p.grade >= 11 && games < FULL_SEASON_GAMES / 2;
  if (stagnant && rng.next() < 0.3) outcome = 'regression';

  const [lo, hi] = BANDS[outcome];
  let gain = rng.range(lo, hi) * (outcome === 'regression' ? 1 : scale);
  // Never blow past the ceiling in one summer; a point of overshoot is fine.
  if (gain > 0) gain = Math.min(gain, room + 1);

  // A development project concentrates the year into named attributes and
  // suppresses everything else — the tradeoff the coach signed up for.
  const proj = project(p.project);
  const archLean = archetype(dev.archetype)?.grows ?? [];
  const emphasis = proj ? (proj.focus.length ? proj.focus : positionKeys(p.pos)) : [...focusKeys, ...archLean];
  const narrow = !!proj && proj.focus.length > 0;
  if (proj) gain *= proj.focus.length ? 1.22 : 1.05;

  const highlights = applyGrowth(p, gain, rng, fx, emphasis, narrow);
  refreshOverall(p);
  if (p.overall > p.potential) {
    const excess = p.overall - p.potential;
    for (const k of ATTR_KEYS_ORDER) p.attrs[k] = clamp(p.attrs[k] - excess, 1, 99);
    refreshOverall(p);
  }

  dev.history.push({
    year: dev.history.length + 1,
    from: before,
    to: p.overall,
    outcome,
    note: proj ? proj.label : DEV_LABEL[outcome],
  });
  if (dev.history.length > 12) dev.history.shift();
  // A project is a one-season commitment; it has to be renewed.
  p.project = null;

  return { player: p, from: before, to: p.overall, outcome, highlights };
}

/**
 * Moves a player's overall by roughly `gain` points. The attributes that carry
 * weight at his position all move together — that is what an overall IS — with
 * the practice focus and conditioning deciding which of them move most, and a
 * couple of unrelated attributes drifting for texture.
 */
function applyGrowth(
  p: PlayerData, gain: number, rng: Rng, fx: CoachEffects, focusKeys: (keyof PlayerAttrs)[],
  narrow = false,
): string[] {
  if (Math.abs(gain) < 0.05) return [];
  const core = positionKeys(p.pos);
  const athletic: (keyof PlayerAttrs)[] = ['speed', 'acceleration', 'stamina'];
  const before: Record<string, number> = {};
  for (const k of ATTR_KEYS_ORDER) before[k] = p.attrs[k];

  for (const k of core) {
    // Everything that matters moves by the gain, give or take; emphasised
    // attributes move more, so two players with the same jump still develop
    // differently.
    let mul = rng.range(0.7, 1.3);
    if (focusKeys.includes(k)) mul *= 1.35;
    // Under a project, anything outside it barely moves. That is the cost.
    else if (narrow) mul *= 0.25;
    if (fx.athleticGrowth > 0.35 && athletic.includes(k)) mul *= 1 + fx.athleticGrowth * 0.5;
    p.attrs[k] = clamp(Math.round(p.attrs[k] + gain * mul), 1, 99);
  }

  // A little movement outside the core, so a player is not only his position.
  const others = ATTR_KEYS_ORDER.filter((k) => !core.includes(k));
  for (const k of rng.shuffle(others).slice(0, 3)) {
    p.attrs[k] = clamp(Math.round(p.attrs[k] + gain * rng.range(0.2, 0.6)), 1, 99);
  }

  return ATTR_KEYS_ORDER
    .filter((k) => p.attrs[k] !== before[k])
    .sort((a, b) => Math.abs(p.attrs[b] - before[b]) - Math.abs(p.attrs[a] - before[a]))
    .slice(0, 3);
}
