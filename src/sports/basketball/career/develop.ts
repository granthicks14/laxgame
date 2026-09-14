import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { computeOverall, type AttrKey, type HoopsPlayer } from '../data';
import { LEVELS, graduates, type HoopsLevel } from '../levels';
import type { CoachPerks } from './coach';
import type { TierMods } from './difficulty';
import type { HoopsDevelopment, StatLine } from './types';

/* ---------------------------------------------------------------------------
 * PLAYERS GET BETTER, OR THEY DO NOT
 * ---------------------------------------------------------------------------
 * The single system that makes a career worth running for twenty years rather
 * than one. A freshman you found in a gym nobody visits becomes, four years
 * later, the best player at the level — or he does not, because he did not play,
 * or he did not work, or he was never going to.
 *
 * SIX THINGS DECIDE IT, and none of them is a dice roll on its own:
 *
 *   HEADROOM     how far he is from his own ceiling. A player at his ceiling
 *                does not improve however well he is coached.
 *   AGE          a seventeen-year-old grows. A thirty-four-year-old declines,
 *                and no amount of coaching stops him.
 *   MINUTES      a player who did not play does not develop. This is the one the
 *                coach controls directly, and it is why burying a prospect on
 *                the bench for a year is a real cost.
 *   WORK         his own, and it is fixed at birth. Two players with the same
 *                ceiling and the same minutes do not come back the same.
 *   COACHING     what the coach has actually bought, and what he is good at: a
 *                shooting coach really does move shooting faster than everything
 *                else.
 *   PERFORMANCE  a player who produced when he played is a player who learned
 *                something from it.
 *
 * What comes out is one of five outcomes, and they are not a cosmetic label:
 * they are the bands the numbers landed in, and the report says which.
 * ------------------------------------------------------------------------- */

/** Which attributes each of the coach's specialist staff moves. */
const SHOOTING_FAMILY: AttrKey[] = ['shooting', 'three', 'freeThrow'];
const INSIDE_FAMILY: AttrKey[] = ['finishing', 'rebounding', 'interiorD', 'strength'];
const ATHLETIC_FAMILY: AttrKey[] = ['speed', 'vertical', 'stamina'];
const SKILL_FAMILY: AttrKey[] = ['handle', 'passing', 'iq', 'perimeterD', 'steal', 'block'];

export interface DevelopInput {
  roster: HoopsPlayer[];
  level: HoopsLevel;
  seed: number | string;
  perks: CoachPerks;
  mods: TierMods;
  /** Season lines, so minutes and production count. */
  season: Record<string, StatLine>;
  /** Games the team played, to turn minutes into a share. */
  games: number;
}

/**
 * Run a squad through an offseason. Mutates the players — a career's roster IS
 * these objects — and returns the report the coach reads.
 */
