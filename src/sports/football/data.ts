import { Rng } from '../../core/rng';

/* ---------------------------------------------------------------------------
 * PLAYERS, POSITIONS AND CLUBS
 * ---------------------------------------------------------------------------
 * ELEVEN POSITIONS, AND NOT ONE GENERIC NUMBER AMONG THEM.
 *
 * Football is the sport where a single overall rating is least defensible. A
 * left tackle and a free safety share almost no attribute worth having, and a
 * quarterback with a cannon and no idea where to throw it is a different problem
 * from one who reads a defence and cannot reach the sideline. So every player
 * carries the same fourteen attributes, and every POSITION decides which of them
 * are worth anything — the overall is derived from that weighting and is a
 * summary of the ratings rather than a substitute for them.
 *
 * The attributes are chosen to be things the ENGINE READS. Nothing here is a
 * number on a card: throw power sets how far a pass carries, release sets how
 * quickly a receiver separates, shed sets whether a lineman gets off a block.
 * If an attribute did not change what happens on the field it would not be here.
 * ------------------------------------------------------------------------- */

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';

export const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

export const POSITION_LABEL: Record<Position, string> = {
  QB: 'Quarterback',
  RB: 'Running back',
  WR: 'Wide receiver',
  TE: 'Tight end',
  OL: 'Offensive line',
  DL: 'Defensive line',
  LB: 'Linebacker',
  CB: 'Cornerback',
  S: 'Safety',
  K: 'Kicker',
  P: 'Punter',
};

/** Which side of the ball a position plays on. */
export const POSITION_UNIT: Record<Position, 'offense' | 'defense' | 'special'> = {
  QB: 'offense', RB: 'offense', WR: 'offense', TE: 'offense', OL: 'offense',
  DL: 'defense', LB: 'defense', CB: 'defense', S: 'defense',
  K: 'special', P: 'special',
};

export interface Attrs {
  /** Top speed. The single most valuable attribute in the sport. */
  speed: number;
  /** How fast he reaches it, which is what a five-yard route is decided by. */
  acceleration: number;
  /** Change of direction: cuts, jukes, breaking on a ball. */
  agility: number;
  /** Mass and drive: breaking a tackle, holding a block, bull-rushing. */
  power: number;

  /* --- throwing ---------------------------------------------------------- */
  /** How far and how flat a pass carries. */
  throwPower: number;
  /** How close the ball lands to where it was aimed. */
  throwAccuracy: number;
  /** Reading coverage: whether the AI quarterback picks the right man, and how
   *  much a human's marginal throw is helped or hurt. */
  decision: number;

  /* --- catching and carrying --------------------------------------------- */
  catching: number;
  /** Getting off the line and out of a break. Separation, in one number. */
  routeRunning: number;
  /** Holding onto it: fumbles under contact, and an interception you tip away. */
  ballSecurity: number;

  /* --- the trenches and the back seven ----------------------------------- */
  blocking: number;
  passRush: number;
  tackling: number;
  coverage: number;
  /** Reading the play: reaction time, taking the right angle, not biting. */
  awareness: number;
  /** Kicking leg, for the two positions that have one. */
  kicking: number;
}

export type AttrKey = keyof Attrs;

export const ATTR_LABEL: Record<AttrKey, string> = {
  speed: 'Speed',
  acceleration: 'Acceleration',
  agility: 'Agility',
  power: 'Power',
  throwPower: 'Arm strength',
  throwAccuracy: 'Accuracy',
  decision: 'Decision making',
  catching: 'Catching',
  routeRunning: 'Route running',
  ballSecurity: 'Ball security',
  blocking: 'Blocking',
  passRush: 'Pass rush',
  tackling: 'Tackling',
  coverage: 'Coverage',
  awareness: 'Awareness',
  kicking: 'Kicking',
};

export const ATTR_MIN = 20;
export const ATTR_MAX = 99;

