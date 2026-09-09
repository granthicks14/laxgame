/* ---------------------------------------------------------------------------
 * THE COACH
 * ---------------------------------------------------------------------------
 * A Challenge career spans decades and a dozen programmes, but there is only
 * ever ONE COACH. Everything he earns travels with him: his points, his
 * experience, every upgrade he has bought, his reputation, and the record of
 * every job he has held.
 *
 * This file owns that profile, and it is deliberately kept apart from anything
 * to do with a team. Nothing here is rebuilt, halved or reset when a coach
 * changes jobs — a rule this codebase learned the hard way, because taking a
 * new job used to halve the staff a coach had spent five seasons buying.
 *
 * THE UPGRADE TREE
 * A Dynasty is a handful of seasons and the old five-track office was sized for
 * it. A Challenge career is thirty seasons or more, so the tree here is much
 * deeper: five branches, twenty-two upgrades, prerequisites, and costs that
 * keep the last tier out of reach until a coach has genuinely had a career.
 * Every upgrade resolves into a `CoachPerks` object that the scouting,
 * recruiting, transfer and development systems actually read.
 * ------------------------------------------------------------------------- */

import { clamp } from '../core/math';

export type UpgradeBranch = 'scouting' | 'recruiting' | 'transfers' | 'development' | 'gameday';

export interface BranchInfo {
  key: UpgradeBranch;
  label: string;
  blurb: string;
}

export const BRANCHES: Record<UpgradeBranch, BranchInfo> = {
  scouting: {
    key: 'scouting',
    label: 'Scouting',
    blurb: 'Seeing a player for what he is, before anybody else does.',
  },
  recruiting: {
    key: 'recruiting',
    label: 'Recruiting',
    blurb: 'Getting the players you have found to choose you.',
  },
  transfers: {
    key: 'transfers',
    label: 'The portal',
    blurb: 'Rebuilding a roster in one window instead of four years.',
  },
  development: {
    key: 'development',
    label: 'Development',
    blurb: 'Making the players you already have better than they were.',
  },
  gameday: {
    key: 'gameday',
    label: 'Game day',
    blurb: 'What your team does on the field, and how well it holds together.',
  },
};

export const BRANCH_ORDER: UpgradeBranch[] = [
  'scouting', 'recruiting', 'transfers', 'development', 'gameday',
];

export interface UpgradeInfo {
  key: string;
  branch: UpgradeBranch;
  label: string;
  /** What it does, in the units the coach will notice. */
  blurb: string;
  cost: number;
  /** Upgrades that must be owned first. */
  requires: string[];
  /** Coach level needed. Keeps the top of a branch a late-career reward. */
  level: number;
}

/**
 * Twenty-two upgrades. Costs rise steeply and the third tier of any branch
 * needs a coach who has been at this a while, so nobody finishes the tree in
 * five seasons — which is the whole point of a mode that runs for thirty.
 */
