import type { CoachPerks } from '../challenge/coach';

/* ---------------------------------------------------------------------------
 * THE COACH'S OFFICE
 * ---------------------------------------------------------------------------
 * Coach Points were a number on a screen. Now they buy the five things a real
 * programme is built out of, and each one changes something you can point at:
 *
 *   OFFENSE       how your team plays without the ball, in the match engine
 *   DEFENSE       how it slides and pressures, in the match engine
 *   DEVELOPMENT   how much your players improve in the offseason
 *   CONDITIONING  stamina in games, athleticism over a career
 *   CULTURE       chemistry, keeping your own players, attracting transfers
 *
 * Costs rise steeply, so nobody maxes everything: by year five a good coach has
 * two strong tracks and has chosen what to leave behind. Nothing here inflates
 * ratings — the offensive and defensive tracks make the AI on your side think
 * better, which is exactly what a good coach does.
 * ------------------------------------------------------------------------- */

export type CoachTrack = 'offense' | 'defense' | 'development' | 'conditioning' | 'culture';

export const TRACK_ORDER: CoachTrack[] = [
  'offense', 'defense', 'development', 'conditioning', 'culture',
];

export const MAX_LEVEL = 4;

export interface TrackInfo {
  label: string;
  blurb: string;
  /** Level names, index 0 = untrained. */
  levels: string[];
  /** What each level actually does, shown in the office. */
  effects: string[];
}

export const TRACKS: Record<CoachTrack, TrackInfo> = {
  offense: {
    label: 'Offensive scheme',
    blurb: 'Off-ball movement, spacing, cutting and transition.',
    levels: ['Basic offense', 'Organised sets', 'Balanced system', 'Advanced offense', 'Elite system'],
    effects: [
      'Players hold their spots and little else.',
      'Better spacing off the ball, and cutters time their dives.',
      'Cleaner passing decisions and a quicker look in transition.',
      'The offence rotates to the ball and hunts the open man.',
      'Reads slides a step early and punishes them.',
    ],
  },
  defense: {
    label: 'Defensive scheme',
    blurb: 'Positioning, slide timing, help defence and takeaways.',
    levels: ['Basic defense', 'Team slides', 'Organised help', 'Advanced defense', 'Elite system'],
    effects: [
      'Defenders guard their own man and hope.',
      'Slides arrive on time more often than not.',
      'Tighter marks and more attempts on the ball.',
      'Help recovers and passing lanes get covered.',
      'A defence that takes the ball away rather than waiting for a miss.',
    ],
  },
  development: {
    label: 'Player development',
    blurb: 'How much your squad improves between seasons.',
    levels: ['No programme', 'Skill sessions', 'Position coaching', 'Year-round programme', 'Elite development'],
    effects: [
      'Players improve on their own or not at all.',
      'A little more growth across the roster.',
      'Underclassmen develop noticeably faster.',
      'Breakout seasons become common, and nobody stagnates.',
      'Your programme gets the most out of every player it has.',
    ],
  },
  conditioning: {
    label: 'Strength and conditioning',
    blurb: 'Stamina in the fourth quarter, speed over a career.',
    levels: ['None', 'Offseason lifting', 'Year-round S&C', 'Sports science', 'Elite programme'],
    effects: [
      'Legs go late in games.',
      'A little more in the tank, and speed grows over time.',
      'Noticeably fresher late, with real athletic development.',
      'Your team is the fitter one in most fourth quarters.',
      'Nobody outruns you in the last five minutes.',
    ],
  },
  culture: {
    label: 'Team culture',
    blurb: 'Chemistry, keeping your players, attracting transfers.',
    levels: ['Unsettled', 'Steady', 'Strong', 'Excellent', 'Everyone wants in'],
    effects: [
      'Players leave when things go badly.',
      'Chemistry builds and fewer players look elsewhere.',
      'A programme players talk about. Transfers listen.',
      'Chemistry compounds and your own squad stays.',
      'Your reputation opens doors a rating cannot.',
    ],
  },
};

export type CoachStaff = Record<CoachTrack, number>;

export const EMPTY_STAFF: CoachStaff = {
  offense: 0, defense: 0, development: 0, conditioning: 0, culture: 0,
};

/** Steep enough that the fifth level is a real commitment. */
const COSTS = [12, 20, 32, 48];

export function upgradeCost(level: number): number | null {
  return level >= MAX_LEVEL ? null : COSTS[level];
}

/** Total points sunk into the staff, used for reputation and transfer appeal. */
export function staffInvestment(staff: CoachStaff): number {
  let total = 0;
  for (const t of TRACK_ORDER) {
    for (let i = 0; i < staff[t]; i++) total += COSTS[i];
  }
  return total;
}

/**
 * What the staff is worth, in the units each system actually uses.
 * Everything is a modest multiplier or offset: a maxed track is a clear edge,
 * never a different sport.
 */
export interface CoachEffects {
  /** Offense: extra off-ball spacing discipline and cut timing, 0..1. */
  offenseIQ: number;
  /** Defense: slide timing and lane awareness, 0..1. */
  defenseIQ: number;
  /** Multiplier on offseason development. */
  developmentRate: number;
  /** Multiplier on how often a player breaks out. */
  breakoutRate: number;
  /** In-game stamina regeneration multiplier. */
  staminaRate: number;
  /** Extra weight on speed/stamina growth in the offseason. */
  athleticGrowth: number;
  /** Chemistry gained per season. */
  chemistryGain: number;
  /** 0..1 — how strongly the programme holds on to its own players. */
  retention: number;
  /** 0..1 — how appealing the programme is to a transfer. */
  appeal: number;
}

export function coachEffects(staff: CoachStaff): CoachEffects {
  const f = (level: number) => level / MAX_LEVEL; // 0..1
  return {
    offenseIQ: f(staff.offense),
    defenseIQ: f(staff.defense),
    developmentRate: 1 + f(staff.development) * 0.85,
    breakoutRate: 1 + f(staff.development) * 1.3,
    staminaRate: 1 + f(staff.conditioning) * 0.5,
    athleticGrowth: f(staff.conditioning),
    chemistryGain: f(staff.culture) * 3.2,
    retention: f(staff.culture),
    appeal: f(staff.culture) * 0.7 + f(staff.development) * 0.3,
  };
}

/**
 * The office AND everything the coach has earned across his career, combined.
 * Every system that reads a CoachEffects reads the combined value, so an
 * upgrade on the coach's own tree is never a label with nothing behind it.
 */
export function withPerks(fx: CoachEffects, perks: CoachPerks): CoachEffects {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  return {
    ...fx,
    offenseIQ: clamp01(fx.offenseIQ + perks.gameday),
    defenseIQ: clamp01(fx.defenseIQ + perks.gameday),
    developmentRate: fx.developmentRate * perks.development,
    breakoutRate: fx.breakoutRate * perks.breakouts,
    chemistryGain: fx.chemistryGain + perks.chemistry,
    retention: clamp01(fx.retention + perks.retention),
    appeal: clamp01(fx.appeal + perks.interestFloor / 60),
  };
}

/** A one-line summary for the hub. */
export function staffSummary(staff: CoachStaff): string {
  const best = TRACK_ORDER
    .filter((t) => staff[t] > 0)
    .sort((a, b) => staff[b] - staff[a])
    .slice(0, 2);
  if (!best.length) return 'No staff hired yet';
  return best.map((t) => `${TRACKS[t].label}: ${TRACKS[t].levels[staff[t]]}`).join(' · ');
}
