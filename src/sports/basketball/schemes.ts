import { clamp } from '../../core/math';
import { POSITIONS, starters, type AttrKey, type HoopsPlayer } from './data';

/* ---------------------------------------------------------------------------
 * WHAT YOUR TEAM RUNS
 * ---------------------------------------------------------------------------
 * A scheme in this game is not a label on a settings screen. Every one of them
 * resolves into the same small set of KNOBS, and both engines — the one you play
 * and the fast one that simulates the rest of the league — read those knobs and
 * nothing else. Pick five-out and your team really does stand five men behind
 * the arc, shoot more threes, get to the rim less and give up second chances.
 * Pick a 2-3 zone and the other side really does shoot more from outside and
 * fewer at the rim, and your guards really do stop gambling for steals.
 *
 * THE SECOND RULE, and the one that makes the choice a decision rather than a
 * lookup: A SCHEME IS ONLY WORTH WHAT YOUR PLAYERS CAN RUN. Five-out with no
 * shooters is worse than nothing. A press with no legs is worse than nothing. So
 * every scheme declares what it needs, `schemeFit` measures how much of that the
 * squad actually has, and a scheme run by the wrong personnel is faded toward
 * neutral and then taxed. There is no best scheme; there is a best scheme for
 * this roster.
 * ------------------------------------------------------------------------- */

export type OffenseScheme =
  | 'motion' | 'fiveOut' | 'fourOneIn' | 'pickRoll' | 'post' | 'fastBreak' | 'iso';

export type DefenseScheme =
  | 'man' | 'zone23' | 'zone32' | 'press' | 'halfCourt';

export const OFFENSE_ORDER: OffenseScheme[] = [
  'motion', 'fiveOut', 'fourOneIn', 'pickRoll', 'post', 'fastBreak', 'iso',
];

export const DEFENSE_ORDER: DefenseScheme[] = [
  'man', 'zone23', 'zone32', 'press', 'halfCourt',
];

/**
 * The knobs. Everything is a multiplier around 1 or an offset around 0, so the
 * neutral scheme is exactly the basketball this game played before schemes
 * existed — which is what keeps an exhibition an exhibition.
 */
export interface SchemeEffects {
  /* --- offence --------------------------------------------------------- */
  /** Multiplies how early in the clock a possession is willing to shoot. */
  tempo: number;
  /** Added to the bar a three has to clear. Positive means fewer threes. */
  threeBias: number;
  /** Multiplies what driving to the rim is worth. */
  driveBias: number;
  /** How many of the five stand beyond the arc. The rest work inside. */
  arcPlayers: number;
  /** Multiplies how willing the ball-handler is to give it up. */
  ballMovement: number;
  /** Multiplies how hard the offence crashes the offensive glass. */
  crash: number;
  /** Multiplies how often a big man comes up to set a screen. */
  screens: number;
  /** Multiplies how much of the offence runs through the best player. */
  isolation: number;
  /** Multiplies how hard the team runs in transition. */
  transition: number;

  /* --- defence --------------------------------------------------------- */
  /**
   * How far from their own basket this defence is still willing to chase the
   * ball, in feet. The whole floor is 94, which is the default and is what
   * man-to-man and a press both do — neither of them lets anybody dribble
   * anywhere unbothered. A zone is the opposite: it sits down in its shape and
   * lets the ball come to it.
   */
  pickUp: number;
  /** Multiplies how tightly a defender stays attached to his man. */
  manTight: number;
  /** 0 pure man, 1 pure zone. Decides whether a defender follows or holds. */
  zone: number;
  /** -1 protects the rim, +1 protects the arc. */
  zoneShape: number;
  /** Multiplies reach-ins and jumps into passing lanes. */
  gamble: number;
  /** Multiplies defensive rebounding position. */
  boxOut: number;
  /** Multiplies fouls conceded. */
  fouling: number;
  /** Multiplies how quickly the defence tires. */
  effort: number;
}

export const NEUTRAL_EFFECTS: SchemeEffects = {
  tempo: 1, threeBias: 0, driveBias: 1, arcPlayers: 3, ballMovement: 1,
  crash: 1, screens: 1, isolation: 1, transition: 1,
  pickUp: 94, manTight: 1, zone: 0, zoneShape: 0, gamble: 1, boxOut: 1,
  fouling: 1, effort: 1,
};

/**
 * What a scheme asks of the players running it, as attribute keys and how much
 * each one matters. `schemeFit` measures the starting five against this.
 */