export const UPGRADES: UpgradeInfo[] = [
  // --- scouting
  { key: 'eye1', branch: 'scouting', label: 'Talent Eye I', level: 1, cost: 10, requires: [],
    blurb: 'Your reports are sharper. Every scout closes the error bar 25% faster.' },
  { key: 'eye2', branch: 'scouting', label: 'Talent Eye II', level: 3, cost: 20, requires: ['eye1'],
    blurb: 'Sharper still: 50% faster, and your estimates drift less.' },
  { key: 'eye3', branch: 'scouting', label: 'Talent Eye III', level: 6, cost: 38, requires: ['eye2'],
    blurb: 'You read a ceiling almost exactly. Potential is revealed far earlier.' },
  { key: 'gems', branch: 'scouting', label: 'Hidden Gem Hunter', level: 2, cost: 18, requires: ['eye1'],
    blurb: 'Your scouts tip you on overlooked players twice as often.' },
  { key: 'network', branch: 'scouting', label: 'Regional Network', level: 4, cost: 26, requires: ['gems'],
    blurb: 'One more scout on the staff, and cheaper ones are worth having.' },
  { key: 'evaluation', branch: 'scouting', label: 'Advanced Evaluation', level: 7, cost: 44, requires: ['eye3', 'network'],
    blurb: 'A full report shows a prospect\'s development curve and work rate.' },

  // --- recruiting
  { key: 'fundamentals', branch: 'recruiting', label: 'Recruiting Fundamentals', level: 1, cost: 10, requires: [],
    blurb: 'Every prospect starts warmer to you, and your board shows what he is weighing.' },
  { key: 'rnetwork', branch: 'recruiting', label: 'Recruiting Network', level: 2, cost: 18, requires: ['fundamentals'],
    blurb: 'Two more names in every class, and you hear about them sooner.' },
  { key: 'board', branch: 'recruiting', label: 'Expanded Board', level: 3, cost: 22, requires: ['rnetwork'],
    blurb: 'One more offer to give out every cycle.' },
  { key: 'pitch', branch: 'recruiting', label: 'Better Pitch', level: 3, cost: 24, requires: ['fundamentals'],
    blurb: 'An offer from you is worth noticeably more than an offer from anybody else.' },
  { key: 'relationships', branch: 'recruiting', label: 'Relationship Builder', level: 5, cost: 30, requires: ['pitch'],
    blurb: 'Interest climbs every week you stay in a prospect\'s ear.' },
  { key: 'closer', branch: 'recruiting', label: 'Closing Ability', level: 6, cost: 36, requires: ['relationships'],
    blurb: 'Prospects commit to you from further behind. You win the close ones.' },
  { key: 'momentum', branch: 'recruiting', label: 'Recruiting Momentum', level: 7, cost: 40, requires: ['closer'],
    blurb: 'Every commitment you land makes the next one easier.' },
  { key: 'elite', branch: 'recruiting', label: 'Elite Recruiter', level: 9, cost: 60, requires: ['momentum', 'board'],
    blurb: 'Blue-chip prospects will take your call even when your programme should not get one.' },

  // --- the portal
  { key: 'connections1', branch: 'transfers', label: 'Transfer Connections I', level: 2, cost: 14, requires: [],
    blurb: 'One more approach in every transfer window.' },
  { key: 'connections2', branch: 'transfers', label: 'Transfer Connections II', level: 4, cost: 26, requires: ['connections1'],
    blurb: 'Two more approaches, and a bigger window to work with.' },
  { key: 'connections3', branch: 'transfers', label: 'Transfer Connections III', level: 6, cost: 38, requires: ['connections2'],
    blurb: 'Three more approaches, and every pitch you make lands harder.' },
  { key: 'tcloser', branch: 'transfers', label: 'Transfer Closer', level: 7, cost: 42, requires: ['connections2'],
    blurb: 'A player who is thinking about it comes to you far more often than not.' },
  { key: 'portalexpert', branch: 'transfers', label: 'Portal Expert', level: 9, cost: 58, requires: ['connections3', 'tcloser'],
    blurb: 'More names in the window, full reports on all of them, and another approach.' },

  // --- development
  { key: 'programme', branch: 'development', label: 'Development Programme', level: 2, cost: 16, requires: [],
    blurb: 'Every player on the roster grows faster in the offseason.' },
  { key: 'projects', branch: 'development', label: 'Individual Projects', level: 4, cost: 28, requires: ['programme'],
    blurb: 'Development projects cost a third less and drive harder.' },
  { key: 'breakouts', branch: 'development', label: 'Breakout Coaching', level: 7, cost: 46, requires: ['projects'],
    blurb: 'Breakout seasons become common. Nobody on your roster stagnates.' },

  // --- game day
  { key: 'preparation', branch: 'gameday', label: 'Game Preparation', level: 1, cost: 12, requires: [],
    blurb: 'Your side reads the game a step earlier at both ends.' },
  { key: 'adjustments', branch: 'gameday', label: 'In-Game Adjustments', level: 5, cost: 32, requires: ['preparation'],
    blurb: 'You out-coach the opposition when the two teams are close.' },
  { key: 'culture', branch: 'gameday', label: 'Programme Culture', level: 6, cost: 36, requires: ['preparation'],
    blurb: 'Chemistry compounds, and your own players stop listening to the portal.' },
];

