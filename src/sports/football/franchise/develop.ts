import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import {
  ATTR_MAX, ATTR_MIN, PERSONALITY, POSITION_WEIGHTS, computeOverall,
  type AttrKey, type Player, type Position,
} from '../data';
import { trainingMult } from './club';
import { coachingOf } from './staff';
import type { Departure, Franchise } from './types';

/* ---------------------------------------------------------------------------
 * THE CYCLE
 * ---------------------------------------------------------------------------
 *   DRAFT -> DEVELOP -> COMPETE -> PEAK -> DECLINE -> REPLACE
 *
 * and the reason a franchise mode is worth playing for twenty seasons rather
 * than three is that this loop is real. A twenty-two-year-old with headroom
 * becomes a player if you play him and coach him. A thirty-one-year-old is
 * quietly losing a step a year whatever you do, and the day you notice is
 * usually a year after the day you should have.
 *
 * WHAT DECIDES IT, and every one of these is something a coach controls or can
 * at least see: how old he is, how much room is left above him, how hard he
 * works, whether he actually played, how he played, who is coaching him, and
 * what your training facility is.
 * ------------------------------------------------------------------------- */

/** Which attributes a position actually grows, so a lineman does not get faster. */
const GROWS: Record<Position, AttrKey[]> = {
  QB: ['throwAccuracy', 'decision', 'awareness', 'throwPower'],
  RB: ['agility', 'acceleration', 'ballSecurity', 'power', 'catching'],
  WR: ['routeRunning', 'catching', 'acceleration', 'agility'],
  TE: ['catching', 'blocking', 'routeRunning', 'power'],
  OL: ['blocking', 'power', 'awareness'],
  DL: ['passRush', 'power', 'tackling', 'awareness'],
  LB: ['tackling', 'coverage', 'awareness', 'passRush'],
  CB: ['coverage', 'awareness', 'agility', 'tackling'],
  S: ['coverage', 'awareness', 'tackling'],
  K: ['kicking', 'awareness'],
  P: ['kicking', 'awareness'],
};

/** What goes first, and it is always the same thing. */
const FADES: AttrKey[] = ['speed', 'acceleration', 'agility', 'power'];

/**
 * THE AGE CURVE.
 *
 * Positive is room to grow; negative is the slide. It peaks at twenty-five and
 * has turned by thirty, which is roughly what the sport does and is certainly
 * what makes a thirty-two-year-old a decision rather than an asset.
 */
export function ageCurve(age: number): number {
  if (age <= 22) return 1.3;
  if (age <= 24) return 1.1;
  if (age <= 26) return 0.8;
  if (age <= 28) return 0.4;
  if (age <= 29) return 0.1;
  if (age <= 31) return -0.6;
  if (age <= 33) return -0.95;
  if (age <= 35) return -1.5;
  return -2.2;
}

/** Kickers and punters last, which is the one real perk of the job. */
const SPECIALIST = (pos: Position): boolean => pos === 'K' || pos === 'P';

export interface DevNote {
  name: string;
  pos: Position;
  before: number;
  after: number;
}

/**
 * ONE PLAYER, ONE OFFSEASON.
 *
 * THE MODEL WORKS IN OVERALL POINTS and only then turns them into attributes,
 * because the overall is what a coach reads. The first version grew raw
 * attribute points and let the position weighting decide what they were worth
 * — which meant a twenty-three-year-old with eight points of ceiling above him
 * gained about four tenths of a point a year and would have needed two decades
 * to reach it, while a thirty-two-year-old's decline landed on speed and
 * agility, which a lineman's overall barely reads, and never showed at all.
 *
 *   growing   close a fraction of the gap to his ceiling. The fraction is the
 *             age curve times how hard he works, whether he played, who is
 *             coaching him and what the building is like.
 *   fading    lose points to the age curve whatever anybody does. A rehab wing
 *             buys a season, not a decade.
 *
 * @param snaps  how much he played, which is the single biggest term after age
 */
