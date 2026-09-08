/* ---------------------------------------------------------------------------
 * STARTING SITUATIONS
 * ---------------------------------------------------------------------------
 * Nobody hires a coach because everything is fine. Every job in Challenge Mode
 * arrives with a specific, named problem, and the problem is real: it is
 * applied to the roster you inherit, not printed on a screen.
 *
 * A rebuilding job genuinely hands you a squad of underclassmen. A goalie
 * problem genuinely means the man in the cage cannot stop the ball. What makes
 * this fair rather than cruel is that each situation also lowers what the
 * programme expects of you — you are not fired for failing to win with a roster
 * that cannot win. What it costs you is TIME, and time is the currency of a
 * career that has nine rungs and one lifetime to climb them.
 * ------------------------------------------------------------------------- */

import type { Rng } from '../core/rng';
import { clamp } from '../core/math';
import {
  refreshOverall, sortDepthChart, type Grade, type PlayerData,
} from '../data/players';
import { LEVELS, type Level } from '../data/levels';

export type SituationKey =
  | 'rebuild' | 'underdog' | 'talent' | 'chemistry'
  | 'graduation' | 'defense' | 'offense' | 'goalie' | 'stable';

export interface SituationInfo {
  key: SituationKey;
  label: string;
  /** What you are walking into. */
  blurb: string;
  /** What it will take to fix it. */
  fix: string;
  /** How much easier the board is on you because of it, in win percentage. */
  expectationRelief: number;
  /** Rough severity, for sorting job offers. */
  severity: number;
}

export const SITUATIONS: Record<SituationKey, SituationInfo> = {
  rebuild: {
    key: 'rebuild',
    label: 'Full rebuild',
    blurb: 'The squad is almost entirely underclassmen. They will lose, and they will lose badly, and in three years they will be very good.',
    fix: 'Survive two seasons. Develop everybody. Do not panic.',
    expectationRelief: 0.18,
    severity: 3,
  },
  underdog: {
    key: 'underdog',
    label: 'Bottom of the table',
    blurb: 'This programme finished last and everybody expects it to finish last again.',
    fix: 'Out-coach teams with better players. Steal a season.',
    expectationRelief: 0.14,
    severity: 3,
  },
  talent: {
    key: 'talent',
    label: 'No talent in the building',
    blurb: 'Not a single player on this roster has a ceiling worth the name. Development will not save you; recruiting might.',
    fix: 'Scout hard and sign better players than the ones you have.',
    expectationRelief: 0.16,
    severity: 4,
  },
  chemistry: {
    key: 'chemistry',
    label: 'A broken locker room',
    blurb: 'The talent is fine. Nobody passes to anybody. The last coach lost the room and left it that way.',
    fix: 'Culture. It is the slowest track in the office and the only one that works here.',
    expectationRelief: 0.1,
    severity: 2,
  },
  graduation: {
    key: 'graduation',
    label: 'Graduation cliff',
    blurb: 'You have inherited a good team. Almost all of it leaves at the end of this season.',
    fix: 'Win now, and recruit as if next year is the one you are judged on. It is.',
    expectationRelief: 0.02,
    severity: 3,
  },
  defense: {
    key: 'defense',
    label: 'Defensive disaster',
    blurb: 'This team concedes double figures every week. The poles are slow and the slides never arrive.',
    fix: 'The defensive track in the office, and a defensive recruiting class.',
    expectationRelief: 0.12,
    severity: 2,
  },
  offense: {
    key: 'offense',
    label: 'Cannot score',
    blurb: 'They defend well enough to stay in every game and then lose it 5-4.',
    fix: 'Find a finisher. Until then, keep every game low and steal them.',
    expectationRelief: 0.12,
    severity: 2,
  },
  goalie: {
    key: 'goalie',
    label: 'No goalie',
    blurb: 'The man in the cage is a field player in a chest protector. Everything else about this team is respectable.',
    fix: 'One recruit fixes this. Finding him is the hard part.',
    expectationRelief: 0.1,
    severity: 2,
  },
  stable: {
    key: 'stable',
    label: 'A settled programme',
    blurb: 'No crisis. A functioning roster, a reasonable budget, and a board that expects to win because of it.',
    fix: 'Nothing to fix. Everything to prove.',
    expectationRelief: -0.04,
    severity: 0,
  },
};