/**
 * WHAT EACH POSITION IS JUDGED ON.
 *
 * The weights are the position, in the only form the game can actually use. They
 * sum to 1 per position so an overall is comparable across the roster, and they
 * are deliberately LOPSIDED — a quarterback's arm, accuracy and decisions are
 * nearly all of him, and his blocking is worth nothing at all, because it is.
 */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<AttrKey, number>>> = {
  QB: {
    throwAccuracy: 0.3, decision: 0.26, throwPower: 0.2,
    awareness: 0.1, speed: 0.08, agility: 0.06,
  },
  RB: {
    speed: 0.24, agility: 0.2, acceleration: 0.18, power: 0.16,
    ballSecurity: 0.12, catching: 0.1,
  },
  WR: {
    catching: 0.28, routeRunning: 0.24, speed: 0.24,
    acceleration: 0.14, agility: 0.1,
  },
  TE: {
    catching: 0.26, blocking: 0.22, routeRunning: 0.18,
    power: 0.16, speed: 0.1, acceleration: 0.08,
  },
  OL: {
    blocking: 0.46, power: 0.26, awareness: 0.16, agility: 0.12,
  },
  DL: {
    passRush: 0.34, power: 0.24, tackling: 0.18, acceleration: 0.14, awareness: 0.1,
  },
  LB: {
    tackling: 0.26, awareness: 0.22, coverage: 0.18, speed: 0.16,
    power: 0.1, passRush: 0.08,
  },
  CB: {
    coverage: 0.36, speed: 0.26, agility: 0.16, awareness: 0.14, tackling: 0.08,
  },
  S: {
    coverage: 0.26, awareness: 0.26, tackling: 0.2, speed: 0.18, agility: 0.1,
  },
  K: { kicking: 0.82, awareness: 0.18 },
  P: { kicking: 0.82, awareness: 0.18 },
};

export interface Player {
  id: string;
  first: string;
  last: string;
  pos: Position;
  number: number;
  attrs: Attrs;
  overall: number;
  /** Years in the programme. Drives graduation at a school, experience at a club. */
  years: number;
  age: number;
  /** What he could become. Never shown as a number — scouting gives a range. */
  potential: number;
  /** 25-99. How hard he works, which decides who reaches his ceiling. */
  work: number;

  /* --- the man, not the athlete ----------------------------------------- */
  /**
   * WHO HE IS. Seven of them, kept deliberately light: a personality moves his
   * morale, his asking price and his willingness to stay, and it does not do
   * anything else. A locker room simulator is a different game.
   */
  personality: Personality;
  /** 0-100. Winning, playing, being paid and being coached all move it. */
  morale: number;
  /** Where he played before somebody drafted him. Every one invented. */
  college: string;

  /* --- the contract ------------------------------------------------------ */
  /** Seasons left, including this one. 0 means he is a free agent in the spring. */
  contractYears: number;
  /** Cap hit, in millions a season. */
  salary: number;

  /** Set while he is hurt. Null the rest of the time, which is most of it. */
  injury: Injury | null;
}

/** What is wrong with him and how long it lasts. */
export interface Injury {
  label: string;
  /** Games left. A value under 1 is "a few plays" and clears at the whistle. */
  weeks: number;
  /** How much of him is missing while he plays through it, 0-1. */
  severity: number;
}

export type Personality =
  | 'team' | 'competitor' | 'quiet' | 'confident' | 'demanding' | 'loyal' | 'ambitious';

export const PERSONALITIES: Personality[] = [
  'team', 'competitor', 'quiet', 'confident', 'demanding', 'loyal', 'ambitious',
];

export interface PersonalityInfo {
  label: string;
  blurb: string;
  /** How far his morale swings on a good or bad week. 1 is average. */
  swing: number;
  /** Multiplier on what he asks for. */
  ask: number;
  /** How much he discounts to stay where he is. */
  loyalty: number;
  /** What he does to everybody else's morale. */
  chemistry: number;
  /** How much he needs to be on the field. */
  snapHunger: number;
}

