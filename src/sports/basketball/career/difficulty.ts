/* ---------------------------------------------------------------------------
 * HOW HARD IS THIS CAREER?
 * ---------------------------------------------------------------------------
 * Five tiers, and the one design rule that separates a real difficulty setting
 * from a lazy one:
 *
 *   DIFFICULTY IS NEVER A BONUS ON THE OPPONENT'S RATING.
 *
 * Every rival programme in the game plays by exactly the rules the coach does.
 * They get no secret points, no hidden money and no players the world does not
 * show. What changes as the tiers climb is DECISIONS and RESOURCES: rival
 * programmes chase the players they want harder, transfers have more suitors to
 * beat, Coach Points arrive more slowly and buy less, squads develop only as
 * well as they are managed, the programme that hires you after a title is the
 * one nobody else would take, and the board wants more.
 *
 * WHAT BARELY CHANGES IS COACHING ITSELF. Development is nearly flat across the
 * five tiers on purpose: your work with a player works. What a harder tier takes
 * away is what you can AFFORD and who you can SIGN — and when development was the
 * lever instead, the top tiers stopped being hard and became arithmetic, because a
 * squad that develops at seven-tenths the rate can never reach the standard of a
 * league whose rivals reload at it every summer.
 *
 * The other rule: a harder tier must never break the world. A Legendary-tier
 * high school is not better than a professional club — see levels.ts, where the
 * hierarchy lives, and `npm run hoops-world`, which fails the build if anything
 * ever bends it.
 *
 * Every number below is surfaced in the game: the difficulty screen and its
 * comparison table are GENERATED from this table, so what the player is told is
 * what the systems actually do.
 * ------------------------------------------------------------------------- */

export type HoopsTier = 'standard' | 'hard' | 'veryhard' | 'impossible' | 'legendary';

export const TIER_ORDER: HoopsTier[] = [
  'standard', 'hard', 'veryhard', 'impossible', 'legendary',
];

export interface TierMods {
  /* --- what the coach earns -------------------------------------------- */
  /** Multiplies Coach Points from every source. */
  coachPoints: number;
  /** Multiplies the cost of every upgrade. */
  upgradeCost: number;

  /* --- recruiting ------------------------------------------------------- */
  /** How hard rival programmes chase the players they want. */
  rivalPush: number;
  /** Multiplies how fast your own interest with a recruit builds. */
  interestGain: number;
  /** Change to how many scholarship offers you may hold open at once. */
  offers: number;
  /** How well rivals evaluate: 1 means they see through a ranking as well as you do. */
  rivalEye: number;

  /* --- the portal ------------------------------------------------------- */
  /** Points taken off every approach to a transfer. */
  pitchResistance: number;
  /** Extra programmes competing for each name in the window. */
  portalRivals: number;
  /** Multiplies the chance your own players start listening elsewhere. */
  outgoingRisk: number;

  /* --- the squad -------------------------------------------------------- */
  /**
   * Rating points the programme you START a climb with sits below its peers. The
   * first job is meant to be the worst job in the league.
   */
  startingHole: number;
  /** Multiplies how much a squad grows over an offseason. */
  development: number;
  /** Multiplies how often a young player breaks out. */
  breakouts: number;

  /* --- the job market --------------------------------------------------- */
  /** Shifts the window of programmes willing to hire you DOWN the prestige order. */
  jobQuality: number;
  /** Added to the win percentage a programme demands of you. */
  expectation: number;
  /** How much worse the situation you inherit tends to be. */
  situationSeverity: number;

  /** Multiplies the final legacy score. */
  legacy: number;
}

export interface TierInfo {
  key: HoopsTier;
  name: string;
  /** The one-word mark used on cards and the career tracker. */
  mark: string;
  colour: string;
  tagline: string;
  blurb: string;
  /** What a career here is expected to feel like. */
  expectation: string;
  mods: TierMods;
}

/**
 * STANDARD is the baseline, and it is defined as "everything neutral". Every
 * other tier is expressed as a departure from it, so retuning the baseline moves
 * the whole ladder with it.
 */
const STANDARD: TierMods = {
  coachPoints: 1,
  upgradeCost: 1,
  rivalPush: 1,
  interestGain: 1,
  offers: 0,
  rivalEye: 0.35,
  pitchResistance: 0,
  portalRivals: 0,
  outgoingRisk: 1,
  startingHole: 5,
  development: 1,
  breakouts: 1,
  jobQuality: 0,
  expectation: 0,
  situationSeverity: 0,
  legacy: 1,
};