type Requirement = Partial<Record<AttrKey, number>>;

export interface SchemeInfo<K extends string> {
  key: K;
  label: string;
  /** What it is, in a sentence a coach would say. */
  blurb: string;
  /** What it does to the numbers, in words the player can check against a box score. */
  effect: string;
  /** What it needs from the players. */
  needs: Requirement;
  /** A short statement of the personnel it wants. */
  needsText: string;
  /** Everything it changes. */
  effects: Partial<SchemeEffects>;
}

/* ------------------------------------------------------------------ offence */

export const OFFENSES: Record<OffenseScheme, SchemeInfo<OffenseScheme>> = {
  motion: {
    key: 'motion',
    label: 'Motion',
    blurb: 'Everybody moves, everybody touches it, nobody stands still.',
    effect: 'More assists and better shots, at the cost of a step of tempo.',
    needs: { passing: 3, iq: 3, stamina: 1.5, speed: 1 },
    needsText: 'Passers with basketball IQ, and legs to keep cutting.',
    effects: { tempo: 0.94, ballMovement: 1.35, screens: 1.2, isolation: 0.8, arcPlayers: 3 },
  },
  fiveOut: {
    key: 'fiveOut',
    label: 'Five-out',
    blurb: 'All five men beyond the arc. The paint is empty and the drive is open.',
    effect: 'Far more threes and a clean lane, but nobody is near the offensive glass.',
    needs: { three: 4, handle: 2, passing: 1.5 },
    needsText: 'Five men who can shoot it, including your big.',
    effects: {
      // The lane is opened by the SHAPE — five men on the arc really do empty the
      // paint — so the drive needs no extra encouragement on top of it. Giving it
      // some anyway produced an offence that drove every possession and never
      // passed, which is the opposite of what five-out is for.
      arcPlayers: 5, threeBias: -0.13, driveBias: 0.98, crash: 0.55,
      ballMovement: 1.3, screens: 0.7,
    },
  },
  fourOneIn: {
    key: 'fourOneIn',
    label: 'Four-out, one-in',
    blurb: 'Four round the arc and a big on the block. The modern default.',
    effect: 'Balanced: spacing outside, a target inside, and real offensive rebounding.',
    needs: { three: 2.5, finishing: 2, rebounding: 1.5, passing: 1.5 },
    needsText: 'Shooters on the wings and one big who can finish.',
    effects: { arcPlayers: 4, threeBias: -0.03, crash: 1.1, screens: 1.1 },
  },
  pickRoll: {
    key: 'pickRoll',
    label: 'Pick-and-roll',
    blurb: 'Run it over and over until they prove they can guard it.',
    effect: 'More screens, more drives and more trips to the line.',
    needs: { handle: 3, passing: 2.5, finishing: 2, vertical: 1.5, iq: 1.5 },
    needsText: 'A guard who can handle it and a big who rolls hard.',
    effects: { screens: 1.9, driveBias: 1.22, ballMovement: 1.1, arcPlayers: 3, isolation: 1.1 },
  },
  post: {
    key: 'post',
    label: 'Post-focused',
    blurb: 'Throw it inside and play from there.',
    effect: 'Many more shots at the rim and on the offensive glass, far fewer threes.',
    needs: { finishing: 3.5, strength: 2.5, rebounding: 2, interiorD: 1 },
    needsText: 'A big who can score with his back to the basket.',
    effects: {
      arcPlayers: 2, threeBias: 0.11, driveBias: 0.92, crash: 1.45,
      tempo: 0.9, isolation: 1.2, screens: 0.9,
    },
  },
  fastBreak: {
    key: 'fastBreak',
    label: 'Fast break',
    blurb: 'Shoot it before they are set. Every miss is a chance to run.',
    effect: 'A lot more possessions, easier shots, and more turnovers.',
    needs: { speed: 3.5, stamina: 3, handle: 2, passing: 2, finishing: 1.5 },
    needsText: 'Legs, and a squad fit enough to use them for four quarters.',
    effects: {
      tempo: 1.22, transition: 1.55, driveBias: 1.12, ballMovement: 1.1,
      crash: 0.8, effort: 1.18, arcPlayers: 3,
    },
  },
  iso: {
    key: 'iso',
    label: 'Isolation',
    blurb: 'Clear a side and let your best player go to work.',
    effect: 'Your best scorer takes far more of the shots. Everybody else watches.',
    needs: { handle: 3, finishing: 2.5, shooting: 2.5, three: 1.5, speed: 1.5 },
    needsText: 'One player who is genuinely better than everybody guarding him.',
    effects: {
      isolation: 1.85, ballMovement: 0.6, tempo: 0.92, screens: 0.75,
      driveBias: 1.08, arcPlayers: 3,
    },
  },
};

