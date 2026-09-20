import { clamp } from '../../../core/math';
import { POSITIONS, POSITION_UNIT, buildRoster, depthAt, type Player, type Position } from '../data';
import { LEAGUE_PAR, ROSTER_SPREAD, teamOr } from '../nfl';
import {
  FACILITY_KEYS, FACILITY_MAX, type FacilityInfo, type FacilityKey, type Franchise,
} from './types';

/* ---------------------------------------------------------------------------
 * THE CLUB: MONEY, BUILDINGS AND THE TOWN
 * ---------------------------------------------------------------------------
 * Three systems that are one system, because they only mean anything together:
 * winning brings the town in, the town brings the money in, the money buys the
 * buildings, and the buildings help you win.
 *
 * ALL OF IT IS DELIBERATELY SMALL. There are five buildings, not thirty. There
 * is one cap number and one cash number, not a ledger. Nobody came to a football
 * game to do bookkeeping, and an offseason that takes twenty minutes of
 * accounting is an offseason players skip — which is the same as not having one.
 * ------------------------------------------------------------------------- */

/** Millions. One number, and every contract in the game is measured against it. */
export const SALARY_CAP = 200;

/* --------------------------------------------------------- what average is */

/**
 * WHAT AN AVERAGE STARTER AT EACH POSITION ACTUALLY READS.
 *
 * MEASURED, not guessed, and this is the single most important number in the
 * management half of the game. Every "is this a need?", "is this free agent an
 * upgrade?", "should we draft one?" question in the franchise is a comparison
 * against it, and the first version of all of them compared an OVERALL against
 * a PAR — different scales, three-quarters of a rating band apart — which meant
 * nothing was ever a need, nobody was ever an upgrade, and a club carried the
 * same street free agent at punter for twenty years.
 *
 * So it is sampled from the generator itself, once, at the band a middling club
 * is drawn from. Change the band and this follows it, which is the whole point.
 */
let BARS: Record<Position, number> | null = null;

export function starterBar(pos: Position): number {
  if (!BARS) {
    const sample = {} as Record<Position, number>;
    const rosters = [0, 1, 2, 3, 4, 5, 6, 7]
      .map((i) => buildRoster(`bar:${i}`, { par: LEAGUE_PAR, spread: ROSTER_SPREAD }));
    for (const p of POSITIONS) {
      const tops = rosters.map((r) => depthAt(r, p)[0]?.overall ?? 60);
      sample[p] = Math.round(tops.reduce((a, b) => a + b, 0) / tops.length);
    }
    BARS = sample;
  }
  return BARS[pos];
}

/** And what a squad player at it reads, which is a different question. */
export const depthBar = (pos: Position): number => starterBar(pos) - 11;

/** Nobody plays for nothing. */
export const MIN_SALARY = 0.9;

/* ---------------------------------------------------------- what a man is worth */

const POSITION_PRICE: Record<Position, number> = {
  QB: 1.62, RB: 0.8, WR: 1.1, TE: 0.85, OL: 1.1,
  DL: 1.15, LB: 0.95, CB: 1.1, S: 0.9, K: 0.35, P: 0.3,
};

/** What age does to a price: a 33-year-old is not paid for what he was at 27. */
export function ageFactor(age: number): number {
  if (age <= 23) return 0.9;
  if (age <= 28) return 1;
  if (age <= 30) return 0.92;
  if (age <= 32) return 0.78;
  if (age <= 34) return 0.58;
  return 0.42;
}

/**
 * THE MARKET PRICE OF A FOOTBALL PLAYER, in millions a season.
 *
 * Steeply convex on purpose, because the sport is: the difference between an
 * eighty-five and a seventy-five is far more than the difference between a
 * sixty-five and a fifty-five, and a flat scale makes a roster of average men
 * the optimal play. Position matters as much as rating — the best punter alive
 * is not paid like a average quarterback, and a game where he is is a game
 * where nobody ever has to make a hard choice.
 */
export function marketValue(p: Player): number {
  const base = 0.9 + Math.pow(clamp(p.overall - 55, 0, 44) / 44, 2.2) * 24;
  /* YOUTH WITH HEADROOM IS PAID FOR, a little: a twenty-three-year-old with ten
   * points of ceiling above him costs more than a thirty-year-old reading the
   * same number today, because somebody else will pay it. */
  const upside = p.age <= 25 ? 1 + clamp(p.potential - p.overall, 0, 20) / 90 : 1;
  const raw = base * POSITION_PRICE[p.pos] * ageFactor(p.age) * upside;
  return Math.max(MIN_SALARY, Math.round(raw * 10) / 10);
}