export const PERSONALITY: Record<Personality, PersonalityInfo> = {
  team: {
    label: 'Team player',
    blurb: 'Takes the deal, takes the role, and lifts everybody around him.',
    swing: 0.8, ask: 0.92, loyalty: 1.3, chemistry: 2.4, snapHunger: 0.7,
  },
  competitor: {
    label: 'Competitor',
    blurb: 'Lives on winning. A losing season costs him more than anybody.',
    swing: 1.35, ask: 1, loyalty: 1, chemistry: 1.2, snapHunger: 1.1,
  },
  quiet: {
    label: 'Quiet',
    blurb: 'Says nothing, asks for nothing, and is very hard to read.',
    swing: 0.55, ask: 0.96, loyalty: 1.1, chemistry: 0, snapHunger: 0.6,
  },
  confident: {
    label: 'Confident',
    blurb: 'Believes it, whatever the scoreboard says. Wants the ball.',
    swing: 0.9, ask: 1.12, loyalty: 0.9, chemistry: 0.8, snapHunger: 1.35,
  },
  demanding: {
    label: 'Demanding',
    blurb: 'Wants paying, wants winning, and will say so. Worth the trouble when he is good.',
    swing: 1.45, ask: 1.28, loyalty: 0.7, chemistry: -1.6, snapHunger: 1.3,
  },
  loyal: {
    label: 'Loyal',
    blurb: 'Would rather stay than be paid. Almost never leaves in free agency.',
    swing: 0.85, ask: 0.85, loyalty: 1.75, chemistry: 1.4, snapHunger: 0.8,
  },
  ambitious: {
    label: 'Ambitious',
    blurb: 'Chasing a ring and a contract, in that order, and will go where both are.',
    swing: 1.15, ask: 1.18, loyalty: 0.6, chemistry: 0.3, snapHunger: 1.2,
  },
};

/**
 * WHERE HE CAME FROM.
 *
 * Every one of these is invented for this game. No real institution, programme
 * or person is named anywhere in a player's history, because every player is a
 * fiction and so is everything behind him.
 */
export const COLLEGES = [
  'Cedar Ridge', 'Port Callan', 'Marston A&M', 'Vance Tech', 'Halloran State',
  'Gulf Coast', 'North Vale', 'Ashbury', 'Kettleman', 'Silver Creek',
  'Fort Mercer', 'Blue River State', 'Ostrander', 'Pinnacle', 'Cross Bay',
  'Maribel State', 'Weatherford', 'Loxley', 'Granite Falls', 'Sandhill',
  'Delacroix', 'Iron Mountain', 'St. Ambrose', 'Copperfield', 'Larkspur State',
  'Dunmore', 'Tallgrass', 'Hollis Tech', 'Windham', 'Beaumont Valley',
  'Alder Point', 'Quarry Hill', 'Saltillo State', 'Beckwith', 'Lindenhurst',
  'Torrance Bay', 'Cavendish', 'Mount Auburn', 'Red Oak State', 'Fairhaven',
];

/** The overall, from the position's own weighting and nothing else. */
export function computeOverall(pos: Position, attrs: Attrs): number {
  const w = POSITION_WEIGHTS[pos];
  let total = 0;
  for (const [key, weight] of Object.entries(w) as [AttrKey, number][]) {
    total += attrs[key] * weight;
  }
  return Math.round(total);
}

/* --------------------------------------------------------------- generation */

const FIRST = [
  'Marcus', 'Deshawn', 'Tyler', 'Jaylen', 'Cole', 'Elijah', 'Brayden', 'Xavier',
  'Amari', 'Dominic', 'Nate', 'Rashad', 'Owen', 'Silas', 'Trey', 'Kai',
  'Jonah', 'Damir', 'Connor', 'Isaiah', 'Reggie', 'Beau', 'Malik', 'Grant',
  'Tobias', 'Hank', 'Lorenzo', 'Deion', 'Bryce', 'Quinn', 'Ezra', 'Roman',
];
const LAST = [
  'Whitlock', 'Okafor', 'Brightman', 'Sandoval', 'Mbeki', 'Calloway', 'Ulrich',
  'Yeboah', 'Holloway', 'Jankowski', 'Vance', 'Ashworth', 'Nakamura', 'Prentice',
  'Quill', 'Zabala', 'Lindgren', 'Redfern', 'Castellanos', 'Achebe', 'Doyle',
  'Marchetti', 'Sowell', 'Braddock', 'Kowalski', 'Ferreira', 'Osei', 'Tranter',
  'Delgado', 'Winslow', 'Bouchard', 'Halloran',
];

