/* ---------------------------------------------------------------------------
 * HOW HARD IS THIS CAREER?
 * ---------------------------------------------------------------------------
 * Four tiers, and the design rule that separates a good one from a lazy one:
 *
 *   DIFFICULTY IS NEVER A BONUS ON THE OPPONENT'S RATING.
 *
 * Every AI programme plays by exactly the rules the coach does. They get no
 * secret points, no hidden money and no ratings the world does not show. What
 * changes as the tiers climb is DECISIONS and RESOURCES: rival programmes scout
 * better and chase the right players harder, transfers have more suitors to
 * beat, Coach Points arrive more slowly and buy less, squads develop only as
 * well as they are managed, and the jobs on the table after a championship are
 * the ones nobody else wanted.
 *
 * The other rule: harder tiers must never break the world. A Final Challenge
 * high school team is not better than a Division I team — see levels.ts, where
 * the rating hierarchy lives, and `npm run hierarchy`, which fails the build if
 * a difficulty setting ever bends it.
 *
 * Every number below is surfaced in the game. The difficulty screen and the
 * comparison table are GENERATED from this table (see `MODIFIER_SPECS`), so
 * what the player is told is what the systems actually do — there is no second
 * copy of these numbers to drift out of date.
 * ------------------------------------------------------------------------- */

export type ChallengeTier = 'standard' | 'elite' | 'impossible' | 'final';

export const TIER_ORDER: ChallengeTier[] = ['standard', 'elite', 'impossible', 'final'];

export interface ChallengeModifiers {
  /* --- what the coach earns ------------------------------------------- */
  /** Multiplies Coach Points from games and seasons. */
  coachPoints: number;
  /** Multiplies coaching experience, which is what unlocks the upper tree. */
  coachXp: number;
  /** Multiplies the cost of the coach's own upgrades. */
  upgradeCost: number;
  /** Multiplies the cost of hiring programme staff. */
  staffCost: number;

  /* --- recruiting ------------------------------------------------------ */
  /** How hard rival programmes chase the players they want. */
  rivalPush: number;
  /** How well rivals evaluate: 1 means they see through the rankings as well
   *  as a fully-staffed scouting department does. */
  rivalScouting: number;
  /** Multiplies how fast your own interest with a prospect builds. */
  interestGain: number;
  /** Change to the number of offers you may hold out at once. */
  offers: number;

  /* --- the portal ------------------------------------------------------ */
  /** Points taken off every transfer pitch. */
  pitchResistance: number;
  /** Extra programmes competing for each player on the board. */
  portalRivals: number;
  /** Multiplies the chance your own players go looking elsewhere. */
  outgoingRisk: number;

  /* --- the squad ------------------------------------------------------- */
  /** Multiplies player growth over an offseason. */
  development: number;
  /** Multiplies the chance a young player breaks out. */
  breakouts: number;

  /* --- the job market -------------------------------------------------- */
  /** Shifts the window of programmes willing to hire you DOWN the prestige
   *  order. At the hardest tiers the phone only rings from the wreckage. */
  jobQuality: number;
  /** Weights the starting situation toward the genuinely broken ones. */
  situationSeverity: number;
  /** Added to the win percentage a programme demands of you. */
  expectation: number;

  /** Multiplies the final legacy score. */
  legacy: number;
}

export interface TierInfo {
  key: ChallengeTier;
  name: string;
  /** The one-word mark used on cards and the career tracker. */
  mark: string;
  /** CSS colour for the mark. */
  colour: string;
  tagline: string;
  /** Who this tier is for. */
  blurb: string;
  /** What a career here is expected to feel like. */
  expectation: string;
  mods: ChallengeModifiers;
}

/**
 * STANDARD is the baseline, and it is defined as "everything at 1.0". It is the
 * difficulty a full career was played and finished on in roughly seventeen
 * seasons, and every other tier is expressed as a departure from it — so if the
 * baseline is ever retuned, the whole ladder moves with it.
 */
const STANDARD_MODS: ChallengeModifiers = {
  coachPoints: 1,
  coachXp: 1,
  upgradeCost: 1,
  staffCost: 1,
  rivalPush: 1,
  rivalScouting: 0.35,
  interestGain: 1,
  offers: 0,
  pitchResistance: 0,
  portalRivals: 0,
  outgoingRisk: 1,
  development: 1,
  breakouts: 1,
  jobQuality: 0,
  situationSeverity: 0,
  expectation: 0,
  legacy: 1,
};

