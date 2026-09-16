import { clamp } from '../../../core/math';
import type { Coach, FootballCareer } from './types';
import { LEVELS } from '../levels';

/* ---------------------------------------------------------------------------
 * THE COACH
 * ---------------------------------------------------------------------------
 * One currency, and everything it buys is COACHING rather than a number on a
 * card. That distinction is the whole design: a football coach who could spend
 * points to make his quarterback's arm stronger is playing a different game from
 * the one the engine simulates, and every upgrade below instead changes
 * something the engine already reads — how much a player develops in an
 * offseason, how far the programme's name carries with a recruit, how long the
 * line holds, how quickly the defence diagnoses.
 *
 * IT IS NEVER FINISHED. The ranks get more expensive without limit, so a
 * twenty-season dynasty has bought most of the tree and a forty-season one is
 * still buying, and there is no point at which the coach stops improving and the
 * career becomes a spreadsheet.
 * ------------------------------------------------------------------------- */

export interface Upgrade {
  id: string;
  name: string;
  blurb: string;
  /** What each rank is worth, in the units the reader below uses. */
  per: number;
  /** Cost of the first rank. Each one after costs more. */
  base: number;
  /** How fast it gets expensive. */
  growth: number;
  group: 'offence' | 'defence' | 'programme';
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'oline',
    name: 'Offensive line coach',
    blurb: 'The pocket holds longer and the run game has a crease. Every rank is '
      + 'about a tenth of a second of protection.',
    per: 0.09, base: 22, growth: 1.35, group: 'offence',
  },
  {
    id: 'qb',
    name: 'Quarterbacks coach',
    blurb: 'He sees more of the field and puts the ball closer to where he aimed.',
    per: 1, base: 26, growth: 1.4, group: 'offence',
  },
  {
    id: 'skill',
    name: 'Skill position coach',
    blurb: 'Backs and receivers get off the line cleaner and hold onto more of it.',
    per: 1, base: 24, growth: 1.35, group: 'offence',
  },
  {
    id: 'front',
    name: 'Defensive line coach',
    blurb: 'The rush gets home sooner and the front holds up against the run.',
    per: 1, base: 24, growth: 1.35, group: 'defence',
  },
  {
    id: 'secondary',
    name: 'Secondary coach',
    blurb: 'Tighter coverage and defenders who break on the ball rather than watch it.',
    per: 1, base: 26, growth: 1.4, group: 'defence',
  },
  {
    id: 'strength',
    name: 'Strength programme',
    blurb: 'Everybody on the roster develops faster in the offseason.',
    per: 0.14, base: 30, growth: 1.42, group: 'programme',
  },
  {
    id: 'scouting',
    name: 'Scouting department',
    blurb: 'More visits to spend, and a truer read on what a recruit will become.',
    per: 1, base: 28, growth: 1.38, group: 'programme',
  },
  {
    id: 'recruiting',
    name: 'Recruiting operation',
    blurb: 'The programme’s name carries further, and more offers to make with it.',
    per: 1, base: 32, growth: 1.45, group: 'programme',
  },
  {
    id: 'training',
    name: 'Training staff',
    blurb: 'Fewer players lost, and the ones who stay hold their level longer.',
    per: 1, base: 26, growth: 1.36, group: 'programme',
  },
];

export const rankOf = (coach: Coach, id: string): number => coach.upgrades[id] ?? 0;

/** What the next rank of this upgrade costs. Always more than the last. */
export function costOf(coach: Coach, id: string): number {
  const up = UPGRADES.find((u) => u.id === id);
  if (!up) return Infinity;
  return Math.round(up.base * up.growth ** rankOf(coach, id));
}

export function canBuy(coach: Coach, id: string): boolean {
  return coach.points >= costOf(coach, id);
}

export function buyUpgrade(coach: Coach, id: string): boolean {
  const cost = costOf(coach, id);
  if (coach.points < cost) return false;
  coach.points -= cost;
  coach.spent += cost;
  coach.upgrades[id] = rankOf(coach, id) + 1;
  return true;
}

/**
 * WHAT THE TREE IS WORTH, read by the engine and the offseason rather than
 * displayed. Everything here is a small number that compounds over a long
 * career, which is what makes a twentieth season feel different from a first.
 */
export interface Perks {
  /** Extra seconds a block holds. */
  protection: number;
  /** Ratings added to the quarterback's accuracy and decisions, in coaching. */
  passing: number;
  /** Ratings added to skill players' route running and ball security. */
  skill: number;
  /** Ratings added to the front's pass rush and tackling. */
  front: number;
  /** Ratings added to the secondary's coverage and awareness. */
  coverage: number;
  /** Multiplier on offseason development. */
  development: number;
  /** Extra scouting visits an offseason. */
  visits: number;
  /** Extra offers an offseason, and pull with a recruit. */
  offers: number;
  recruitingPull: number;
  /** How much less likely a player is to leave. */
  retention: number;
}

export function perksOf(coach: Coach): Perks {
  const r = (id: string): number => rankOf(coach, id);
  return {
    protection: r('oline') * 0.09,
    passing: r('qb') * 1.6,
    skill: r('skill') * 1.5,
    front: r('front') * 1.5,
    coverage: r('secondary') * 1.5,
    development: 1 + r('strength') * 0.14,
    visits: r('scouting'),
    offers: Math.floor(r('recruiting') / 2),
    recruitingPull: r('recruiting') * 3.5,
    retention: r('training') * 0.05,
  };
}

/**
 * WHAT A SEASON PAYS.
 *
 * Wins are most of it, because winning is the job — but a coach who takes a
 * bottom-of-the-table programme to .500 has done something a coach who took a
 * loaded one to the same record has not, so the level and the programme's own
 * standing both weigh in. A championship is worth a season on its own.
 */
export function pointsForSeason(
  career: FootballCareer, wins: number, losses: number, champion: boolean,
): number {
  const info = LEVELS[career.level];
  const games = Math.max(1, wins + losses);
  const rate = wins / games;
  let pts = wins * info.pointsPerWin;
  // Beating expectations is the part that is actually coaching.
  if (rate > 0.6) pts += Math.round((rate - 0.6) * info.pointsPerWin * games * 0.8);
  if (champion) pts += info.pointsPerWin * 6;
  return Math.max(2, Math.round(pts));
}

/** How the board feels after a season, which is what Challenge mode runs on. */
export function updateReputation(
  coach: Coach, wins: number, losses: number, champion: boolean,
): void {
  const games = Math.max(1, wins + losses);
  const rate = wins / games;
  const swing = (rate - 0.5) * 34 + (champion ? 18 : 0);
  coach.reputation = clamp(Math.round(coach.reputation + swing), 0, 99);
}