/**
 * An archetype inside a position, so a roster is eleven different men rather
 * than eleven copies of an average.
 *
 * This is the difference between a game where the running back is a number and
 * one where a coach knows he has a POWER back and calls accordingly. Each entry
 * nudges a handful of attributes; the position's weighting then decides what
 * that is worth.
 */
interface Archetype {
  name: string;
  bump: Partial<Record<AttrKey, number>>;
}

const ARCHETYPES: Record<Position, Archetype[]> = {
  QB: [
    { name: 'Pocket passer', bump: { throwAccuracy: 8, decision: 6, speed: -8, agility: -6 } },
    { name: 'Gunslinger', bump: { throwPower: 10, throwAccuracy: -4, decision: -5 } },
    { name: 'Dual threat', bump: { speed: 12, agility: 10, throwAccuracy: -5 } },
    { name: 'Game manager', bump: { decision: 9, awareness: 7, throwPower: -8 } },
  ],
  RB: [
    { name: 'Power back', bump: { power: 12, ballSecurity: 5, agility: -7, speed: -4 } },
    { name: 'Scat back', bump: { agility: 11, acceleration: 9, power: -10, catching: 6 } },
    { name: 'Every-down back', bump: { ballSecurity: 7, catching: 5, awareness: 5 } },
    { name: 'Home run threat', bump: { speed: 12, acceleration: 7, ballSecurity: -6 } },
  ],
  WR: [
    { name: 'Deep threat', bump: { speed: 12, acceleration: 8, catching: -5 } },
    { name: 'Possession', bump: { catching: 10, routeRunning: 8, speed: -8 } },
    { name: 'Route technician', bump: { routeRunning: 12, agility: 7, power: -6 } },
    { name: 'Big body', bump: { power: 10, catching: 7, agility: -8, speed: -5 } },
  ],
  TE: [
    { name: 'Blocking tight end', bump: { blocking: 12, power: 8, speed: -8, catching: -5 } },
    { name: 'Receiving tight end', bump: { catching: 10, routeRunning: 9, blocking: -10 } },
    { name: 'Complete', bump: { catching: 4, blocking: 4, awareness: 5 } },
  ],
  OL: [
    { name: 'Road grader', bump: { power: 12, blocking: 6, agility: -8 } },
    { name: 'Pass protector', bump: { blocking: 10, agility: 6, power: -5 } },
    { name: 'Technician', bump: { awareness: 10, blocking: 5, power: -4 } },
  ],
  DL: [
    { name: 'Speed rusher', bump: { acceleration: 11, passRush: 8, power: -9 } },
    { name: 'Run stuffer', bump: { power: 12, tackling: 7, passRush: -9 } },
    { name: 'Interior disruptor', bump: { passRush: 9, power: 6, speed: -6 } },
  ],
  LB: [
    { name: 'Thumper', bump: { tackling: 11, power: 8, coverage: -10 } },
    { name: 'Coverage backer', bump: { coverage: 11, speed: 7, power: -7 } },
    { name: 'Blitzer', bump: { passRush: 12, acceleration: 6, coverage: -8 } },
    { name: 'Field general', bump: { awareness: 12, tackling: 4, speed: -4 } },
  ],
  CB: [
    { name: 'Press corner', bump: { power: 9, coverage: 5, speed: -4 } },
    { name: 'Shutdown', bump: { coverage: 11, awareness: 6, tackling: -6 } },
    { name: 'Ballhawk', bump: { awareness: 10, agility: 7, tackling: -7 } },
    { name: 'Burner', bump: { speed: 13, coverage: -5 } },
  ],
  S: [
    { name: 'Centre field', bump: { coverage: 10, speed: 7, tackling: -7 } },
    { name: 'Box safety', bump: { tackling: 11, power: 8, coverage: -8 } },
    { name: 'Quarterback of the secondary', bump: { awareness: 12, coverage: 4, speed: -4 } },
  ],
  K: [
    { name: 'Big leg', bump: { kicking: 8, awareness: -5 } },
    { name: 'Automatic', bump: { awareness: 10, kicking: -3 } },
  ],
  P: [
    { name: 'Boomer', bump: { kicking: 9, awareness: -5 } },
    { name: 'Directional', bump: { awareness: 10, kicking: -3 } },
  ],
};

