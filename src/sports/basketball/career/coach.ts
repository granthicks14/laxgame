import { clamp } from '../../../core/math';
import type { HoopsLevel } from '../levels';

/* ---------------------------------------------------------------------------
 * THE COACH
 * ---------------------------------------------------------------------------
 * A career spans decades and a dozen programmes, but there is only ever ONE
 * COACH. Everything he earns travels with him: his points, his experience, every
 * upgrade he has bought, and the record of every job he has held. Nothing in
 * here is rebuilt, halved or reset when he changes club.
 *
 * COACH POINTS are earned for doing the job well — winning, beating what the
 * programme expected, developing players, winning trophies — and spent on a tree
 * of twenty-four upgrades across six branches. Costs rise steeply and the top of
 * each branch needs a coach who has genuinely had a career, so nobody finishes
 * the tree in five seasons and every career leaves something on the table.
 *
 * Every upgrade resolves into a `CoachPerks` object, and every system that cares
 * — recruiting, the portal, development, the game engines themselves — reads
 * that object. An upgrade in this file cannot be a label with nothing behind it,
 * because there is nowhere for a label to live.
 * ------------------------------------------------------------------------- */

export type CoachBranch =
  | 'offense' | 'defense' | 'development' | 'recruiting' | 'portal' | 'program';

export interface BranchInfo {
  key: CoachBranch;
  label: string;
  blurb: string;
}

export const BRANCHES: Record<CoachBranch, BranchInfo> = {
  offense: {
    key: 'offense',
    label: 'Offence',
    blurb: 'Spacing, ball movement, and what your side does with an advantage.',
  },
  defense: {
    key: 'defense',
    label: 'Defence',
    blurb: 'Rotations, the glass, and making people shoot over a hand.',
  },
  development: {
    key: 'development',
    label: 'Development',
    blurb: 'Making the players you already have better than they were.',
  },
  recruiting: {
    key: 'recruiting',
    label: 'Recruiting',
    blurb: 'Finding them, and getting them to choose you.',
  },
  portal: {
    key: 'portal',
    label: 'The portal',
    blurb: 'Rebuilding a roster in one window instead of four years.',
  },
  program: {
    key: 'program',
    label: 'Programme',
    blurb: 'Culture, conditioning, depth, and the decisions you make standing up.',
  },
};

export const BRANCH_ORDER: CoachBranch[] = [
  'offense', 'defense', 'development', 'recruiting', 'portal', 'program',
];

export interface UpgradeInfo {
  key: string;
  branch: CoachBranch;
  label: string;
  /** What it does, in the units the coach will notice. */
  blurb: string;
  cost: number;
  /** Upgrades that must be owned first. */
  requires: string[];
  /** Coach level needed, which keeps the top of a branch a late-career reward. */
  level: number;
}

