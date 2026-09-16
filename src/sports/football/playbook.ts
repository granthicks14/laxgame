import type { Position } from './data';

/* ---------------------------------------------------------------------------
 * THE PLAYBOOK
 * ---------------------------------------------------------------------------
 * The decision that makes this a football game rather than a running-and-
 * throwing game. Every play is a genuine trade, and the trades are the sport's
 * own: a deep shot takes time to develop and the time is what gets you sacked; a
 * screen is thrown into the pressure it beats; a run is safe and slow and the
 * defence can decide to stop it.
 *
 * WHAT A PLAY ACTUALLY IS, here: a formation, a set of assignments, and a small
 * number of honest costs. Nothing is a modifier on a dice roll — the routes are
 * run, the blocks are held or lost, and the outcome comes out of what happens.
 * The numbers below shape the SITUATION and then the engine plays it.
 *
 * ROCK, PAPER, SCISSORS IS NOT THE DESIGN. A defence that guesses right should
 * be well placed, not automatically correct; a defence that guesses wrong should
 * be out of position, not beaten by rule. Every advantage below is positional,
 * which means a good play call gives a player a chance and never a result.
 * ------------------------------------------------------------------------- */

export type PlayFamily = 'run' | 'short' | 'medium' | 'deep' | 'screen' | 'playaction' | 'special';

export const FAMILY_LABEL: Record<PlayFamily, string> = {
  run: 'Run',
  short: 'Short pass',
  medium: 'Medium pass',
  deep: 'Deep shot',
  screen: 'Screen',
  playaction: 'Play action',
  special: 'Special teams',
};

/** The shape a route takes. The engine runs these as real paths, not as odds. */
export type RouteKind =
  | 'block'
  | 'flat' | 'slant' | 'hitch' | 'drag'
  | 'out' | 'in' | 'curl' | 'corner' | 'post' | 'go' | 'wheel'
  | 'screen'
  | 'checkdown';

export interface RouteSpec {
  kind: RouteKind;
  /** How deep the break is, in yards past the line. 0 for a block. */
  depth: number;
  /** Which way the break goes: -1 toward the left sideline, +1 toward the right. */
  breakDir: -1 | 0 | 1;
  /** Where he lines up, in yards from the ball. Negative is to the left. */
  splitX: number;
  /** Yards behind the line of scrimmage he starts. */
  backfield?: number;
}

export interface OffensivePlay {
  key: string;
  label: string;
  family: PlayFamily;
  /** One line a coach reads in the two seconds he has to pick. */
  blurb: string;
  /**
   * Seconds the play needs before it is there. A deep shot that takes 2.6s to
   * develop against a line that holds for 2.2s is a sack, and that is the entire
   * risk of calling it.
   */
  develops: number;
  /** Who runs what. The key is the slot; the engine maps slots to men. */
  routes: { slot: OffensiveSlot; route: RouteSpec }[];
  /** True when the ball is handed off rather than thrown. */
  handoff?: boolean;
  /** Extra blockers kept in, which slows the rush and empties the routes. */
  protect: number;
}

/**
 * The eleven jobs on an offensive snap.
 *
 * Slots rather than positions, because the same position fills different slots
 * on different plays: the tight end blocks on a run and runs a seam on play
 * action, and the engine has to be able to say which without asking a formation.
 */
export type OffensiveSlot =
  | 'QB' | 'RB' | 'WR1' | 'WR2' | 'WR3' | 'TE'
  | 'LT' | 'LG' | 'C' | 'RG' | 'RT';

export const OFFENSIVE_SLOTS: OffensiveSlot[] = [
  'QB', 'RB', 'WR1', 'WR2', 'WR3', 'TE', 'LT', 'LG', 'C', 'RG', 'RT',
];

/** Which position fills a slot. */
export const SLOT_POSITION: Record<OffensiveSlot, Position> = {
  QB: 'QB', RB: 'RB', WR1: 'WR', WR2: 'WR', WR3: 'WR', TE: 'TE',
  LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
};

/** Depth on the chart, so WR2 is the second receiver rather than the first again. */
export const SLOT_DEPTH: Record<OffensiveSlot, number> = {
  QB: 0, RB: 0, WR1: 0, WR2: 1, WR3: 2, TE: 0,
  LT: 0, LG: 1, C: 2, RG: 3, RT: 4,
};

const block = (splitX: number): RouteSpec => ({ kind: 'block', depth: 0, breakDir: 0, splitX });

/** The five linemen, who are on every play and do the same thing on all of them. */
const LINE: { slot: OffensiveSlot; route: RouteSpec }[] = [
  { slot: 'LT', route: block(-4.4) },
  { slot: 'LG', route: block(-2.2) },
  { slot: 'C', route: block(0) },
  { slot: 'RG', route: block(2.2) },
  { slot: 'RT', route: block(4.4) },
];