export function developSquad(input: DevelopInput): HoopsDevelopment[] {
  const rng = new Rng(`hoops:dev:${input.seed}`);
  const pro = !graduates(input.level);
  const out: HoopsDevelopment[] = [];

  for (const p of input.roster) {
    const before = p.overall;
    const line = input.season[p.id];
    const played = line?.games ?? 0;

    /* MINUTES. A share of what was available. A man who never got off the bench
     * learns almost nothing, which is the cost of not playing your young. */
    const availableSeconds = Math.max(1, input.games * 5 * 8 * 60);
    const share = clamp((line?.seconds ?? 0) / availableSeconds, 0, 1);
    /* The floor is practice: a player still trained all year, so he still
     * improves — slowly. Zero would make nine of the fourteen roster spots inert
     * for four straight seasons, which is not a cost, it is a dead system. But
     * the gradient from here to a starter is steep, and deliberately: burying a
     * prospect for a year is the most expensive thing a coach can do to him. */
    const minutes = played > 0 ? 0.35 + clamp(share * 9, 0, 1) * 0.65 : 0.2;

    /* AGE. The whole curve, and it is the only thing here that can be negative. */
    const age = p.age;
    const ageFactor = pro
      ? (age <= 22 ? 1.35 : age <= 25 ? 1.1 : age <= 28 ? 0.6
        : age <= 31 ? 0.1 : age <= 34 ? -0.55 : -1.1)
      : (p.years === 1 ? 1.4 : p.years === 2 ? 1.15 : p.years === 3 ? 0.85 : 0.55);

    /* HEADROOM. Nobody grows past his ceiling — except by exactly as much as the
     * coach has paid to raise it, which is what the top of the development
     * branch buys. */
    const ceiling = Math.min(99, p.potential + input.perks.ceilingLift);
    const headroom = Math.max(0, ceiling - p.overall);

    /* WORK, and what he did with his minutes. */
    const work = 0.6 + (p.work - 50) / 110;
    const production = line && line.games > 0
      ? clamp(0.85 + (line.points / Math.max(1, line.games) - 8) / 40, 0.8, 1.25)
      : 1;

    const coaching = input.perks.development * input.mods.development;

    // The size of the step, before it is spread across attributes.
    let step = headroom * 0.3 * minutes * work * production * coaching;
    if (ageFactor < 0) {
      // Decline is not headroom-limited: a veteran falls off whatever his ceiling.
      step = ageFactor * rng.range(1.2, 3.4) * (2 - coaching * 0.5);
    } else {
      step *= ageFactor;
      // The lottery: most players take the step the numbers say, a few do not.
      const breakoutChance = clamp(
        0.06 * input.perks.breakouts * input.mods.breakouts * minutes
        * (headroom > 8 ? 1.6 : 0.5),
        0, 0.4,
      );
      if (rng.bool(breakoutChance)) step *= rng.range(2.1, 3.2);
      else if (rng.bool(0.18)) step *= rng.range(0.15, 0.5);
      else step *= rng.range(0.85, 1.25);
    }

    /* ROUNDED WITHOUT LOSING THE REMAINDER. Plain rounding is what made a
     * reserve with five points of headroom immortal at his starting rating: his
     * step came to 0.4 every year, rounded to nothing every year, and four
     * seasons of work left him exactly where he began. A fractional step is a
     * chance of a point instead. */
    const delta = stochasticRound(step, rng);
    if (delta !== 0) applyGrowth(p, delta, input.perks, rng);

    p.overall = computeOverall(p.pos, p.attrs);
    if (delta > 0) p.overall = Math.min(p.overall, ceiling);

    const moved = p.overall - before;
    out.push({
      id: p.id,
      name: `${p.first} ${p.last}`,
      pos: p.pos,
      years: p.years,
      from: before,
      to: p.overall,
      outcome: outcomeOf(moved, headroom, played),
      label: labelOf(moved, p, pro),
    });
  }

  out.sort((a, b) => (b.to - b.from) - (a.to - a.from));
  return out;
}

/**
 * Spread a step across attributes until the OVERALL has actually moved by it.
 *
 * The first version of this handed out `delta * 3` attribute points and hoped.
 * It does not work: an overall is a WEIGHTED AVERAGE over the ten or so
 * attributes the position is judged on, so points sprinkled across all sixteen —
 * a centre's three-point rating included — mostly land somewhere that does not
 * count. A step the report proudly called "+3" moved a player by half a point,
 * and three years of development came to +0.3.
 *
 * So this is closed-loop: keep nudging until the rating the rest of the game
 * reads has moved by what was decided, or until it plainly cannot.
 */