export const TIERS: Record<HoopsTier, TierInfo> = {
  standard: {
    key: 'standard',
    name: 'Standard',
    mark: 'STD',
    colour: 'var(--green)',
    tagline: 'A hard career that a good coach finishes.',
    blurb: 'Everything at its honest setting. You will be sacked at least once, '
      + 'and you will need most of a working life to reach the top.',
    expectation: 'Roughly fifteen to twenty seasons to win at the top, if you are good.',
    mods: STANDARD,
  },
  hard: {
    key: 'hard',
    name: 'Hard',
    mark: 'HRD',
    colour: 'var(--accent)',
    tagline: 'Fewer resources, and rivals who want the same players.',
    blurb: 'Points come slower and cost more. The programmes you are recruiting '
      + 'against push harder, and your own squad grows only as well as you coach it.',
    expectation: 'Twenty seasons or more, and a career that cannot afford a wasted one.',
    mods: {
      ...STANDARD,
      coachPoints: 0.82,
      upgradeCost: 1.15,
      rivalPush: 1.25,
      interestGain: 0.88,
      rivalEye: 0.5,
      pitchResistance: 4,
      portalRivals: 1,
      outgoingRisk: 1.15,
      startingHole: 8,
      development: 0.94,
      breakouts: 0.9,
      jobQuality: -0.06,
      expectation: 0.03,
      situationSeverity: 0.25,
      legacy: 1.35,
    },
  },
  veryhard: {
    key: 'veryhard',
    name: 'Very Hard',
    mark: 'VH',
    colour: 'var(--orange)',
    tagline: 'The phone rings, but never with a good job.',
    blurb: 'You will win championships with squads that should not have won them, '
      + 'and the reward will be another programme in trouble.',
    expectation: 'A long career, and several jobs you had to rebuild from nothing.',
    mods: {
      ...STANDARD,
      coachPoints: 0.68,
      upgradeCost: 1.3,
      rivalPush: 1.5,
      interestGain: 0.78,
      offers: -1,
      rivalEye: 0.65,
      pitchResistance: 8,
      portalRivals: 2,
      outgoingRisk: 1.3,
      startingHole: 11,
      development: 0.92,
      breakouts: 0.8,
      jobQuality: -0.12,
      expectation: 0.05,
      situationSeverity: 0.5,
      legacy: 1.8,
    },
  },
  impossible: {
    key: 'impossible',
    name: 'Impossible',
    mark: 'IMP',
    colour: 'var(--red)',
    tagline: 'Everything is harder and nothing is unfair.',
    blurb: 'Rival programmes evaluate as well as you do and chase harder than you '
      + 'can. Your points buy half of what they used to. Every squad you inherit '
      + 'is a mess somebody else made.',
    expectation: 'Most careers here end with a coach nobody will hire.',
    mods: {
      ...STANDARD,
      coachPoints: 0.54,
      upgradeCost: 1.5,
      rivalPush: 1.8,
      interestGain: 0.68,
      offers: -1,
      rivalEye: 0.82,
      pitchResistance: 11,
      portalRivals: 3,
      outgoingRisk: 1.5,
      startingHole: 14,
      development: 0.9,
      breakouts: 0.7,
      jobQuality: -0.18,
      expectation: 0.07,
      situationSeverity: 0.75,
      legacy: 2.4,
    },
  },
  legendary: {
    key: 'legendary',
    name: 'Legendary',
    mark: 'LGD',
    colour: '#c9a3ff',
    tagline: 'For coaches who have already finished this game.',
    blurb: 'Rivals see every player exactly as clearly as you do, chase everybody '
      + 'you want, and outbid you in the window. Points barely arrive. Squads '
      + 'improve only when you have paid for the staff to improve them.',
    expectation: 'Finishing a career here is the hardest thing in the game.',
    mods: {
      ...STANDARD,
      coachPoints: 0.42,
      upgradeCost: 1.75,
      rivalPush: 2.2,
      interestGain: 0.58,
      offers: -2,
      rivalEye: 1,
      pitchResistance: 14,
      portalRivals: 4,
      outgoingRisk: 1.6,
      startingHole: 18,
      development: 0.88,
      breakouts: 0.62,
      jobQuality: -0.24,
      expectation: 0.09,
      situationSeverity: 1,
      legacy: 3.2,
    },
  },
};

export const DEFAULT_TIER: HoopsTier = 'standard';

/* ------------------------------------------------- the tier, on the floor */

/**
 * What a career tier is worth WHEN YOU ARE ACTUALLY PLAYING.
 *
 * The rule has not changed: no rival gets a rating it did not earn, and nothing
 * here touches an attribute. What a harder career changes on the floor is how
 * well the game is played around you and how much room your own thumb gets — a
 * smaller release window, contests that bite harder, a defence that reacts
 * sooner and makes fewer messes of its own.
 *
 * A coach who chose Legendary should feel it in his hands in the first minute of
 * the first game, not only on the recruiting board in April.
 */
export interface CourtFeel {
  /** Multiplies the human's release window. */
  window: number;
  /** Multiplies what a contest takes off a shot. */
  contest: number;
  /** Multiplies how harshly a bad release is punished. */
  timingBite: number;
  /** Multiplies AI reaction time. Lower is sharper. */
  reaction: number;
  /** Multiplies AI passing error and general sloppiness. */
  passError: number;
  mistake: number;
  /** How disciplined AI defence is. Higher means fewer cheap fouls. */
  discipline: number;
  /** How hard the AI works the glass. */
  glass: number;
  /** How well AI defenders pick the right rotation. */
  rotation: number;
}