export const UPGRADES: UpgradeInfo[] = [
  /* --- offence ---------------------------------------------------------- */
  { key: 'spacing1', branch: 'offense', label: 'Spacing', level: 1, cost: 10, requires: [],
    blurb: 'Your side stands where it should. Better shots without better players.' },
  { key: 'movement', branch: 'offense', label: 'Ball movement', level: 3, cost: 20, requires: ['spacing1'],
    blurb: 'The ball finds the open man. More of your baskets come off a pass.' },
  { key: 'sets', branch: 'offense', label: 'Set plays', level: 5, cost: 32, requires: ['movement'],
    blurb: 'Out of a timeout and after a whistle, you get the shot you drew up.' },
  { key: 'lategame', branch: 'offense', label: 'Late-game execution', level: 8, cost: 48, requires: ['sets'],
    blurb: 'The last four minutes stop being a coin flip.' },

  /* --- defence ---------------------------------------------------------- */
  { key: 'rotations', branch: 'defense', label: 'Rotations', level: 1, cost: 10, requires: [],
    blurb: 'Help arrives when it should and recovers afterwards.' },
  { key: 'closeouts', branch: 'defense', label: 'Closeouts', level: 3, cost: 20, requires: ['rotations'],
    blurb: 'Shooters get a hand in the face instead of a clean look.' },
  { key: 'boxout', branch: 'defense', label: 'Boxing out', level: 5, cost: 30, requires: ['rotations'],
    blurb: 'Your defensive rebounding stops being about who is tallest.' },
  { key: 'scouting', branch: 'defense', label: 'Opponent scouting', level: 7, cost: 44, requires: ['closeouts'],
    blurb: 'Your side knows what is coming. Both ends read the game a step earlier.' },

  /* --- development ------------------------------------------------------ */
  { key: 'skills', branch: 'development', label: 'Skill development', level: 1, cost: 12, requires: [],
    blurb: 'Everybody on the roster improves noticeably faster.' },
  { key: 'shooting', branch: 'development', label: 'Shooting coach', level: 3, cost: 24, requires: ['skills'],
    blurb: 'Shooting, three-point and free-throw ratings grow twice as fast.' },
  { key: 'bigs', branch: 'development', label: 'Big-man coach', level: 4, cost: 24, requires: ['skills'],
    blurb: 'Finishing, rebounding and interior defence grow twice as fast.' },
  { key: 'breakouts', branch: 'development', label: 'Player development staff', level: 6, cost: 40, requires: ['shooting', 'bigs'],
    blurb: 'Breakout seasons stop being luck. Nobody on your roster stagnates.' },
  { key: 'ceiling', branch: 'development', label: 'Raising ceilings', level: 8, cost: 78, requires: ['breakouts'],
    blurb: 'Players in your programme grow past what anybody projected for them.' },

  /* --- recruiting ------------------------------------------------------- */
  { key: 'eye', branch: 'recruiting', label: 'An eye for a player', level: 1, cost: 12, requires: [],
    blurb: 'Your evaluations are sharper. What you see is closer to what he is.' },
  { key: 'pitch', branch: 'recruiting', label: 'The pitch', level: 3, cost: 22, requires: ['eye'],
    blurb: 'Interest builds faster with everybody you are actually recruiting.' },
  { key: 'reach', branch: 'recruiting', label: 'National reach', level: 5, cost: 34, requires: ['pitch'],
    blurb: 'One more scholarship offer open at a time, and bigger classes.' },
  { key: 'closer', branch: 'recruiting', label: 'Closer', level: 7, cost: 46, requires: ['pitch'],
    blurb: 'When a recruit decides, he decides in your favour more often.' },
  { key: 'gems', branch: 'recruiting', label: 'Finding the overlooked', level: 8, cost: 66, requires: ['eye', 'reach'],
    blurb: 'You see the ceiling nobody else sees, on players nobody else wants.' },

  /* --- the portal ------------------------------------------------------- */
  { key: 'contacts', branch: 'portal', label: 'Contacts', level: 2, cost: 14, requires: [],
    blurb: 'More names in the window, and you know what each of them wants.' },
  { key: 'sell', branch: 'portal', label: 'Selling the role', level: 4, cost: 26, requires: ['contacts'],
    blurb: 'Your approach to a transfer is worth a great deal more.' },
  { key: 'retention', branch: 'portal', label: 'Keeping your own', level: 6, cost: 38, requires: ['contacts'],
    blurb: 'Your players stop listening to other programmes.' },
  { key: 'window', branch: 'portal', label: 'Working the window', level: 8, cost: 64, requires: ['sell', 'retention'],
    blurb: 'One more approach every window, and the best names return your calls.' },

  /* --- the programme ---------------------------------------------------- */
  { key: 'conditioning', branch: 'program', label: 'Strength and conditioning', level: 2, cost: 16, requires: [],
    blurb: 'Legs in the fourth quarter, and athleticism that grows over a career.' },
  { key: 'depth', branch: 'program', label: 'Playing the bench', level: 4, cost: 26, requires: ['conditioning'],
    blurb: 'Your rotation is nine deep and the ninth man is worth playing.' },
  { key: 'culture', branch: 'program', label: 'Culture', level: 6, cost: 38, requires: ['depth'],
    blurb: 'Players stay, transfers listen, and recruits have heard of you.' },
  { key: 'legend', branch: 'program', label: 'A name in the sport', level: 10, cost: 98, requires: ['culture', 'lategame'],
    blurb: 'Doors open that a record cannot open. Every part of the job gets easier.' },
];

const BY_KEY = new Map(UPGRADES.map((u) => [u.key, u]));

export const upgrade = (key: string): UpgradeInfo | null => BY_KEY.get(key) ?? null;

