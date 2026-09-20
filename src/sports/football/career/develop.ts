import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { computeOverall, type AttrKey, type Player, type Position } from '../data';
import { LEVELS } from '../levels';
import { perksOf } from './coach';
import type { Alumnus, FootballCareer } from './types';
import { emptyStatLine } from '../types';

/* ---------------------------------------------------------------------------
 * THE OFFSEASON: WHO IMPROVES AND WHO LEAVES
 * ---------------------------------------------------------------------------
 * The part of a career that makes a programme rather than a season. Three
 * things happen here and they happen in this order because the rulebook does:
 * players leave, the ones who stay get better, and then the next lot arrive.
 *
 * DEVELOPMENT IS NOT RANDOM DRIFT. It is the player's own headroom, his work
 * rate, how much he PLAYED, and how well the programme is coached — and a
 * fourth-year starter improves far less than a first-year backup, because that
 * is what actually happens. A system where everybody gains two points a year
 * produces a roster with no shape to it and a recruiting decision with no
 * consequences.
 * ------------------------------------------------------------------------- */

/** The attributes a position actually develops in. Nobody's kicking improves. */
const GROWS: Record<Position, AttrKey[]> = {
  QB: ['throwAccuracy', 'decision', 'awareness', 'throwPower'],
  RB: ['agility', 'power', 'ballSecurity', 'speed'],
  WR: ['routeRunning', 'catching', 'agility', 'speed'],
  TE: ['blocking', 'catching', 'routeRunning', 'power'],
  OL: ['blocking', 'power', 'awareness', 'agility'],
  DL: ['passRush', 'power', 'tackling', 'awareness'],
  LB: ['tackling', 'awareness', 'coverage', 'power'],
  CB: ['coverage', 'agility', 'awareness', 'speed'],
  S: ['coverage', 'awareness', 'tackling', 'speed'],
  K: ['kicking', 'awareness'],
  P: ['kicking', 'awareness'],
};

export interface Growth {
  name: string;
  pos: Position;
  before: number;
  after: number;
}

/**
 * A YEAR OLDER AND BETTER FOR IT — or not.
 *
 * `snaps` is how much he played, and it is the biggest single term after his own
 * headroom: a player who spent the season on the bench develops far less than
 * one who started, which is what makes a decision about the depth chart a real
 * decision rather than a cosmetic one.
 */
export function developPlayer(
  p: Player, rng: Rng, multiplier: number, snaps: number,
): Growth | null {
  const before = p.overall;
  const headroom = Math.max(0, p.potential - p.overall);
  if (headroom <= 0 && p.years >= 3) return null;

  const work = 0.5 + p.work / 200;
  const young = clamp(1.45 - p.years * 0.22, 0.4, 1.45);
  const played = clamp(0.5 + snaps / 320, 0.5, 1.3);
  const room = clamp(headroom / 10, 0.15, 1.5);
  /* HOW MUCH A YEAR IS WORTH.
   *
   * Calibrated against what a programme has to do to stay level: the world
   * regenerates every rival at full strength every season, so a coached roster
   * that improves by half a point a year is a coached roster that decays, and a
   * career mode where the coach gets worse the longer he stays is not a career
   * mode.
   *
   * The bar it is set against is the only one that matters: after twenty years
   * the programme has to read BETTER than the same club would have read if
   * nobody had ever managed it. A first-year starter with room gains four or
   * five; a fourth-year one near his ceiling gains one. */
  const gain = rng.range(0.25, 1) * 9.6 * work * young * played * room * multiplier;

  const keys = GROWS[p.pos];
  let left = gain;
  const attrs = { ...p.attrs };
  // Spread it over the attributes the position is actually judged on.
  for (const k of keys) {
    if (left <= 0) break;
    const share = Math.min(left, gain / keys.length + rng.range(0, 1.4));
    attrs[k] = clamp(Math.round(attrs[k] + share), 20, 99);
    left -= share;
  }
  p.attrs = attrs;
  p.overall = computeOverall(p.pos, attrs);
  p.potential = Math.max(p.potential, p.overall);
  if (p.overall === before) return null;
  return { name: `${p.first} ${p.last}`, pos: p.pos, before, after: p.overall };
}