export const TIERS: Record<ChallengeTier, TierInfo> = {
  standard: {
    key: 'standard',
    name: 'Standard Challenge',
    mark: 'STANDARD',
    colour: 'var(--green)',
    tagline: 'The baseline. Difficult and fair.',
    blurb: 'Strong competition, real roster building, honest recruiting and championships '
      + 'that have to be won. The recommended way to play the climb for the first time.',
    expectation: 'A skilled coach who reads the systems well can reach the PLL. How long it '
      + 'takes is up to how quickly he wins titles — no two careers run the same length.',
    mods: STANDARD_MODS,
  },
  elite: {
    key: 'elite',
    name: 'Elite Challenge',
    mark: 'ELITE',
    colour: 'var(--accent)',
    tagline: 'For coaches who have already finished Standard.',
    blurb: 'Rival programmes recruit and scout properly, the portal is contested, and Coach '
      + 'Points no longer stretch far enough to buy everything. Mistakes still recoverable.',
    expectation: 'Expect to rebuild more than once and to lose players you wanted. A title at '
      + 'every rung is no longer a formality.',
    mods: {
      ...STANDARD_MODS,
      coachPoints: 0.82,
      coachXp: 0.88,
      upgradeCost: 1.3,
      staffCost: 1.2,
      rivalPush: 1.25,
      rivalScouting: 0.55,
      interestGain: 0.9,
      offers: -1,
      pitchResistance: 6,
      portalRivals: 1,
      outgoingRisk: 1.2,
      development: 0.92,
      breakouts: 0.85,
      jobQuality: -0.12,
      situationSeverity: 0.3,
      expectation: 0.02,
      legacy: 1.35,
    },
  },
  impossible: {
    key: 'impossible',
    name: 'Impossible Challenge',
    mark: 'IMPOSSIBLE',
    colour: 'var(--red)',
    tagline: 'A brutal coaching career for players who know the game.',
    blurb: 'Rivals evaluate talent nearly as well as a full scouting department, elite '
      + 'transfers are fought over, and every Coach Point has to be argued for. You will '
      + 'inherit programmes in genuine trouble and be expected to fix them.',
    expectation: 'You cannot buy your way out of a bad squad. Finding players before anybody '
      + 'else does, and developing the ones you have, is the whole job.',
    mods: {
      ...STANDARD_MODS,
      coachPoints: 0.64,
      coachXp: 0.76,
      upgradeCost: 1.7,
      staffCost: 1.45,
      rivalPush: 1.55,
      rivalScouting: 0.75,
      interestGain: 0.8,
      offers: -1,
      pitchResistance: 13,
      portalRivals: 2,
      outgoingRisk: 1.45,
      development: 0.84,
      breakouts: 0.7,
      jobQuality: -0.24,
      situationSeverity: 0.65,
      expectation: 0.04,
      legacy: 1.8,
    },
  },
  final: {
    key: 'final',
    name: 'Final Challenge',
    mark: 'FINAL',
    colour: 'var(--text)',
    tagline: 'The hardest way to conquer the lacrosse world.',
    blurb: 'Everything above, pushed to its limit. Rival programmes are run as well as you '
      + 'run yours, the portal rarely breaks your way, and the coach tree cannot be '
      + 'finished in one career — you have to decide what kind of coach you are.',
    expectation: 'Possible, and only just. Winning the PLL here means you mastered scouting, '
      + 'recruiting, development, the portal and the office at the same time, for decades.',
    mods: {
      ...STANDARD_MODS,
      coachPoints: 0.5,
      coachXp: 0.66,
      upgradeCost: 2.15,
      staffCost: 1.75,
      rivalPush: 1.9,
      rivalScouting: 0.92,
      interestGain: 0.72,
      offers: -2,
      pitchResistance: 20,
      portalRivals: 3,
      outgoingRisk: 1.7,
      development: 0.76,
      breakouts: 0.55,
      jobQuality: -0.34,
      situationSeverity: 1,
      expectation: 0.06,
      legacy: 2.4,
    },
  },
};

export const DEFAULT_TIER: ChallengeTier = 'standard';

export function tierInfo(tier: ChallengeTier | null | undefined): TierInfo {
  return TIERS[tier ?? DEFAULT_TIER] ?? TIERS[DEFAULT_TIER];
}

export function modsFor(tier: ChallengeTier | null | undefined): ChallengeModifiers {
  return tierInfo(tier).mods;
}

/* ------------------------------------------------- describing the tiers */

/**
 * One row of the comparison table, and one line of the "what makes this harder"
 * panel. The UI renders these; it never writes its own copy of a number, so the
 * screen and the simulation can never disagree about what a difficulty does.
 */
export interface ModifierSpec {
  /** What the player calls it. */
  label: string;
  /** Which group it belongs to on the detail panel. */
  group: 'Coach progression' | 'Recruiting' | 'Transfer portal' | 'Squad' | 'The job market';
  field: keyof ChallengeModifiers;
  /** true when a HIGHER number is harder for the player. */
  higherIsHarder: boolean;
  /** Renders the raw value for the comparison table. */
  format: (v: number) => string;
  /** Renders a change against the tier below. */
  delta: (from: number, to: number) => string;
}