export const OFFENSIVE_PLAYS: OffensivePlay[] = [
  /* ------------------------------------------------------------------ runs */
  {
    key: 'inside-run',
    label: 'Inside zone',
    family: 'run',
    blurb: 'Straight ahead behind the guard. Four yards and a cloud of dust — '
      + 'unless they have loaded the box.',
    develops: 0,
    handoff: true,
    protect: 1,
    routes: [
      ...LINE,
      { slot: 'TE', route: block(6.4) },
      { slot: 'RB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: -1.4, backfield: 5.5 } },
      { slot: 'WR1', route: { kind: 'block', depth: 0, breakDir: 0, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 17 } },
      { slot: 'WR3', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 11 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 2 } },
    ],
  },
  {
    key: 'outside-run',
    label: 'Stretch left',
    family: 'run',
    blurb: 'Get to the edge and turn upfield. More to gain than the inside zone, '
      + 'and a loss if the end sets it.',
    develops: 0,
    handoff: true,
    protect: 1,
    routes: [
      ...LINE,
      { slot: 'TE', route: block(-6.4) },
      { slot: 'RB', route: { kind: 'block', depth: 0, breakDir: -1, splitX: 1.6, backfield: 5.5 } },
      { slot: 'WR1', route: { kind: 'block', depth: 0, breakDir: 0, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 17 } },
      { slot: 'WR3', route: { kind: 'block', depth: 0, breakDir: 0, splitX: -11 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 2 } },
    ],
  },
  {
    key: 'qb-keep',
    label: 'Quarterback keep',
    family: 'run',
    blurb: 'He keeps it himself off the edge. Worth it with legs, expensive without.',
    develops: 0,
    handoff: false,
    protect: 1,
    routes: [
      ...LINE,
      { slot: 'TE', route: block(6.4) },
      { slot: 'RB', route: { kind: 'block', depth: 0, breakDir: 1, splitX: -2, backfield: 5 } },
      { slot: 'WR1', route: { kind: 'go', depth: 22, breakDir: 0, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'go', depth: 22, breakDir: 0, splitX: 17 } },
      { slot: 'WR3', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 11 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 5 } },
    ],
  },

  /* ---------------------------------------------------------- short passes */
  {
    key: 'quick-slants',
    label: 'Quick slants',
    family: 'short',
    blurb: 'Three-step drop, ball out fast. Beats a blitz and will not beat a zone '
      + 'sitting on it.',
    develops: 1.1,
    protect: 0,
    routes: [
      ...LINE,
      { slot: 'WR1', route: { kind: 'slant', depth: 5, breakDir: 1, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'slant', depth: 5, breakDir: -1, splitX: 17 } },
      { slot: 'WR3', route: { kind: 'hitch', depth: 6, breakDir: 0, splitX: 10 } },
      { slot: 'TE', route: { kind: 'drag', depth: 4, breakDir: -1, splitX: 6.4 } },
      { slot: 'RB', route: { kind: 'checkdown', depth: 2, breakDir: 0, splitX: -1.6, backfield: 5.5 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 4.5 } },
    ],
  },
  {
    key: 'flat-flood',
    label: 'Flat flood',
    family: 'short',
    blurb: 'Two men to the same sideline at different depths. Somebody is open; '
      + 'the question is which.',
    develops: 1.4,
    protect: 0,
    routes: [
      ...LINE,
      { slot: 'WR1', route: { kind: 'out', depth: 9, breakDir: -1, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'flat', depth: 3, breakDir: -1, splitX: 12 } },
      { slot: 'WR3', route: { kind: 'curl', depth: 11, breakDir: 0, splitX: 17 } },
      { slot: 'TE', route: { kind: 'drag', depth: 5, breakDir: 1, splitX: 6.4 } },
      { slot: 'RB', route: { kind: 'flat', depth: 1, breakDir: 1, splitX: -1.6, backfield: 5.5 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 5 } },
    ],
  },

  /* --------------------------------------------------------- medium passes */
  {
    key: 'curl-flat',
    label: 'Curls',
    family: 'medium',
    blurb: 'Sit down in the soft spot at twelve yards. The bread and butter '
      + 'against a zone.',
    develops: 1.9,
    protect: 0,
    routes: [
      ...LINE,
      { slot: 'WR1', route: { kind: 'curl', depth: 12, breakDir: 0, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'curl', depth: 13, breakDir: 0, splitX: 17 } },
      { slot: 'WR3', route: { kind: 'in', depth: 11, breakDir: -1, splitX: 10 } },
      { slot: 'TE', route: { kind: 'out', depth: 8, breakDir: 1, splitX: 6.4 } },
      { slot: 'RB', route: { kind: 'checkdown', depth: 2, breakDir: 0, splitX: -1.6, backfield: 5.5 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 6 } },
    ],
  },
  {
    key: 'dig-cross',
    label: 'Dig and cross',
    family: 'medium',
    blurb: 'Two receivers across the middle at fifteen. Man coverage hates it; '
      + 'a linebacker sitting in the window does not.',
    develops: 2.2,
    protect: 0,
    routes: [
      ...LINE,
      { slot: 'WR1', route: { kind: 'in', depth: 15, breakDir: 1, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'in', depth: 13, breakDir: -1, splitX: 17 } },
      { slot: 'WR3', route: { kind: 'go', depth: 24, breakDir: 0, splitX: 11 } },
      { slot: 'TE', route: { kind: 'drag', depth: 6, breakDir: -1, splitX: 6.4 } },
      { slot: 'RB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: -1.6, backfield: 5.5 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 6.5 } },
    ],
  },

  /* ------------------------------------------------------------ deep shots */
  {
    key: 'four-verts',
    label: 'Four verticals',
    family: 'deep',
    blurb: 'Everybody runs. Takes for ever to develop and wins the game when it '
      + 'works.',
    develops: 2.9,
    protect: 0,
    routes: [
      ...LINE,
      { slot: 'WR1', route: { kind: 'go', depth: 30, breakDir: 0, splitX: -18 } },
      { slot: 'WR2', route: { kind: 'go', depth: 30, breakDir: 0, splitX: 18 } },
      { slot: 'WR3', route: { kind: 'go', depth: 26, breakDir: 0, splitX: 9 } },
      { slot: 'TE', route: { kind: 'go', depth: 22, breakDir: 0, splitX: -8 } },
      { slot: 'RB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: -1.6, backfield: 5.5 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 7 } },
    ],
  },
  {
    key: 'post-corner',
    label: 'Post and corner',
    family: 'deep',
    blurb: 'One breaks in, one breaks out, both at eighteen. Splits a two-deep '
      + 'safety look in half.',
    develops: 2.6,
    protect: 1,
    routes: [
      ...LINE,
      { slot: 'WR1', route: { kind: 'post', depth: 18, breakDir: 1, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'corner', depth: 18, breakDir: 1, splitX: 17 } },
      { slot: 'WR3', route: { kind: 'curl', depth: 10, breakDir: 0, splitX: 10 } },
      { slot: 'TE', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 6.4 } },
      { slot: 'RB', route: { kind: 'checkdown', depth: 2, breakDir: 0, splitX: -1.6, backfield: 5.5 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 7 } },
    ],
  },

  /* --------------------------------------------------------------- screens */
  {
    key: 'rb-screen',
    label: 'Back screen',
    family: 'screen',
    blurb: 'Let them come, then throw underneath it. A blitz turns this into a '
      + 'big gain and a soft zone turns it into nothing.',
    develops: 1.6,
    protect: 0,
    routes: [
      ...LINE,
      { slot: 'WR1', route: { kind: 'go', depth: 20, breakDir: 0, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'go', depth: 20, breakDir: 0, splitX: 17 } },
      { slot: 'WR3', route: { kind: 'block', depth: 3, breakDir: 0, splitX: 9 } },
      { slot: 'TE', route: { kind: 'block', depth: 2, breakDir: 0, splitX: 5 } },
      { slot: 'RB', route: { kind: 'screen', depth: -1, breakDir: 1, splitX: -1.6, backfield: 5.5 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 6 } },
    ],
  },

  /* ----------------------------------------------------------- play action */
  {
    key: 'pa-deep',
    label: 'Play action deep',
    family: 'playaction',
    blurb: 'Sell the run, then go over the top. Freezes a linebacker for half a '
      + 'second — and costs you half a second you may not have.',
    develops: 3.1,
    protect: 1,
    routes: [
      ...LINE,
      { slot: 'WR1', route: { kind: 'post', depth: 20, breakDir: 1, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'go', depth: 26, breakDir: 0, splitX: 17 } },
      { slot: 'WR3', route: { kind: 'out', depth: 12, breakDir: 1, splitX: 10 } },
      { slot: 'TE', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 6.4 } },
      { slot: 'RB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: -1.6, backfield: 5.5 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 7.5 } },
    ],
  },
  {
    key: 'pa-cross',
    label: 'Play action cross',
    family: 'playaction',
    blurb: 'The fake, then a man running free across the middle. Kinder than the '
      + 'deep version and still slow.',
    develops: 2.5,
    protect: 1,
    routes: [
      ...LINE,
      { slot: 'WR1', route: { kind: 'drag', depth: 9, breakDir: 1, splitX: -17 } },
      { slot: 'WR2', route: { kind: 'in', depth: 14, breakDir: -1, splitX: 17 } },
      { slot: 'WR3', route: { kind: 'go', depth: 22, breakDir: 0, splitX: 10 } },
      { slot: 'TE', route: { kind: 'flat', depth: 3, breakDir: 1, splitX: 6.4 } },
      { slot: 'RB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: -1.6, backfield: 5.5 } },
      { slot: 'QB', route: { kind: 'block', depth: 0, breakDir: 0, splitX: 0, backfield: 7 } },
    ],
  },
];

export const playByKey = (key: string): OffensivePlay =>
  OFFENSIVE_PLAYS.find((p) => p.key === key) ?? OFFENSIVE_PLAYS[0];

export const playsInFamily = (family: PlayFamily): OffensivePlay[] =>
  OFFENSIVE_PLAYS.filter((p) => p.family === family);

/* --------------------------------------------------------------- defence */

export type CoverageKind = 'man' | 'cover2' | 'cover3' | 'blitz' | 'runstop';

export interface DefensivePlay {
  key: string;
  label: string;
  coverage: CoverageKind;
  blurb: string;
  /** How many men rush the passer. Four is normal; six is a blitz. */
  rushers: number;
  /** How many deep safeties sit behind everything. */
  deep: number;
  /**
   * How far off the receivers the corners play, in yards. Press is 1; a soft
   * zone is 8, and the difference is whether a slant or a go route is open.
   */
  cushion: number;
  /** Extra men committed to the box against the run. */
  boxLoad: number;
}

export const DEFENSIVE_PLAYS: DefensivePlay[] = [
  {
    key: 'man-press',
    label: 'Press man',
    coverage: 'man',
    blurb: 'Up in their faces, one safety over the top. Takes away the quick game '
      + 'and loses if somebody wins deep.',
    rushers: 4, deep: 1, cushion: 1.4, boxLoad: 0,
  },
  {
    key: 'cover-2',
    label: 'Cover two',
    coverage: 'cover2',
    blurb: 'Two safeties deep, corners in the flat. Nothing over the top, and '
      + 'the middle is where it lives or dies.',
    rushers: 4, deep: 2, cushion: 6, boxLoad: 0,
  },
  {
    key: 'cover-3',
    label: 'Cover three',
    coverage: 'cover3',
    blurb: 'Thirds behind, four underneath. Honest against everything and best '
      + 'against nothing.',
    rushers: 4, deep: 3, cushion: 7.5, boxLoad: 0,
  },
  {
    key: 'blitz',
    label: 'Bring the house',
    coverage: 'blitz',
    blurb: 'Six rushers, man behind it and nobody home. Get there or get beaten.',
    rushers: 6, deep: 0, cushion: 2.4, boxLoad: 1,
  },
  {
    key: 'run-stop',
    label: 'Load the box',
    coverage: 'runstop',
    blurb: 'Everybody down. The run has nowhere to go and the deep ball has '
      + 'nobody in front of it.',
    rushers: 4, deep: 1, cushion: 8.5, boxLoad: 3,
  },
];

export const defenseByKey = (key: string): DefensivePlay =>
  DEFENSIVE_PLAYS.find((p) => p.key === key) ?? DEFENSIVE_PLAYS[0];

/**
 * THE DEFENSIVE ELEVEN, by slot.
 *
 * Four down, three backers, two corners, two safeties — the base look the whole
 * defence is described against. A blitz sends a backer; a run-stop drops a
 * safety into the box. Nobody is added or removed, because there are eleven men.
 */
export type DefensiveSlot =
  | 'DE1' | 'DT1' | 'DT2' | 'DE2'
  | 'LB1' | 'LB2' | 'LB3'
  | 'CB1' | 'CB2' | 'S1' | 'S2';

export const DEFENSIVE_SLOTS: DefensiveSlot[] = [
  'DE1', 'DT1', 'DT2', 'DE2', 'LB1', 'LB2', 'LB3', 'CB1', 'CB2', 'S1', 'S2',
];

export const DEF_SLOT_POSITION: Record<DefensiveSlot, Position> = {
  DE1: 'DL', DT1: 'DL', DT2: 'DL', DE2: 'DL',
  LB1: 'LB', LB2: 'LB', LB3: 'LB',
  CB1: 'CB', CB2: 'CB', S1: 'S', S2: 'S',
};

export const DEF_SLOT_DEPTH: Record<DefensiveSlot, number> = {
  DE1: 0, DT1: 1, DT2: 2, DE2: 3,
  LB1: 0, LB2: 1, LB3: 2,
  CB1: 0, CB2: 1, S1: 0, S2: 1,
};