export const archetypesFor = (pos: Position): string[] => ARCHETYPES[pos].map((a) => a.name);

/** Every attribute starts from the same pool; the position shapes it. */
function baseAttrs(rng: Rng, par: number): Attrs {
  const roll = (): number => Math.round(Math.max(ATTR_MIN, Math.min(ATTR_MAX,
    par + rng.gauss(0, 9))));
  return {
    speed: roll(), acceleration: roll(), agility: roll(), power: roll(),
    throwPower: roll(), throwAccuracy: roll(), decision: roll(),
    catching: roll(), routeRunning: roll(), ballSecurity: roll(),
    blocking: roll(), passRush: roll(), tackling: roll(), coverage: roll(),
    awareness: roll(), kicking: roll(),
  };
}

/**
 * WHAT A POSITION IS GOOD AT BEFORE ANYTHING ELSE.
 *
 * A cornerback is not a lineman with a different label: he is faster, lighter and
 * cannot block. This shifts the whole attribute set toward the shape of the
 * position, and then the archetype shifts it again toward the shape of the MAN.
 */
const POSITION_SHAPE: Record<Position, Partial<Record<AttrKey, number>>> = {
  QB: { throwPower: 16, throwAccuracy: 16, decision: 14, blocking: -22, tackling: -20, coverage: -20, passRush: -20 },
  RB: { speed: 10, acceleration: 10, agility: 10, ballSecurity: 8, throwPower: -20, coverage: -18, passRush: -16 },
  WR: { speed: 12, catching: 14, routeRunning: 14, acceleration: 8, blocking: -16, tackling: -14, throwPower: -20 },
  TE: { catching: 8, blocking: 8, power: 6, speed: -4, throwPower: -20, coverage: -14 },
  OL: { blocking: 20, power: 16, speed: -14, catching: -20, throwPower: -22, coverage: -20 },
  DL: { passRush: 18, power: 14, tackling: 10, catching: -18, throwPower: -22, coverage: -14 },
  LB: { tackling: 14, awareness: 10, coverage: 6, power: 6, throwPower: -22, catching: -10 },
  CB: { coverage: 18, speed: 12, agility: 10, power: -10, blocking: -18, throwPower: -22 },
  S: { coverage: 12, awareness: 12, tackling: 8, speed: 8, blocking: -16, throwPower: -22 },
  /* A SPECIALIST IS NOT THE BEST PLAYER ON THE ROSTER. His overall is eighty
   * per cent one attribute, so a large bump here makes every kicker in the
   * league a ninety — and a league where everybody kicks from fifty-five turns
   * a fourth down into a formality. */
  K: { kicking: 11, speed: -12, power: -10, tackling: -16, throwPower: -18 },
  P: { kicking: 10, speed: -12, power: -10, tackling: -16, throwPower: -18 },
};

export interface PlayerOptions {
  pos: Position;
  /** Middle of the talent band this player is drawn from. */
  par: number;
  years?: number;
  age?: number;
  number?: number;
}