export interface CoachJob {
  teamId: string;
  level: HoopsLevel;
  fromYear: number;
  toYear: number;
  wins: number;
  losses: number;
  titles: number;
}

export interface HoopsCoach {
  /** Spendable. */
  points: number;
  /** Total ever earned, which is what decides the coach's level. */
  xp: number;
  owned: string[];
  careerWins: number;
  careerLosses: number;
  championships: number;
  seasons: number;
  /** Every job he has held, oldest first. */
  jobs: CoachJob[];
}

/* -------------------------------------------------------------- the résumé
 *
 * WHERE HE HAS BEEN, and what he did there. One entry per club, opened when he
 * walks in and updated at the end of every season he coaches, so a coach who has
 * held five jobs across twenty years has five readable lines rather than one
 * aggregate that says nothing about which of them he was actually good at.
 */

/** Open a new line on the résumé. Closes the one before it. */
export function startJob(
  coach: HoopsCoach, teamId: string, level: HoopsLevel, year: number,
): void {
  const open = coach.jobs[coach.jobs.length - 1];
  if (open && open.teamId === teamId && open.level === level) return;
  if (open) open.toYear = Math.max(open.toYear, year - 1);
  coach.jobs.push({
    teamId, level, fromYear: year, toYear: year, wins: 0, losses: 0, titles: 0,
  });
}

/** Fold a finished season into the job he coached it at. */
export function logSeasonToJob(
  coach: HoopsCoach, year: number, wins: number, losses: number, champion: boolean,
): void {
  const job = coach.jobs[coach.jobs.length - 1];
  if (!job) return;
  job.wins += wins;
  job.losses += losses;
  job.toYear = Math.max(job.toYear, year);
  if (champion) job.titles++;
}

export function newCoach(startingPoints = 10): HoopsCoach {
  return {
    points: startingPoints,
    xp: 0,
    owned: [],
    careerWins: 0,
    careerLosses: 0,
    championships: 0,
    seasons: 0,
    jobs: [],
  };
}

/**
 * A coach's level. Experience comes from seasons, wins and trophies, and the
 * curve flattens: reaching level 12 is most of a career, which is exactly what
 * the top of the tree is supposed to cost.
 */
export function coachLevel(coach: HoopsCoach): number {
  return clamp(1 + Math.floor(Math.sqrt(coach.xp / 26)), 1, 20);
}

export function xpToNextLevel(coach: HoopsCoach): { have: number; need: number } {
  const level = coachLevel(coach);
  const at = (n: number): number => (n - 1) * (n - 1) * 26;
  return { have: coach.xp - at(level), need: at(level + 1) - at(level) };
}

export const priceOf = (u: UpgradeInfo, scale = 1): number => Math.round(u.cost * scale);

/** Why this upgrade cannot be bought, or null when it can. */
export function lockReason(coach: HoopsCoach, u: UpgradeInfo, costScale = 1): string | null {
  if (coach.owned.includes(u.key)) return 'Owned';
  for (const req of u.requires) {
    if (!coach.owned.includes(req)) return `Needs ${upgrade(req)?.label ?? req}`;
  }
  if (coachLevel(coach) < u.level) return `Needs level ${u.level}`;
  if (coach.points < priceOf(u, costScale)) return `Needs ${priceOf(u, costScale)} CP`;
  return null;
}

export function buyUpgrade(coach: HoopsCoach, key: string, costScale = 1): boolean {
  const u = upgrade(key);
  if (!u || lockReason(coach, u, costScale) !== null) return false;
  coach.points -= priceOf(u, costScale);
  coach.owned.push(key);
  return true;
}

/* ---------------------------------------------------------------- the perks */

/**
 * What the tree is worth, in the units each system actually uses. Everything
 * that reads a coach's upgrades reads THIS, so an upgrade can never be a label
 * with nothing behind it.
 */
export interface CoachPerks {
  /* --- what the two engines read -------------------------------------- */
  /**
   * Decision quality on the floor, 1 being an average staff. Both engines read
   * it: the played one as a small edge on every shot decision, the fast one as
   * a multiplier on the possession.
   */
  gameday: number;
  /** Extra ball movement, as a multiplier on the scheme's own. */
  ballMovement: number;
  /** Extra defensive rebounding. */
  boxOut: number;
  /** Extra closeout speed: harder to get a clean look against. */
  closeout: number;
  /** Late-game: how much better the side plays in the last minutes. */
  lateGame: number;
  /** Stamina: how much is left in the fourth quarter. */
  stamina: number;
  /** How far down the bench is worth playing. */
  depth: number;