export function developPlayer(
  p: Player, rng: Rng, opts: { coaching: number; facility: number; snaps: number; teamSnaps: number },
): number {
  const before = p.overall;
  const curve = ageCurve(p.age) * (SPECIALIST(p.pos) ? 0.45 : 1);

  if (curve > 0) {
    const room = Math.max(0, p.potential - p.overall);
    const work = 0.55 + (p.work / 99) * 0.9;
    const played = opts.teamSnaps > 0
      ? 0.45 + clamp(opts.snaps / Math.max(1, opts.teamSnaps * 0.55), 0, 1) * 0.85
      : 0.75;
    const rate = clamp(0.2 * curve * work * played * opts.coaching * opts.facility, 0, 0.75);
    const gain = room * rate * rng.range(0.55, 1.35);
    shiftOverall(p, GROWS[p.pos], gain, 1, rng);
  } else {
    const loss = -curve * 2 * rng.range(0.5, 1.4) / Math.max(0.8, opts.facility * 0.85);
    /* SPEED GOES FIRST, and it goes whatever anybody does about it — but the
     * loss is aimed at what the POSITION reads, so it actually shows up on the
     * number a coach looks at. */
    shiftOverall(p, Object.keys(POSITION_WEIGHTS[p.pos]) as AttrKey[], -loss, 1.7, rng);
    /* THE ONE THING THAT STILL GROWS. He has seen it all before. */
    if (rng.bool(0.5)) bump(p, ['awareness'], rng.range(0.4, 1.4), rng);
  }

  p.overall = computeOverall(p.pos, p.attrs);
  /* A CEILING UNDER A FLOOR IS A NUMBER THAT CAN ONLY CONFUSE A SCOUTING
   * SCREEN, so potential never reads below what he already is. */
  p.potential = Math.max(p.potential, p.overall);
  return p.overall - before;
}

/**
 * MOVE HIS OVERALL BY `amount`, spent on the attributes his position weighs.
 *
 * Each key gets a share scaled by one over the total weight of the keys chosen,
 * which is what makes the expected change in the overall equal to `amount`.
 * `physical` is how much more of a LOSS the four physical attributes take.
 */
function shiftOverall(p: Player, keys: AttrKey[], amount: number, physical: number, rng: Rng): void {
  const weights = POSITION_WEIGHTS[p.pos];
  const chosen = keys.filter((k) => (weights[k] ?? 0) > 0);
  if (!chosen.length || amount === 0) return;
  const factor = (k: AttrKey): number => (FADES.includes(k) ? physical : 1);
  const total = chosen.reduce((s, k) => s + (weights[k] ?? 0) * factor(k), 0);
  for (const k of chosen) {
    const v = p.attrs[k] + (amount * factor(k) / total) * rng.range(0.6, 1.4);
    const whole = Math.floor(v);
    p.attrs[k] = clamp(whole + (rng.next() < v - whole ? 1 : 0), ATTR_MIN, ATTR_MAX);
  }
}

/**
 * SPREAD A CHANGE OVER THE ATTRIBUTES A POSITION GROWS.
 *
 * ROUNDED STOCHASTICALLY, and that is the whole of the fix: a season's growth
 * spread over four attributes is often under half a point each, and rounding
 * that to the nearest integer threw it away every time — while a decline, which
 * comes in bigger lumps, survived. Measured, a full squad would finish a year
 * with nobody improved and one man slipped. Carrying the fraction as a chance
 * keeps the expected value exactly what the model asked for.
 */
function bump(p: Player, keys: AttrKey[], amount: number, rng: Rng): void {
  if (!keys.length) return;
  for (const k of keys) {
    const v = p.attrs[k] + (amount / keys.length) * rng.range(0.5, 1.5);
    const whole = Math.floor(v);
    p.attrs[k] = clamp(whole + (rng.next() < v - whole ? 1 : 0), ATTR_MIN, ATTR_MAX);
  }
}

/* -------------------------------------------------------------- retirement */

/**
 * WHO HANGS THEM UP.
 *
 * Age, and what is left of him. A thirty-four-year-old still reading eighty-two
 * plays on; a thirty-one-year-old down to a fifty-eight does not, because
 * nobody would sign him and he knows it.
 */
export function willRetire(p: Player, rng: Rng): boolean {
  if (p.age < 29) return false;
  const past = p.age - (SPECIALIST(p.pos) ? 35 : 29);
  if (past < 0) return false;
  const quality = clamp((p.overall - 52) / 34, 0, 1);
  const chance = clamp(0.06 + past * 0.13 - quality * 0.3, 0, 0.95);
  return rng.next() < chance;
}