export function makePlayer(seed: string, opts: PlayerOptions): Player {
  const rng = new Rng(seed);
  const attrs = baseAttrs(rng, opts.par);

  const apply = (bump: Partial<Record<AttrKey, number>>): void => {
    for (const [k, v] of Object.entries(bump) as [AttrKey, number][]) {
      attrs[k] = Math.round(Math.max(ATTR_MIN, Math.min(ATTR_MAX, attrs[k] + v)));
    }
  };
  apply(POSITION_SHAPE[opts.pos]);
  const arch = ARCHETYPES[opts.pos][rng.int(0, ARCHETYPES[opts.pos].length - 1)];
  apply(arch.bump);

  const years = opts.years ?? rng.int(1, 4);
  const overall = computeOverall(opts.pos, attrs);
  return {
    id: `f:${seed}`,
    first: FIRST[rng.int(0, FIRST.length - 1)],
    last: LAST[rng.int(0, LAST.length - 1)],
    pos: opts.pos,
    number: opts.number ?? numberFor(opts.pos, rng),
    attrs,
    overall,
    years,
    age: opts.age ?? 17 + years,
    /* HEADROOM SHRINKS WITH EXPERIENCE. A first-year player has most of his
     * development in front of him; a fourth-year one is close to what he will be.
     * Potential is never below the overall, because a ceiling under a floor is a
     * number that can only confuse a scouting screen. */
    /* HEADROOM SHRINKS WITH EXPERIENCE AND NEVER GOES NEGATIVE. A ceiling
     * below a floor is a number that can only confuse a scouting screen, and
     * a nine-year professional had one. */
    potential: Math.min(99, overall
      + Math.round(rng.range(0, 1) ** 1.7 * Math.max(0, 24 - years * 3.4))),
    work: rng.int(25, 99),
    personality: PERSONALITIES[rng.int(0, PERSONALITIES.length - 1)],
    morale: rng.int(55, 80),
    college: COLLEGES[rng.int(0, COLLEGES.length - 1)],
    /* A DEFAULT CONTRACT, so a player generated anywhere in the game is legal on
     * a roster without the caller having to remember. The franchise overwrites
     * both numbers the moment it builds a squad, which is the only place they
     * actually mean anything. */
    contractYears: rng.int(1, 4),
    salary: Math.max(0.8, Math.round((overall - 48) ** 1.9 / 26) / 10 + 0.8),
    injury: null,
  };
}

/** Squad numbers that look like the position, the way a real roster does. */
function numberFor(pos: Position, rng: Rng): number {
  switch (pos) {
    case 'QB': return rng.int(1, 19);
    case 'RB': return rng.int(20, 39);
    case 'WR': return rng.int(10, 19) + (rng.bool(0.5) ? 70 : 0);
    case 'TE': return rng.int(80, 89);
    case 'OL': return rng.int(50, 79);
    case 'DL': return rng.int(90, 99);
    case 'LB': return rng.int(40, 59);
    case 'CB': return rng.int(20, 39);
    case 'S': return rng.int(20, 49);
    default: return rng.int(1, 9);
  }
}

/* -------------------------------------------------------------- the squad */

/** How many of each position a full roster carries. */
export const ROSTER_SHAPE: Record<Position, number> = {
  QB: 2, RB: 3, WR: 5, TE: 2, OL: 5, DL: 4, LB: 4, CB: 4, S: 3, K: 1, P: 1,
};

export const ROSTER_SIZE = Object.values(ROSTER_SHAPE).reduce((a, b) => a + b, 0);

export interface RosterOptions {
  par: number;
  /** How far the best man on the roster sits above the worst. */
  spread?: number;
  /** Fewer players than the shape asks for, for a programme in trouble. */
  hole?: number;
  /**
   * HOW OLD THE SQUAD IS.
   *
   * The default is a professional one, and it matters more than it looks: a
   * generator that hands every club a roster of nineteen-year-olds produces a
   * league whose thirty-one derived clubs are permanently on the up side of the
   * age curve while the one STORED club — yours — ages for real. Measured, that
   * was the whole of a twenty-season slide from .500 to 79-260, and none of it
   * was visible anywhere except in the ages.
   */
  ages?: [min: number, max: number];
}

/**
 * A PROFESSIONAL ROSTER'S AGE SPREAD: a few rookies, a bulge through the
 * middle twenties where most of the football is played, and a thinning tail of
 * men who are still good enough.
 */
function ageFor(rng: Rng, range: [number, number]): number {
  const [min, max] = range;
  const t = (rng.next() + rng.next() + rng.next()) / 3;
  return Math.round(min + Math.pow(t, 1.35) * (max - min));
}