  /* --- development ------------------------------------------------------ */
  /** Multiplier on how much a player grows over an offseason. */
  development: number;
  /** Multiplier on how often a young player breaks out. */
  breakouts: number;
  /** Extra growth on shooting-family attributes. */
  shootingGrowth: number;
  /** Extra growth on the inside-family attributes. */
  insideGrowth: number;
  /** Extra growth on speed, vertical and stamina. */
  athleticGrowth: number;
  /** Rating points a player may grow PAST his projected ceiling. */
  ceilingLift: number;

  /* --- recruiting ------------------------------------------------------- */
  /** How much narrower a scouting estimate is. 0 is no help, 1 is the truth. */
  evaluation: number;
  /** Extra interest gained per week of contact. */
  interestGain: number;
  /** Extra scholarship offers open at once. */
  extraOffers: number;
  /** Bonus applied when a recruit decides. */
  closing: number;
  /** How much more often an overlooked player shows up on your board. */
  gemTips: number;

  /* --- the portal ------------------------------------------------------- */
  /** Extra names in the transfer window. */
  extraTargets: number;
  /** Extra approaches per window. */
  extraPitches: number;
  /** Multiplier on how convincing an approach is. */
  pitchPower: number;
  /** 0..1 — how strongly the programme holds on to its own players. */
  retention: number;

  /* --- the programme ---------------------------------------------------- */
  /** Added to how appealing the programme is, to anybody. */
  appeal: number;
}

const NONE: CoachPerks = {
  gameday: 1, ballMovement: 1, boxOut: 1, closeout: 1, lateGame: 0, stamina: 1, depth: 1,
  development: 1, breakouts: 1, shootingGrowth: 0, insideGrowth: 0, athleticGrowth: 0,
  ceilingLift: 0,
  evaluation: 0, interestGain: 1, extraOffers: 0, closing: 0, gemTips: 1,
  extraTargets: 0, extraPitches: 0, pitchPower: 1, retention: 0,
  appeal: 0,
};

export function perksOf(coach: HoopsCoach): CoachPerks {
  const p: CoachPerks = { ...NONE };
  const has = (k: string): boolean => coach.owned.includes(k);

  if (has('spacing1')) p.gameday *= 1.04;
  if (has('movement')) { p.ballMovement *= 1.14; p.gameday *= 1.03; }
  if (has('sets')) { p.gameday *= 1.05; p.ballMovement *= 1.06; }
  if (has('lategame')) { p.lateGame += 0.35; p.gameday *= 1.04; }

  if (has('rotations')) p.gameday *= 1.04;
  if (has('closeouts')) p.closeout *= 1.18;
  if (has('boxout')) p.boxOut *= 1.16;
  if (has('scouting')) { p.gameday *= 1.06; p.closeout *= 1.08; }

  if (has('skills')) p.development *= 1.3;
  if (has('shooting')) p.shootingGrowth += 1;
  if (has('bigs')) p.insideGrowth += 1;
  if (has('breakouts')) { p.breakouts *= 1.7; p.development *= 1.15; }
  if (has('ceiling')) { p.ceilingLift += 5; p.development *= 1.1; }

  if (has('eye')) p.evaluation += 0.35;
  if (has('pitch')) p.interestGain *= 1.3;
  if (has('reach')) { p.extraOffers += 1; p.appeal += 0.06; }
  if (has('closer')) p.closing += 0.12;
  if (has('gems')) { p.gemTips *= 2.2; p.evaluation += 0.2; }

  if (has('contacts')) { p.extraTargets += 2; p.evaluation += 0.1; }
  if (has('sell')) p.pitchPower *= 1.35;
  if (has('retention')) p.retention += 0.3;
  if (has('window')) { p.extraPitches += 1; p.extraTargets += 2; p.pitchPower *= 1.15; }

  if (has('conditioning')) { p.stamina *= 1.22; p.athleticGrowth += 1; }
  if (has('depth')) p.depth *= 1.2;
  if (has('culture')) { p.retention += 0.2; p.appeal += 0.12; }
  if (has('legend')) {
    p.appeal += 0.18;
    p.interestGain *= 1.2;
    p.pitchPower *= 1.2;
    p.gameday *= 1.05;
    p.development *= 1.12;
  }

  p.retention = clamp(p.retention, 0, 0.85);
  p.appeal = clamp(p.appeal, 0, 0.6);
  p.evaluation = clamp(p.evaluation, 0, 0.9);
  return p;
}