/** How long a man of this age and quality expects to be signed for. */
export function marketYears(p: Player): number {
  if (p.age >= 32) return 1;
  if (p.age >= 30) return 2;
  if (p.overall >= 78) return p.age <= 26 ? 5 : 4;
  if (p.overall >= 68) return 3;
  return 2;
}

/** Put a legal, sensible contract on every man in a squad. Used once, at the start. */
export function priceRoster(roster: Player[], rng: { int(a: number, b: number): number }): void {
  for (const p of roster) {
    p.salary = marketValue(p);
    p.contractYears = clamp(rng.int(1, marketYears(p)), 1, 5);
  }
}

/* ---------------------------------------------------------------------- cap */

export const capUsed = (roster: Player[]): number =>
  Math.round(roster.reduce((s, p) => s + p.salary, 0) * 10) / 10;

export const capRoom = (fr: Franchise): number =>
  Math.round((SALARY_CAP - capUsed(fr.roster)) * 10) / 10;

export const overCap = (fr: Franchise): boolean => capRoom(fr) < 0;

/** Squeeze an inherited roster under the cap without gutting it. */
export function fitToCap(roster: Player[]): void {
  const used = capUsed(roster);
  if (used <= SALARY_CAP * 0.94) return;
  const factor = (SALARY_CAP * 0.9) / used;
  for (const p of roster) {
    p.salary = Math.max(MIN_SALARY, Math.round(p.salary * factor * 10) / 10);
  }
}

/**
 * CUTTING A PLAYER.
 *
 * Not free, and it should not be: half of what is left on the deal stays on the
 * books this season, which is what stops a cap problem from being solved by
 * pressing a button eleven times.
 */
export const cutCost = (p: Player): number =>
  Math.round(p.salary * (p.contractYears > 1 ? 0.5 : 0.25) * 10) / 10;

/* --------------------------------------------------------------- facilities */

export const FACILITIES: Record<FacilityKey, FacilityInfo> = {
  training: {
    key: 'training',
    label: 'Training centre',
    blurb: 'Weights, film and the hours nobody sees. Your players get better faster.',
    cost: [12, 22, 38, 60],
    effect: (l) => `Development ×${trainingMult(l).toFixed(2)}`,
  },
  medical: {
    key: 'medical',
    label: 'Medical and rehab',
    blurb: 'Fewer men hurt, and the ones who are hurt are back sooner.',
    cost: [10, 20, 34, 54],
    effect: (l) => `Injuries ×${medicalMult(l).toFixed(2)}`,
  },
  stadium: {
    key: 'stadium',
    label: 'The stadium',
    blurb: 'More seats, louder, and worth more every Sunday.',
    cost: [16, 30, 48, 72],
    effect: (l) => `Revenue ×${stadiumMult(l).toFixed(2)} · home edge +${(l * 0.5).toFixed(1)}`,
  },
  scouting: {
    key: 'scouting',
    label: 'Scouting department',
    blurb: 'A bigger board in the spring, and reports you can trust.',
    cost: [9, 17, 29, 46],
    effect: (l) => `${scoutBudget(l)} scouting trips · reports ${['rough', 'fair', 'good', 'sharp', 'excellent'][l]}`,
  },
  practice: {
    key: 'practice',
    label: 'Practice facility',
    blurb: 'Cleaner football. Fewer men out of position, and a happier squad.',
    cost: [11, 21, 36, 56],
    effect: (l) => `Awareness +${(l * 0.9).toFixed(1)} · morale +${(l * 0.6).toFixed(1)} a week`,
  },
};

export const trainingMult = (l: number): number => [0.88, 1, 1.09, 1.18, 1.28][clamp(l, 0, 4)];
export const medicalMult = (l: number): number => [1.18, 1, 0.88, 0.77, 0.66][clamp(l, 0, 4)];
export const stadiumMult = (l: number): number => [1, 1.1, 1.21, 1.33, 1.46][clamp(l, 0, 4)];
export const scoutBudget = (l: number): number => 6 + l * 3;

/** What the next level of a building costs, or null when it is finished. */
export function facilityCost(fr: Franchise, key: FacilityKey): number | null {
  const level = fr.facilities[key];
  if (level >= FACILITY_MAX) return null;
  return FACILITIES[key].cost[level];
}