function applyGrowth(p: HoopsPlayer, delta: number, perks: CoachPerks, rng: Rng): void {
  const weights: [AttrKey[], number][] = [
    [SHOOTING_FAMILY, 1 + perks.shootingGrowth],
    [INSIDE_FAMILY, 1 + perks.insideGrowth],
    [ATHLETIC_FAMILY, 1 + perks.athleticGrowth],
    [SKILL_FAMILY, 1],
  ];
  // A big man does not suddenly become a shooter, and a guard does not become a
  // rebounder: growth follows the position's own emphasis.
  const guard = p.pos === 'PG' || p.pos === 'SG';
  const big = p.pos === 'C' || p.pos === 'PF';
  if (guard) { weights[0][1] *= 1.3; weights[1][1] *= 0.6; }
  if (big) { weights[1][1] *= 1.3; weights[0][1] *= 0.7; }
  const total = weights.reduce((n, w) => n + w[1], 0);

  const sign = Math.sign(delta);
  const target = clamp(computeOverall(p.pos, p.attrs) + delta, 25, 99);
  let stuck = 0;
  for (let i = 0; i < 600; i++) {
    const now = computeOverall(p.pos, p.attrs);
    if (sign > 0 ? now >= target : now <= target) break;
    let r = rng.range(0, total);
    let family = SKILL_FAMILY;
    for (const [keys, w] of weights) {
      r -= w;
      if (r <= 0) { family = keys; break; }
    }
    const key = family[rng.int(0, family.length - 1)];
    const before = p.attrs[key];
    p.attrs[key] = clamp(before + sign, 25, 99);
    // Every attribute in every family pinned: nothing left to move.
    if (p.attrs[key] === before && ++stuck > 120) break;
  }
}

/** `2.4` is two points and a two-in-five chance of a third. */
function stochasticRound(n: number, rng: Rng): number {
  const whole = Math.trunc(n);
  const rest = Math.abs(n - whole);
  return whole + (rng.bool(rest) ? Math.sign(n) : 0);
}

function outcomeOf(
  moved: number, headroom: number, games: number,
): HoopsDevelopment['outcome'] {
  if (moved <= -2) return 'decline';
  if (moved >= 6) return 'breakout';
  if (moved >= 3) return 'strong';
  if (moved >= 1) return 'normal';
  if (headroom <= 2) return 'normal';
  return games === 0 ? 'limited' : 'limited';
}

function labelOf(moved: number, p: HoopsPlayer, pro: boolean): string {
  if (moved <= -4) return pro ? 'Falling away' : 'Went backwards';
  if (moved <= -1) return 'Slipped a little';
  if (moved === 0) return p.overall >= p.potential - 1 ? 'At his ceiling' : 'Stood still';
  if (moved >= 6) return 'Unrecognisable';
  if (moved >= 3) return 'A real step';
  return 'Steady progress';
}

/* ------------------------------------------------------------- the turnover */

export interface TurnoverResult {
  leaving: HoopsPlayer[];
  staying: HoopsPlayer[];
  reasons: Map<string, string>;
}

/**
 * Who is gone when the season ends.
 *
 * At a school or a college it is certain and it is the calendar: his eligibility
 * is up and he walks. In a professional league nobody graduates — they get old,
 * they get worse, and at some point the club moves on, which is a decision about
 * age and standard rather than a date.
 */
export function rosterTurnover(
  roster: HoopsPlayer[], level: HoopsLevel, seed: number | string, par: number,
): TurnoverResult {
  const rng = new Rng(`hoops:turnover:${seed}`);
  const info = LEVELS[level];
  const leaving: HoopsPlayer[] = [];
  const staying: HoopsPlayer[] = [];
  const reasons = new Map<string, string>();

  for (const p of roster) {
    if (graduates(level)) {
      if (p.years >= info.eligibility) {
        leaving.push(p);
        reasons.set(p.id, p.years >= 4 ? 'Graduated' : 'Eligibility used up');
      } else {
        p.years++;
        p.age++;
        staying.push(p);
      }
      continue;
    }
    // Professional: age and standard.
    p.age++;
    p.years++;
    const old = p.age >= 34;
    const finished = p.age >= 31 && p.overall < par - 6;
    const retireChance = old ? clamp((p.age - 33) * 0.3, 0, 0.9) : finished ? 0.35 : 0.04;
    if (rng.bool(retireChance)) {
      leaving.push(p);
      reasons.set(p.id, p.age >= 34 ? 'Retired' : 'Released');
    } else {
      staying.push(p);
    }
  }
  return { leaving, staying, reasons };
}