const BY_KEY = new Map(UPGRADES.map((u) => [u.key, u]));

export function upgrade(key: string): UpgradeInfo | null {
  return BY_KEY.get(key) ?? null;
}

export function upgradesIn(branch: UpgradeBranch): UpgradeInfo[] {
  return UPGRADES.filter((u) => u.branch === branch);
}

/* ------------------------------------------------------------- the profile */

export interface CoachJob {
  teamId: string;
  teamShort: string;
  stageKey: string;
  fromYear: number;
  toYear: number | null;
  wins: number;
  losses: number;
  titles: number;
}

export interface CoachProfile {
  /** Spendable. Earned from games, seasons and championships. */
  points: number;
  /** Total ever earned, which is what decides the coach's level. */
  xp: number;
  /** Upgrades bought, by key. */
  owned: string[];
  /** Career totals that follow the coach, not the programme. */
  careerWins: number;
  careerLosses: number;
  championships: number;
  seasons: number;
  /** Every job he has held, oldest first. */
  jobs: CoachJob[];
}

export function newCoachProfile(startingPoints = 12): CoachProfile {
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

/** Experience needed to reach each level. A career, not a weekend. */
export function levelOf(xp: number): number {
  let level = 1;
  let need = 40;
  let spent = 0;
  while (xp >= spent + need && level < 12) {
    spent += need;
    need = Math.round(need * 1.35);
    level++;
  }
  return level;
}

export function xpForNextLevel(xp: number): { into: number; needed: number } {
  let level = 1;
  let need = 40;
  let spent = 0;
  while (xp >= spent + need && level < 12) {
    spent += need;
    need = Math.round(need * 1.35);
    level++;
  }
  return level >= 12 ? { into: 1, needed: 1 } : { into: xp - spent, needed: need };
}

export const LEVEL_TITLE = [
  '', 'Assistant', 'Position coach', 'Coordinator', 'Head coach', 'Established',
  'Respected', 'Programme builder', 'Veteran', 'Renowned', 'Master coach',
  'Living legend', 'Immortal',
];

export function coachTitle(level: number): string {
  return LEVEL_TITLE[clamp(level, 1, 12)] ?? 'Head coach';
}

export function owns(profile: CoachProfile, key: string): boolean {
  return profile.owned.includes(key);
}

export type LockReason = 'owned' | 'level' | 'requires' | 'cost' | null;

/** What an upgrade actually costs, after the Challenge difficulty multiplier. */
export function priceOf(u: UpgradeInfo, costScale = 1): number {
  return Math.max(1, Math.round(u.cost * costScale));
}

export function lockReason(profile: CoachProfile, u: UpgradeInfo, costScale = 1): LockReason {
  if (owns(profile, u.key)) return 'owned';
  if (levelOf(profile.xp) < u.level) return 'level';
  if (!u.requires.every((r) => owns(profile, r))) return 'requires';
  if (profile.points < priceOf(u, costScale)) return 'cost';
  return null;
}

export function buyUpgrade(profile: CoachProfile, key: string, costScale = 1): boolean {
  const u = upgrade(key);
  if (!u || lockReason(profile, u, costScale) !== null) return false;
  profile.points -= priceOf(u, costScale);
  profile.owned.push(key);
  return true;
}

/* ---------------------------------------------------------------- the perks */

/**
 * What the tree is worth, in the units each system actually uses. Everything
 * that reads a coach's upgrades reads this, so an upgrade can never be a label
 * with nothing behind it.
 */
export interface CoachPerks {
  /** Multiplier on how fast a scout works. */
  scoutSpeed: number;
  /** Multiplier on how quickly an estimate converges on the truth. */
  scoutAccuracy: number;
  /** Multiplier on how often a scout tips an overlooked player. */
  gemTips: number;
  /** Extra scouts allowed on the staff. */
  extraScouts: number;
  /** A full report shows the curve and work rate at a lower scouting level. */
  deepReports: boolean;
  /** Extra prospects in a class. */
  extraProspects: number;
  /** Extra offers per cycle. */
  extraOffers: number;
  /** Flat bonus to a prospect's starting interest. */
  interestFloor: number;
  /** Extra interest per week of contact. */
  interestPerWeek: number;
  /** Bonus applied when a prospect decides. */
  closing: number;
  /** Interest bonus per commitment already landed this cycle. */
  momentum: number;
  /** Softens the "ranked above your programme" penalty. */
  reach: number;
  /** Extra transfer approaches. */
  extraPitches: number;
  /** Extra names in the transfer window. */
  extraTargets: number;
  /** Multiplier on how convincing a transfer pitch is. */
  pitchPower: number;
  /** Everyone in the window is fully scouted. */
  fullPortalReports: boolean;
  /** Multiplier on offseason development. */
  development: number;
  /** Multiplier on breakout frequency. */
  breakouts: number;
  /** Discount on development projects, 0..1. */
  projectDiscount: number;
  /** Added to the coach's in-match decision quality, 0..1. */
  gameday: number;
  /** Chemistry gained per season. */
  chemistry: number;
  /** How strongly the programme holds its own players. */
  retention: number;
}

const NO_PERKS: CoachPerks = {
  scoutSpeed: 1, scoutAccuracy: 1, gemTips: 1, extraScouts: 0, deepReports: false,
  extraProspects: 0, extraOffers: 0, interestFloor: 0, interestPerWeek: 0,
  closing: 0, momentum: 0, reach: 0,
  extraPitches: 0, extraTargets: 0, pitchPower: 1, fullPortalReports: false,
  development: 1, breakouts: 1, projectDiscount: 0,
  gameday: 0, chemistry: 0, retention: 0,
};

export function coachPerks(profile: CoachProfile | null | undefined): CoachPerks {
  const p = { ...NO_PERKS };
  if (!profile) return p;
  const has = (k: string) => profile.owned.includes(k);

  if (has('eye1')) { p.scoutSpeed *= 1.25; p.scoutAccuracy *= 1.2; }
  if (has('eye2')) { p.scoutSpeed *= 1.2; p.scoutAccuracy *= 1.3; }
  if (has('eye3')) { p.scoutSpeed *= 1.15; p.scoutAccuracy *= 1.4; }
  if (has('gems')) p.gemTips *= 2;
  if (has('network')) { p.extraScouts += 1; p.scoutSpeed *= 1.1; }
  if (has('evaluation')) { p.deepReports = true; p.scoutAccuracy *= 1.2; }

  if (has('fundamentals')) p.interestFloor += 6;
  if (has('rnetwork')) { p.extraProspects += 2; p.gemTips *= 1.2; }
  if (has('board')) p.extraOffers += 1;
  if (has('pitch')) p.closing += 8;
  if (has('relationships')) p.interestPerWeek += 1.2;
  if (has('closer')) p.closing += 10;
  if (has('momentum')) p.momentum += 4;
  if (has('elite')) { p.reach += 10; p.extraOffers += 1; }

  if (has('connections1')) p.extraPitches += 1;
  if (has('connections2')) { p.extraPitches += 1; p.extraTargets += 3; }
  if (has('connections3')) { p.extraPitches += 1; p.pitchPower *= 1.15; }
  if (has('tcloser')) p.pitchPower *= 1.25;
  if (has('portalexpert')) {
    p.extraPitches += 1; p.extraTargets += 4; p.fullPortalReports = true;
  }

  if (has('programme')) p.development *= 1.25;
  if (has('projects')) p.projectDiscount += 0.34;
  if (has('breakouts')) { p.breakouts *= 1.8; p.development *= 1.1; }

  if (has('preparation')) p.gameday += 0.18;
  if (has('adjustments')) p.gameday += 0.22;
  if (has('culture')) { p.chemistry += 2.4; p.retention += 0.35; }

  return p;
}

/** What one season is worth in experience, before the result. */
export function seasonXp(wins: number, losses: number, champion: boolean, stageIndex: number): number {
  return 8 + wins * 2 + losses * 0.5 + (champion ? 25 + stageIndex * 4 : 0);
}

/* ------------------------------------------------------------- identities */

/**
 * WHAT KIND OF COACH DID YOU BECOME?
 *
 * On Standard a long career can afford most of the tree. On the harder tiers it
 * cannot — Coach Points arrive more slowly and every upgrade costs more — so
 * spending stops being a shopping list and becomes a decision about what your
 * programmes are going to be good at.
 *
 * This does not gate anything. It reads the tree a coach has actually bought
 * and names the coach he has become, so the choice he has been making all
 * career is visible to him rather than buried in a purchase history.
 */
export type CoachIdentity = 'scout' | 'developer' | 'recruiter' | 'strategist' | 'allrounder';

export interface IdentityInfo {
  key: CoachIdentity;
  name: string;
  blurb: string;
  /** Branches whose upgrades count toward this identity. */
  branches: UpgradeBranch[];
}

export const IDENTITIES: Record<CoachIdentity, IdentityInfo> = {
  scout: {
    key: 'scout',
    name: 'The Scout',
    blurb: 'You find them before anybody else does. Your classes are full of players the '
      + 'rankings missed, and you knew what they were when nobody else did.',
    branches: ['scouting'],
  },
  recruiter: {
    key: 'recruiter',
    name: 'The Recruiter',
    blurb: 'You get the players you want, wherever they are. Nobody out-works you on a '
      + 'commitment and nobody out-talks you in the portal.',
    branches: ['recruiting', 'transfers'],
  },
  developer: {
    key: 'developer',
    name: 'The Developer',
    blurb: 'Players leave your programme better than anybody expected. You do not need the '
      + 'best recruits, because you do not have them for long before they are.',
    branches: ['development'],
  },
  strategist: {
    key: 'strategist',
    name: 'The Strategist',
    blurb: 'You win with what you have. Your teams are prepared, they hold together, and they '
      + 'are a step ahead on the field.',
    branches: ['gameday'],
  },
  allrounder: {
    key: 'allrounder',
    name: 'The Complete Coach',
    blurb: 'No weakness anywhere. It takes a very long career, on a forgiving difficulty, to '
      + 'become this — and it is its own kind of achievement.',
    branches: [],
  },
};

export interface IdentityReading {
  identity: IdentityInfo;
  /** Points spent per branch, so the reading can be shown as a shape. */
  spend: Record<UpgradeBranch, number>;
  /** How committed the coach is: 0 = spread thin, 1 = entirely one branch. */
  focus: number;
  owned: number;
}

/**
 * Reads a coach's identity off what he has actually bought. A coach who has
 * spent nothing has no identity yet, which is honest — he is a coach who has
 * not decided.
 */
export function identityOf(profile: CoachProfile): IdentityReading | null {
  const spend = Object.fromEntries(BRANCH_ORDER.map((b) => [b, 0])) as Record<UpgradeBranch, number>;
  for (const key of profile.owned) {
    const u = upgrade(key);
    if (u) spend[u.branch] += u.cost;
  }
  const total = BRANCH_ORDER.reduce((n, b) => n + spend[b], 0);
  if (total <= 0) return null;

  // Score each identity by the share of everything he has spent that went into
  // its branches. "The Recruiter" spans two branches, so it is measured across
  // both rather than being penalised for the split.
  let best: CoachIdentity = 'allrounder';
  let bestShare = 0;
  for (const info of Object.values(IDENTITIES)) {
    if (!info.branches.length) continue;
    const share = info.branches.reduce((n, b) => n + spend[b], 0) / total;
    // A two-branch identity has to clear a higher bar to count as a focus.
    const bar = info.branches.length > 1 ? 0.5 : 0.38;
    if (share > bestShare && share >= bar) {
      bestShare = share;
      best = info.key;
    }
  }
  return {
    identity: IDENTITIES[best],
    spend,
    focus: bestShare,
    owned: profile.owned.length,
  };
}