export function upgradeFacility(fr: Franchise, key: FacilityKey): boolean {
  const cost = facilityCost(fr, key);
  if (cost === null || fr.funds < cost) return false;
  fr.funds = Math.round((fr.funds - cost) * 10) / 10;
  fr.facilities[key] += 1;
  return true;
}

/** Upkeep: a building you have built is a building you have to run. */
export const facilityUpkeep = (fr: Franchise): number =>
  Math.round(FACILITY_KEYS.reduce((s, k) => s + fr.facilities[k] * 1.2, 0) * 10) / 10;

/* ------------------------------------------------------------------ the town */

/**
 * WHAT THE TOWN THINKS, and it is slow on purpose.
 *
 * A single good season does not fill a stadium and a single bad one does not
 * empty it. Championships move it hard, because they do.
 */
export function moveFanSupport(
  fr: Franchise, wins: number, losses: number, champion: boolean, madePlayoffs: boolean,
): void {
  const games = Math.max(1, wins + losses);
  const rate = wins / games;
  let move = (rate - 0.5) * 22;
  if (madePlayoffs) move += 4;
  if (champion) move += 16;
  /* A BIG STADIUM IN A BIG TOWN HOLDS ITS SUPPORT BETTER, which is the quiet
   * advantage of a big market and the quiet problem of a small one. */
  move += fr.facilities.stadium * 0.8;
  /* THERE IS A FLOOR, and it is there to stop a death spiral rather than to be
   * kind: a club with nobody in the ground earns nothing, builds nothing and
   * can never climb out, which is a franchise mode that has stopped being one.
   * Twenty is an empty stadium with the diehards still in it. */
  fr.fanSupport = Math.round(clamp(fr.fanSupport + move, 20, 100));
}

export const fanMood = (n: number): string =>
  (n >= 88 ? 'Ravenous' : n >= 72 ? 'Buzzing' : n >= 55 ? 'Onside'
    : n >= 38 ? 'Restless' : n >= 22 ? 'Turning' : 'Gone');

/* ------------------------------------------------------------------- money */

/**
 * A SEASON'S REVENUE.
 *
 * Gate, television and merchandise, folded into one number because three
 * numbers that always move together are one number wearing a costume. The
 * market is what the town could give you; fan support is how much of it you are
 * actually getting; the stadium is the multiplier on both.
 */
export function revenueFor(fr: Franchise, playoffRounds: number, champion: boolean): number {
  const team = teamOr(fr.teamId);
  const base = 34 + team.market * 6;
  const crowd = 0.7 + fr.fanSupport / 140;
  const january = playoffRounds * 4.5 + (champion ? 9 : 0);
  return Math.round((base * crowd * stadiumMult(fr.facilities.stadium) + january) * 10) / 10;
}

export function expensesFor(fr: Franchise): number {
  const staff = fr.staff.HC.salary + fr.staff.OC.salary + fr.staff.DC.salary;
  return Math.round((staff + facilityUpkeep(fr) + 8) * 10) / 10;
}

/** Close the books for the year. Called once, in the offseason. */
export function settleFinances(fr: Franchise, playoffRounds: number, champion: boolean): void {
  const revenue = revenueFor(fr, playoffRounds, champion);
  const expenses = expensesFor(fr);
  fr.lastRevenue = revenue;
  fr.lastExpenses = expenses;
  fr.funds = Math.round(clamp(fr.funds + revenue - expenses, -40, 400) * 10) / 10;
}

/* ------------------------------------------------------------- the home field */

/** A loud stadium is worth something, and the sport says roughly how much. */
export const homeEdgeFor = (fr: Franchise): number =>
  Math.round((1.4 + fr.facilities.stadium * 0.5 + (fr.fanSupport - 50) / 32) * 10) / 10;

/* ------------------------------------------------------------ roster health */

/** Whether a squad can legally field a team, which the engine needs it to. */
export const MINIMUM_SHAPE: Record<Position, number> = {
  QB: 1, RB: 2, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2, K: 1, P: 1,
};

export const ROSTER_LIMIT = 36;

/** Which positions a squad is short of right now, for the roster screen. */
export function shortAt(roster: Player[]): Position[] {
  const out: Position[] = [];
  for (const [pos, need] of Object.entries(MINIMUM_SHAPE) as [Position, number][]) {
    const fit = roster.filter((p) => p.pos === pos && (p.injury?.weeks ?? 0) < 1).length;
    if (fit < need) out.push(pos);
  }
  return out;
}

/** The unit a position belongs to, for grouping a roster screen. */
export const unitOf = (pos: Position): 'offense' | 'defense' | 'special' => POSITION_UNIT[pos];