const COURT_FEEL: Record<HoopsTier, CourtFeel> = {
  standard: {
    window: 1.12, contest: 0.9, timingBite: 0.85,
    reaction: 1.2, passError: 1.15, mistake: 1.2, discipline: 0.92,
    glass: 0.92, rotation: 0.68,
  },
  hard: {
    window: 1, contest: 1, timingBite: 1,
    reaction: 1, passError: 1, mistake: 1, discipline: 1,
    glass: 1, rotation: 0.78,
  },
  veryhard: {
    window: 0.88, contest: 1.16, timingBite: 1.18,
    reaction: 0.88, passError: 0.84, mistake: 0.8, discipline: 1.1,
    glass: 1.06, rotation: 0.86,
  },
  impossible: {
    window: 0.76, contest: 1.34, timingBite: 1.4,
    reaction: 0.76, passError: 0.68, mistake: 0.6, discipline: 1.2,
    glass: 1.13, rotation: 0.93,
  },
  legendary: {
    window: 0.66, contest: 1.55, timingBite: 1.65,
    reaction: 0.66, passError: 0.54, mistake: 0.45, discipline: 1.3,
    glass: 1.2, rotation: 1,
  },
};

export const courtFeel = (t: HoopsTier): CourtFeel => COURT_FEEL[t];

export const tierInfo = (t: HoopsTier): TierInfo => TIERS[t];
export const modsFor = (t: HoopsTier): TierMods => TIERS[t].mods;

/* ----------------------------------------------- the comparison, generated */

/**
 * The difficulty screen's table is BUILT from the modifiers above rather than
 * written next to them, so what the player reads is what the systems do. A
 * second copy of these numbers in prose is a second copy that goes stale.
 */
export interface ModifierSpec {
  label: string;
  /** What it means, one line. */
  blurb: string;
  pick: (m: TierMods) => number;
  /** How to say it. */
  show: (n: number) => string;
  /** True when a bigger number is worse for the coach. */
  higherIsHarder: boolean;
}

const pctOf = (n: number): string => `${Math.round(n * 100)}%`;
const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

export const MODIFIER_SPECS: ModifierSpec[] = [
  {
    label: 'Coach Points earned',
    blurb: 'From wins, trophies and players you develop.',
    pick: (m) => m.coachPoints, show: pctOf, higherIsHarder: false,
  },
  {
    label: 'Upgrade cost',
    blurb: 'What everything on the coaching tree costs.',
    pick: (m) => m.upgradeCost, show: pctOf, higherIsHarder: true,
  },
  {
    label: 'Rivals chasing your recruits',
    blurb: 'How hard other programmes go after the players you want.',
    pick: (m) => m.rivalPush, show: pctOf, higherIsHarder: true,
  },
  {
    label: 'How well rivals evaluate',
    blurb: 'At 100% they see a player exactly as clearly as you do.',
    pick: (m) => m.rivalEye, show: pctOf, higherIsHarder: true,
  },
  {
    label: 'Your interest with a recruit',
    blurb: 'How fast a player warms to you while you are recruiting him.',
    pick: (m) => m.interestGain, show: pctOf, higherIsHarder: false,
  },
  {
    label: 'Scholarship offers open at once',
    blurb: 'How many players you can be seriously recruiting at a time.',
    pick: (m) => m.offers, show: signed, higherIsHarder: false,
  },
  {
    label: 'Transfers resist your approach',
    blurb: 'Points taken off every pitch you make in the window.',
    pick: (m) => m.pitchResistance, show: (n) => `-${n}`, higherIsHarder: true,
  },
  {
    label: 'Rivals in the window',
    blurb: 'Extra programmes competing for each name on the board.',
    pick: (m) => m.portalRivals, show: signed, higherIsHarder: true,
  },
  {
    label: 'Your own players looking elsewhere',
    blurb: 'How often somebody on your roster starts taking calls.',
    pick: (m) => m.outgoingRisk, show: pctOf, higherIsHarder: true,
  },
  {
    label: 'How far behind you start',
    blurb: 'Rating points the first programme sits below its peers.',
    pick: (m) => m.startingHole, show: (n) => `-${n}`, higherIsHarder: true,
  },
  {
    label: 'Player development',
    blurb: 'How much your squad improves between seasons.',
    pick: (m) => m.development, show: pctOf, higherIsHarder: false,
  },
  {
    label: 'Breakout seasons',
    blurb: 'How often a young player takes a step nobody saw coming.',
    pick: (m) => m.breakouts, show: pctOf, higherIsHarder: false,
  },
  {
    label: 'What the board expects',
    blurb: 'Added to the win percentage your programme demands.',
    pick: (m) => m.expectation, show: (n) => (n ? `+${Math.round(n * 100)} pts` : '—'),
    higherIsHarder: true,
  },
  {
    label: 'The jobs you are offered',
    blurb: 'How far down the prestige order the phone rings from.',
    pick: (m) => m.jobQuality, show: (n) => (n ? `${Math.round(n * 100)}%` : '—'),
    higherIsHarder: false,
  },
  {
    label: 'Legacy multiplier',
    blurb: 'What the career is worth when it is over.',
    pick: (m) => m.legacy, show: (n) => `${n}x`, higherIsHarder: false,
  },
];