export const SITUATION_ORDER: SituationKey[] = [
  'rebuild', 'underdog', 'talent', 'chemistry', 'graduation', 'defense', 'offense', 'goalie', 'stable',
];

/**
 * Applies a situation to a roster in place. This is the whole point: the coach
 * is not told his defence is bad, he is handed defenders who cannot defend.
 */
export function applySituation(
  key: SituationKey, roster: PlayerData[], rng: Rng, level: Level,
): PlayerData[] {
  const pro = LEVELS[level].ageSystem === 'pro';
  const bump = (p: PlayerData, keys: (keyof PlayerData['attrs'])[], delta: number) => {
    for (const k of keys) p.attrs[k] = Math.round(clamp(p.attrs[k] + delta, 20, 99));
    refreshOverall(p);
  };

  switch (key) {
    case 'rebuild':
      for (const p of roster) {
        // Everybody is young. A professional squad gets rookies instead.
        p.grade = (pro ? rng.pick([9, 9, 10]) : rng.pick([9, 9, 9, 10, 10])) as Grade;
        bump(p, ['shooting', 'shotAccuracy', 'dodging', 'defense', 'checking', 'awareness', 'goalie'], -rng.range(5, 11));
        // The upside is real: this is a squad worth coaching.
        p.potential = Math.round(clamp(p.potential + rng.range(3, 9), p.overall, 99));
      }
      break;

    case 'underdog':
      for (const p of roster) bump(p, Object.keys(p.attrs) as (keyof PlayerData['attrs'])[], -rng.range(3, 7));
      break;

    case 'talent':
      for (const p of roster) {
        // The ceiling is the problem, not the floor. They are what they are.
        p.potential = Math.round(clamp(p.overall + rng.range(0, 3), 20, 99));
        if (p.dev) p.dev.curve = 'early';
      }
      break;

    case 'chemistry':
      for (const p of roster) bump(p, ['passing', 'awareness'], -rng.range(8, 15));
      break;

    case 'graduation':
      for (const p of roster) {
        p.grade = 12;
        bump(p, ['shooting', 'defense', 'checking', 'awareness'], rng.range(2, 6));
        p.potential = Math.max(p.potential, p.overall);
      }
      break;

    case 'defense':
      for (const p of roster) {
        if (p.pos === 'D' || p.pos === 'G') bump(p, ['defense', 'checking', 'awareness', 'goalie', 'speed'], -rng.range(9, 16));
      }
      break;

    case 'offense':
      for (const p of roster) {
        if (p.pos === 'A' || p.pos === 'M') bump(p, ['shooting', 'shotAccuracy', 'shotPower', 'dodging'], -rng.range(9, 16));
      }
      break;

    case 'goalie':
      for (const p of roster) {
        if (p.pos === 'G') bump(p, ['goalie', 'awareness'], -rng.range(16, 26));
      }
      break;

    case 'stable':
      break;
  }
  return sortDepthChart(roster);
}

/** Team ratings the situation implies, so the league sees the same team you do. */
export function situationRatingShift(key: SituationKey): Partial<Record<
  'overall' | 'offense' | 'defense' | 'goalie' | 'chemistry', number
>> {
  switch (key) {
    case 'rebuild': return { overall: -8, offense: -7, defense: -7 };
    case 'underdog': return { overall: -6, offense: -5, defense: -5 };
    case 'talent': return { overall: -3 };
    case 'chemistry': return { chemistry: -28, overall: -4 };
    case 'graduation': return { overall: 2 };
    case 'defense': return { defense: -13, goalie: -8, overall: -6 };
    case 'offense': return { offense: -13, overall: -6 };
    case 'goalie': return { goalie: -20, overall: -4 };
    case 'stable': return {};
  }
}

/**
 * Picks the situation a given programme is in. Weak programmes are more likely
 * to be broken; strong ones are more likely to be stable but can still be one
 * graduating class away from trouble.
 */
export function situationFor(prestige: number, rng: Rng): SituationKey {
  const weak = prestige < 55;
  const strong = prestige > 78;
  const pool: SituationKey[] = weak
    ? ['rebuild', 'talent', 'underdog', 'defense', 'offense', 'goalie', 'chemistry', 'rebuild', 'talent']
    : strong
      ? ['stable', 'graduation', 'chemistry', 'stable', 'goalie', 'defense']
      : ['rebuild', 'chemistry', 'graduation', 'defense', 'offense', 'goalie', 'underdog', 'stable'];
  return rng.pick(pool);
}