const asPct = (v: number) => `${Math.round(v * 100)}%`;
const relPct = (from: number, to: number) => {
  const change = Math.round((to / from - 1) * 100);
  return `${change > 0 ? '+' : ''}${change}%`;
};
const flat = (from: number, to: number) => {
  const change = Math.round((to - from) * 10) / 10;
  return `${change > 0 ? '+' : ''}${change}`;
};

export const MODIFIER_SPECS: ModifierSpec[] = [
  {
    label: 'Coach Points earned', group: 'Coach progression', field: 'coachPoints',
    higherIsHarder: false, format: asPct, delta: relPct,
  },
  {
    label: 'Coaching experience', group: 'Coach progression', field: 'coachXp',
    higherIsHarder: false, format: asPct, delta: relPct,
  },
  {
    label: 'Coach upgrade cost', group: 'Coach progression', field: 'upgradeCost',
    higherIsHarder: true, format: asPct, delta: relPct,
  },
  {
    label: 'Programme staff cost', group: 'Coach progression', field: 'staffCost',
    higherIsHarder: true, format: asPct, delta: relPct,
  },
  {
    label: 'Rival recruiting effort', group: 'Recruiting', field: 'rivalPush',
    higherIsHarder: true, format: asPct, delta: relPct,
  },
  {
    label: 'Rival scouting accuracy', group: 'Recruiting', field: 'rivalScouting',
    higherIsHarder: true, format: asPct, delta: (a, b) => `${b > a ? '+' : ''}${Math.round((b - a) * 100)}pts`,
  },
  {
    label: 'Your interest builds at', group: 'Recruiting', field: 'interestGain',
    higherIsHarder: false, format: asPct, delta: relPct,
  },
  {
    label: 'Scholarship offers', group: 'Recruiting', field: 'offers',
    higherIsHarder: false, format: (v) => (v === 0 ? 'Standard' : `${v}`), delta: flat,
  },
  {
    label: 'Transfer resistance', group: 'Transfer portal', field: 'pitchResistance',
    higherIsHarder: true, format: (v) => (v === 0 ? 'None' : `-${v} pts`), delta: flat,
  },
  {
    label: 'Rivals per transfer', group: 'Transfer portal', field: 'portalRivals',
    higherIsHarder: true, format: (v) => (v === 0 ? 'Standard' : `+${v}`), delta: flat,
  },
  {
    label: 'Your players leaving', group: 'Transfer portal', field: 'outgoingRisk',
    higherIsHarder: true, format: asPct, delta: relPct,
  },
  {
    label: 'Player development', group: 'Squad', field: 'development',
    higherIsHarder: false, format: asPct, delta: relPct,
  },
  {
    label: 'Breakout seasons', group: 'Squad', field: 'breakouts',
    higherIsHarder: false, format: asPct, delta: relPct,
  },
  {
    label: 'Quality of jobs offered', group: 'The job market', field: 'jobQuality',
    higherIsHarder: false,
    format: (v) => (v === 0 ? 'Standard' : `${Math.round(v * 100)}%`),
    delta: (a, b) => `${Math.round((b - a) * 100)}pts`,
  },
  {
    label: 'Broken programmes', group: 'The job market', field: 'situationSeverity',
    higherIsHarder: true,
    format: (v) => (v === 0 ? 'Standard' : `+${Math.round(v * 100)}%`),
    delta: (a, b) => `+${Math.round((b - a) * 100)}pts`,
  },
  {
    label: 'What they demand of you', group: 'The job market', field: 'expectation',
    higherIsHarder: true,
    format: (v) => (v === 0 ? 'Standard' : `+${Math.round(v * 100)} win%`),
    delta: (a, b) => `+${Math.round((b - a) * 100)} win%`,
  },
];

export interface TierDifference {
  spec: ModifierSpec;
  /** true when this change makes the game harder. */
  harder: boolean;
  text: string;
}

/**
 * Every meaningful way `tier` differs from the tier below it, worked out from
 * the numbers rather than written down twice. Standard returns an empty list:
 * it is the thing everything else is measured against.
 */
export function differencesFrom(tier: ChallengeTier): TierDifference[] {
  const index = TIER_ORDER.indexOf(tier);
  if (index <= 0) return [];
  const below = TIERS[TIER_ORDER[index - 1]].mods;
  const here = TIERS[tier].mods;
  const out: TierDifference[] = [];
  for (const spec of MODIFIER_SPECS) {
    const from = below[spec.field];
    const to = here[spec.field];
    if (from === to) continue;
    const harder = spec.higherIsHarder ? to > from : to < from;
    out.push({ spec, harder, text: `${spec.label} ${spec.delta(from, to)}` });
  }
  return out;
}

/** The tier below this one, for "harder than…" headings. */
export function tierBelow(tier: ChallengeTier): ChallengeTier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i > 0 ? TIER_ORDER[i - 1] : null;
}