/* ------------------------------------------------------------------ defence */

export const DEFENSES: Record<DefenseScheme, SchemeInfo<DefenseScheme>> = {
  man: {
    key: 'man',
    label: 'Man-to-man',
    blurb: 'Guard your man. Everything else is help.',
    effect: 'No weakness to exploit, and no free points either.',
    needs: { perimeterD: 2.5, interiorD: 2, speed: 1.5, iq: 1.5, stamina: 1.5 },
    needsText: 'Defenders who can stay in front of people.',
    effects: { zone: 0, manTight: 1 },
  },
  zone23: {
    key: 'zone23',
    label: '2-3 zone',
    blurb: 'Two up top, three across the paint. Nothing comes easy inside.',
    effect: 'The rim is shut and the offensive glass is yours. They will shoot threes.',
    needs: { rebounding: 2.5, block: 2, interiorD: 2.5, iq: 2 },
    needsText: 'Length across the back line and men who rebound out of position.',
    effects: {
      zone: 0.85, zoneShape: -0.8, boxOut: 1.2, gamble: 0.8, fouling: 0.85,
      manTight: 0.75, effort: 0.9, pickUp: 34,
    },
  },
  zone32: {
    key: 'zone32',
    label: '3-2 zone',
    blurb: 'Three across the arc. They will not get a clean look from outside.',
    effect: 'Threes dry up. So does your rebounding, and the paint is open.',
    needs: { perimeterD: 2.5, speed: 2.5, iq: 2, steal: 1.5 },
    needsText: 'Quick, long guards who can cover ground on the perimeter.',
    effects: {
      zone: 0.85, zoneShape: 0.85, boxOut: 0.85, gamble: 1.1, manTight: 0.8,
      fouling: 0.9, effort: 0.95, pickUp: 40,
    },
  },
  press: {
    key: 'press',
    label: 'Full-court press',
    blurb: 'Pick them up the moment they inbound it and never let them breathe.',
    effect: 'A lot of turnovers, a lot of fouls, and a lot of easy baskets given up.',
    needs: { speed: 3.5, stamina: 3.5, steal: 2.5, perimeterD: 2 },
    needsText: 'Ten men with legs. A press with a short bench is a gift.',
    effects: {
      gamble: 2.4, fouling: 1.4, manTight: 1.2, effort: 1.35,
      boxOut: 0.9, zone: 0.15,
    },
  },
  halfCourt: {
    key: 'halfCourt',
    label: 'Half-court pressure',
    blurb: 'Let them cross, then jump everything.',
    effect: 'More steals than man-to-man without the fouls a press gives away.',
    needs: { perimeterD: 2.5, speed: 2, steal: 2.5, stamina: 2 },
    needsText: 'Guards with quick hands who do not get tired.',
    effects: { pickUp: 45, gamble: 1.7, manTight: 1.15, fouling: 1.15, effort: 1.14 },
  },
};

/* ------------------------------------------------------------------ the fit */

/**
 * How well the five on the floor can run this. 0 is "they cannot", 1 is "this
 * is what they were built for".
 *
 * Measured against the tier the squad plays at rather than an absolute number,
 * so a high school running five-out is judged on whether ITS players can shoot,
 * not on whether they would shoot in the professional league.
 */