export function buildRoster(seed: string, opts: RosterOptions): Player[] {
  const rng = new Rng(`${seed}:roster`);
  const out: Player[] = [];
  const spread = opts.spread ?? 10;
  for (const pos of POSITIONS) {
    const want = ROSTER_SHAPE[pos];
    for (let i = 0; i < want; i++) {
      /* THE DEPTH CHART IS BUILT INTO THE GENERATION. The first man at a position
       * is drawn from a higher band than the third, which is what makes a starter
       * a starter and what makes an injury or a graduation hurt. */
      const depth = i / Math.max(1, want - 1);
      const par = opts.par + spread * (0.55 - depth) - (opts.hole ?? 0);
      const age = ageFor(rng, opts.ages ?? [22, 34]);
      out.push(makePlayer(`${seed}:${pos}:${i}`, {
        pos,
        par: Math.max(ATTR_MIN + 6, par),
        age,
        years: Math.max(0, age - 21),
      }));
    }
  }
  // Best first within each position, so the depth chart reads itself.
  out.sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos)
    || b.overall - a.overall);
  return out;
}

/** The best man at a position, which is who takes the field. */
export function starterAt(roster: Player[], pos: Position, depth = 0): Player | null {
  const at = roster.filter((p) => p.pos === pos).sort((a, b) => b.overall - a.overall);
  return at[depth] ?? at[0] ?? null;
}

/** Everybody at a position, best first. */
export const depthAt = (roster: Player[], pos: Position): Player[] =>
  roster.filter((p) => p.pos === pos).sort((a, b) => b.overall - a.overall);

/* ---------------------------------------------------------------- ratings */

export interface TeamRatings {
  overall: number;
  offense: number;
  defense: number;
  /** The four units a coach actually thinks in. */
  passing: number;
  rushing: number;
  passDefense: number;
  runDefense: number;
  specialTeams: number;
}

const avgOf = (roster: Player[], pos: Position, n: number): number => {
  const at = depthAt(roster, pos).slice(0, n);
  if (!at.length) return 40;
  return at.reduce((s, p) => s + p.overall, 0) / at.length;
};

/**
 * What a team is, in the numbers a coach uses.
 *
 * Weighted by how much each position group actually decides a football game,
 * which is not evenly: a quarterback is worth more than any other single player
 * on the field and the line is worth more than any single skill man.
 */
export function teamRatings(roster: Player[]): TeamRatings {
  const qb = avgOf(roster, 'QB', 1);
  const rb = avgOf(roster, 'RB', 2);
  const wr = avgOf(roster, 'WR', 3);
  const te = avgOf(roster, 'TE', 1);
  const ol = avgOf(roster, 'OL', 5);
  const dl = avgOf(roster, 'DL', 4);
  const lb = avgOf(roster, 'LB', 3);
  const cb = avgOf(roster, 'CB', 3);
  const s = avgOf(roster, 'S', 2);
  const k = avgOf(roster, 'K', 1);
  const p = avgOf(roster, 'P', 1);

  const passing = qb * 0.5 + wr * 0.26 + ol * 0.16 + te * 0.08;
  const rushing = rb * 0.42 + ol * 0.46 + te * 0.12;
  const passDefense = cb * 0.36 + s * 0.24 + dl * 0.26 + lb * 0.14;
  const runDefense = dl * 0.42 + lb * 0.38 + s * 0.2;
  const specialTeams = k * 0.55 + p * 0.45;

  const offense = passing * 0.58 + rushing * 0.42;
  const defense = passDefense * 0.56 + runDefense * 0.44;
  return {
    overall: Math.round(offense * 0.47 + defense * 0.47 + specialTeams * 0.06),
    offense: Math.round(offense),
    defense: Math.round(defense),
    passing: Math.round(passing),
    rushing: Math.round(rushing),
    passDefense: Math.round(passDefense),
    runDefense: Math.round(runDefense),
    specialTeams: Math.round(specialTeams),
  };
}

/* ------------------------------------------------------------------ clubs */

export interface Team {
  id: string;
  city: string;
  name: string;
  abbr: string;
  primary: string;
  secondary: string;
  stadium: string;
  conference: string;
  /** 1..5, how strong a roster it generates before anything else. */
  prestige: number;
}