/* ---------------------------------------------------------------- the points */

export interface PointAward {
  reason: string;
  points: number;
  xp: number;
}

/**
 * What a season is worth.
 *
 * Winning pays, but BEATING WHAT WAS EXPECTED pays more — a coach who takes the
 * worst programme in the league to .500 has done more than one who inherited the
 * best and finished second, and the points say so. Trophies are the big money,
 * and developing players is paid separately because a coach who builds people
 * rather than buying them should be able to afford to keep doing it.
 */
export function seasonAward(input: {
  wins: number;
  losses: number;
  /** What the programme expected, 0..1. */
  expected: number;
  champion: boolean;
  postseason: boolean;
  /** How many of the squad improved by three or more. */
  developed: number;
  /** Where in the pyramid this was. Higher tiers pay more. */
  level: HoopsLevel;
  /** Multiplier from the difficulty tier. */
  scale: number;
}): PointAward[] {
  const games = Math.max(1, input.wins + input.losses);
  const pct = input.wins / games;
  const gap = pct - input.expected;
  const tierPay = 1 + LEVEL_PAY[input.level];
  const out: PointAward[] = [];

  /* Points are the CURRENCY and the difficulty tier scales them. Experience is
   * not: a coach who has worked forty seasons has worked forty seasons whether he
   * won them or not, so a flat share of the experience comes from the season
   * itself. Without it the top of the tree — the ceiling-raising upgrade that is
   * the one way a squad ever exceeds the standard of its level — sat behind an
   * experience level a coach on the hard tiers could not reach in a lifetime, and
   * the hardest tiers were mathematically unwinnable rather than hard. */
  const base = Math.round(input.wins * 0.55 * tierPay * input.scale);
  out.push({
    reason: `${input.wins} wins`,
    points: base,
    xp: Math.round(14 + input.wins * 1.35),
  });

  if (gap > 0.02) {
    const over = Math.round(gap * 62 * tierPay * input.scale);
    out.push({
      reason: 'Beat what the programme expected',
      points: over,
      xp: Math.round(gap * 70),
    });
  } else if (gap < -0.1) {
    out.push({ reason: 'Fell short of what was expected', points: 0, xp: 0 });
  }

  if (input.postseason) {
    out.push({
      reason: 'Reached the postseason',
      points: Math.round(8 * tierPay * input.scale),
      xp: 12,
    });
  }
  if (input.champion) {
    out.push({
      reason: 'Won the championship',
      points: Math.round(30 * tierPay * input.scale),
      xp: Math.round(45 * tierPay),
    });
  }
  if (input.developed > 0) {
    out.push({
      reason: `${input.developed} player${input.developed === 1 ? '' : 's'} took a real step`,
      points: Math.round(input.developed * 2.5 * input.scale),
      xp: input.developed * 4,
    });
  }
  return out;
}

/** How much more a season is worth further up the pyramid. */
const LEVEL_PAY: Record<HoopsLevel, number> = {
  'hs-small': 0, 'hs-big': 0.15, juco: 0.3, d3: 0.45, d2: 0.6,
  'd1-mid': 0.8, 'd1-high': 1, dev: 1.15, pro: 1.3,
};

export function applyAwards(coach: HoopsCoach, awards: PointAward[]): void {
  for (const a of awards) {
    coach.points += a.points;
    coach.xp += a.xp;
  }
}

/** A one-line summary of what the coach has built, for the hub. */
export function coachSummary(coach: HoopsCoach): string {
  const owned = coach.owned.length;
  if (!owned) return 'Nothing bought yet';
  const byBranch = new Map<CoachBranch, number>();
  for (const key of coach.owned) {
    const u = upgrade(key);
    if (u) byBranch.set(u.branch, (byBranch.get(u.branch) ?? 0) + 1);
  }
  const best = [...byBranch.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  return best.map(([b, n]) => `${BRANCHES[b].label} ${n}`).join(' · ');
}