/* ------------------------------------------------------------------ morale */

/**
 * HOW EVERYBODY FEELS, and this is the whole of it.
 *
 * Seven inputs, all of them things the brief names and all of them things a
 * coach can see: are we winning, is he playing, is he paid, is he hurt, who is
 * coaching him, what is the practice facility like, and who else is in the room.
 * Personality decides how hard each of those lands on him.
 */
export function updateMorale(fr: Franchise, ctx: {
  won: boolean; tied?: boolean; margin: number; snaps: Record<string, number>; teamSnaps: number;
}): void {
  const coaching = coachingOf(fr.staff);
  const chem = teamChemistry(fr.roster);
  const facility = fr.facilities.practice * 0.6;

  for (const p of fr.roster) {
    const info = PERSONALITY[p.personality];
    let move = 0;

    // The scoreboard, which is most of it.
    move += ctx.tied ? 0 : (ctx.won ? 3.4 : -3.2);
    move += clamp(ctx.margin / 14, -1.6, 1.6);

    // Whether he actually played.
    const share = ctx.teamSnaps > 0 ? (ctx.snaps[p.id] ?? 0) / ctx.teamSnaps : 0.5;
    move += (share - 0.42) * 7 * info.snapHunger;

    // Being hurt is miserable.
    if (p.injury) move -= 2.4;

    // The contract, once it is close enough to think about.
    if (p.contractYears <= 1) move -= 1.3 * info.ask;

    // Coaching, the room, and the building they work in.
    move += coaching.morale + chem * 0.5 + facility;

    p.morale = Math.round(clamp(p.morale + move * info.swing, 5, 100));
  }
}

/** What the room does to itself. A couple of bad apples is a real cost. */
export function teamChemistry(roster: Player[]): number {
  if (!roster.length) return 0;
  const sum = roster.reduce((s, p) => s + PERSONALITY[p.personality].chemistry, 0);
  return clamp(sum / roster.length, -2, 2.5);
}

export const moodOf = (n: number): string =>
  (n >= 85 ? 'Flying' : n >= 70 ? 'Happy' : n >= 55 ? 'Fine'
    : n >= 40 ? 'Unsettled' : n >= 25 ? 'Unhappy' : 'Wants out');

/* ------------------------------------------------------- the whole offseason */

export interface OffseasonChange {
  development: DevNote[];
  retirements: Departure[];
}

/**
 * A YEAR ON EVERYBODY, in one pass: a birthday, a season off the contract, and
 * whichever side of the age curve he is on.
 */
export function ageAndDevelop(fr: Franchise): OffseasonChange {
  const rng = new Rng(`fb:dev:${fr.seed}:${fr.year}`);
  const coaching = coachingOf(fr.staff);
  const facility = trainingMult(fr.facilities.training);
  const teamSnaps = Math.max(1, ...Object.values(fr.seasonStats).map((s) => s.snaps));

  const development: DevNote[] = [];
  const retirements: Departure[] = [];
  const keep: Player[] = [];

  for (const p of fr.roster) {
    p.age += 1;
    p.years += 1;
    p.injury = null;

    if (willRetire(p, rng)) {
      retirements.push({
        name: `${p.first} ${p.last}`,
        pos: p.pos,
        age: p.age,
        overall: p.overall,
        reason: p.age >= 36 ? 'Retired' : 'Retired — nothing left in the legs',
      });
      continue;
    }

    const before = p.overall;
    const mult = p.pos === 'QB' ? coaching.qbDevelopment : coaching.development;
    developPlayer(p, rng, {
      coaching: mult,
      facility,
      snaps: fr.seasonStats[p.id]?.snaps ?? 0,
      teamSnaps,
    });
    if (Math.abs(p.overall - before) >= 1) {
      development.push({ name: `${p.first} ${p.last}`, pos: p.pos, before, after: p.overall });
    }
    keep.push(p);
  }

  fr.roster = keep;
  development.sort((a, b) => (b.after - b.before) - (a.after - a.before));
  return { development, retirements };
}

/** Everybody's deal is a year shorter than it was. Called after the season. */
export function tickContracts(fr: Franchise): Player[] {
  const expiring: Player[] = [];
  for (const p of fr.roster) {
    p.contractYears -= 1;
    if (p.contractYears <= 0) expiring.push(p);
  }
  return expiring;
}