export function schemeFit(needs: Requirement, roster: HoopsPlayer[], par: number): number {
  const five = starters(roster);
  if (!five.length) return 0.5;
  let sum = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(needs) as [AttrKey, number][]) {
    // The five are judged as a group, except where the scheme needs ONE man to
    // be good at something — a post-up needs a post scorer, not five of them.
    const values = five.map((p) => p.attrs[key]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const best = Math.max(...values);
    const score = mean * 0.7 + best * 0.3;
    sum += clamp(0.5 + (score - par - 6) / 30, 0, 1) * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0.5;
}

/**
 * The knobs a team is actually playing with.
 *
 * A scheme its players cannot run is FADED toward neutral — they are not doing
 * it properly, so it does not do what it says — and then taxed a little on top,
 * because a team running the wrong system is worse than a team running none.
 */
export function resolveScheme(
  offense: OffenseScheme, defense: DefenseScheme, roster: HoopsPlayer[], par: number,
): ResolvedScheme {
  const off = OFFENSES[offense];
  const def = DEFENSES[defense];
  const offFit = schemeFit(off.needs, roster, par);
  const defFit = schemeFit(def.needs, roster, par);

  const out: SchemeEffects = { ...NEUTRAL_EFFECTS };
  const apply = (partial: Partial<SchemeEffects>, fit: number): void => {
    for (const [key, value] of Object.entries(partial) as [keyof SchemeEffects, number][]) {
      const base = NEUTRAL_EFFECTS[key];
      out[key] = base + (value - base) * fit;
    }
  };
  apply(off.effects, offFit);
  apply(def.effects, defFit);

  return {
    offense,
    defense,
    offenseFit: offFit,
    defenseFit: defFit,
    effects: out,
    // A badly-fitting scheme costs real percentage on both ends. Running the
    // wrong system is a coaching mistake and it should show up in the score.
    offensePenalty: (1 - offFit) * 0.06,
    defensePenalty: (1 - defFit) * 0.06,
  };
}

export interface ResolvedScheme {
  offense: OffenseScheme;
  defense: DefenseScheme;
  /** 0..1 — how well the personnel suit each side of the plan. */
  offenseFit: number;
  defenseFit: number;
  effects: SchemeEffects;
  /** Points of shooting percentage lost to running a scheme badly. */
  offensePenalty: number;
  defensePenalty: number;
}

/**
 * The scheme as it would be run by the players it was designed for.
 *
 * Two uses, both real: the screen that shows a coach what a system WOULD do for
 * him before he has the personnel for it, and the harness that has to check the
 * systems do what they claim without the fit quietly fading the answer to zero.
 */
export function schemeAtFullFit(
  offense: OffenseScheme, defense: DefenseScheme,
): ResolvedScheme {
  const out: SchemeEffects = { ...NEUTRAL_EFFECTS, ...OFFENSES[offense].effects };
  Object.assign(out, DEFENSES[defense].effects);
  return {
    offense,
    defense,
    offenseFit: 1,
    defenseFit: 1,
    effects: out,
    offensePenalty: 0,
    defensePenalty: 0,
  };
}

export const NEUTRAL_SCHEME: ResolvedScheme = {
  offense: 'motion',
  defense: 'man',
  offenseFit: 1,
  defenseFit: 1,
  effects: NEUTRAL_EFFECTS,
  offensePenalty: 0,
  defensePenalty: 0,
};

/** What the fit reads as, for the screen that shows it. */
export function fitLabel(fit: number): string {
  return fit >= 0.82 ? 'Built for it'
    : fit >= 0.66 ? 'Good fit'
      : fit >= 0.48 ? 'Workable'
        : fit >= 0.32 ? 'Poor fit'
          : 'Wrong personnel';
}

/**
 * Every scheme this squad could run, best fit first. The ranking, not just the
 * winner, because an AI programme should not automatically find the perfect plan
 * for its own players — see `rankedSchemesFor`'s callers.
 */
export function rankedSchemesFor(roster: HoopsPlayer[], par: number): {
  offense: { key: OffenseScheme; fit: number }[];
  defense: { key: DefenseScheme; fit: number }[];
} {
  return {
    offense: OFFENSE_ORDER
      .map((key) => ({ key, fit: schemeFit(OFFENSES[key].needs, roster, par) }))
      .sort((a, b) => b.fit - a.fit),
    defense: DEFENSE_ORDER
      .map((key) => ({ key, fit: schemeFit(DEFENSES[key].needs, roster, par) }))
      .sort((a, b) => b.fit - a.fit),
  };
}

/**
 * The scheme a squad would be best running. Used to suggest one to a coach who
 * has just taken over a roster somebody else built.
 */
export function bestSchemeFor(roster: HoopsPlayer[], par: number): {
  offense: OffenseScheme; defense: DefenseScheme;
} {
  const ranked = rankedSchemesFor(roster, par);
  return { offense: ranked.offense[0].key, defense: ranked.defense[0].key };
}

/** Positional shorthand for the roster screen: who this scheme leans on. */
export function schemeLeansOn(offense: OffenseScheme): string {
  switch (offense) {
    case 'fiveOut': return POSITIONS.join(' · ');
    case 'post': return 'C · PF';
    case 'pickRoll': return 'PG · C';
    case 'iso': return 'your best scorer';
    case 'fastBreak': return 'PG · SG · SF';
    case 'fourOneIn': return 'SG · SF · C';
    default: return 'all five';
  }
}