/**
 * EVERYBODY WHO STAYED, A YEAR ON.
 *
 * Returns what changed, so the offseason screen can show it: a development
 * system whose results are invisible is a development system nobody believes in.
 */
export function developSquad(career: FootballCareer): Growth[] {
  const rng = new Rng(`fb:develop:${career.seed}:${career.year}`);
  const perks = perksOf(career.coach);
  const out: Growth[] = [];
  for (const p of career.roster) {
    const line = career.season[p.id] ?? emptyStatLine();
    const g = developPlayer(p, rng, perks.development, line.snaps);
    if (g) out.push(g);
  }
  return out.sort((a, b) => (b.after - b.before) - (a.after - a.before));
}

/**
 * WHO IS GONE.
 *
 * At a school or a college a player has a fixed number of years and then he is
 * finished; at a professional club he ages and eventually retires, and a good one
 * can be signed away by somebody with more money. The two systems are genuinely
 * different and the level says which applies, because a career that spans both
 * has to handle both.
 */
export function departures(career: FootballCareer): { leaving: Player[]; alumni: Alumnus[] } {
  const info = LEVELS[career.level];
  const rng = new Rng(`fb:depart:${career.seed}:${career.year}`);
  const perks = perksOf(career.coach);
  const leaving: Player[] = [];
  const alumni: Alumnus[] = [];

  for (const p of career.roster) {
    let reason: Alumnus['reason'] | null = null;
    if (info.ageSystem === 'class') {
      if (p.years >= 4) reason = 'graduated';
      /* A PLAYER WHO IS NOT PLAYING LOOKS ELSEWHERE, and a well-run programme
       * loses fewer of them. This is the one place the training staff upgrade
       * pays for itself in something other than ratings. */
      else if (p.years >= 2 && (career.season[p.id]?.snaps ?? 0) < 60
        && rng.next() < clamp(0.2 - perks.retention, 0.04, 0.3)) reason = 'transferred';
    } else {
      if (p.age >= 34 || (p.age >= 31 && rng.next() < 0.3)) reason = 'retired';
      else if (p.overall > 78 && rng.next() < clamp(0.16 - perks.retention, 0.03, 0.2)) {
        reason = 'signed elsewhere';
      }
    }
    if (!reason) continue;
    leaving.push(p);
    alumni.push({
      id: p.id,
      name: `${p.first} ${p.last}`,
      pos: p.pos,
      overall: p.overall,
      years: p.years,
      yearLeft: career.year,
      line: career.careerStats[p.id] ?? emptyStatLine(),
      reason,
    });
  }
  return { leaving, alumni };
}

/** Everybody who stayed is a year older and a year further into his eligibility. */
export function ageSquad(career: FootballCareer): void {
  const pro = LEVELS[career.level].ageSystem === 'pro';
  for (const p of career.roster) {
    p.age += 1;
    if (!pro) p.years += 1;
    /* AND A PROFESSIONAL EVENTUALLY GOES BACKWARDS. Nothing in a class system
     * declines — a twenty-one year old does not get slower — but a thirty year
     * old does, and a roster that never ages is a roster with no turnover in it. */
    if (pro && p.age >= 30) {
      const drop = Math.round((p.age - 29) * 0.8);
      const attrs = { ...p.attrs };
      attrs.speed = clamp(attrs.speed - drop, 20, 99);
      attrs.acceleration = clamp(attrs.acceleration - drop, 20, 99);
      attrs.agility = clamp(attrs.agility - drop, 20, 99);
      // Everything he knows, he keeps.
      attrs.awareness = clamp(attrs.awareness + 1, 20, 99);
      p.attrs = attrs;
      p.overall = computeOverall(p.pos, attrs);
    }
  }
}
