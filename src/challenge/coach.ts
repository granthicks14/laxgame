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

export type UpgradeBranch =
  | 'scouting' | 'recruiting' | 'transfers' | 'development'
  | 'offense' | 'defense' | 'conditioning' | 'management';

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
  offense: {
    key: 'offense',
    label: 'Offense',
    blurb: 'How your side moves the ball, and what it does with it in front of goal.',
  },
  defense: {
    key: 'defense',
    label: 'Defense',
    blurb: 'Slides, ground balls, clears, and the man in the cage behind it all.',
  },
  conditioning: {
    key: 'conditioning',
    label: 'Strength & conditioning',
    blurb: 'Legs in the fourth quarter, and bodies that come back from a hard week.',
  },
  management: {
    key: 'management',
    label: 'Programme',
    blurb: 'Culture, leadership, depth, and the decisions you make from the sideline.',
  },
};

export const BRANCH_ORDER: UpgradeBranch[] = [
  'offense', 'defense', 'conditioning', 'development',
  'scouting', 'recruiting', 'transfers', 'management',
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
  // --- scouting -----------------------------------------------------------
  { key: 'eye1', branch: 'scouting', label: 'Talent Eye I', level: 1, cost: 10, requires: [],
    blurb: 'Your reports are sharper. Every scout closes the error bar 25% faster.' },
  { key: 'eye2', branch: 'scouting', label: 'Talent Eye II', level: 3, cost: 20, requires: ['eye1'],
    blurb: 'Sharper still: 50% faster, and your estimates drift less.' },
  { key: 'eye3', branch: 'scouting', label: 'Talent Eye III', level: 7, cost: 44, requires: ['eye2'],
    blurb: 'You read a ceiling almost exactly. Potential is revealed far earlier.' },
  { key: 'gems', branch: 'scouting', label: 'Hidden Gem Hunter', level: 2, cost: 18, requires: ['eye1'],
    blurb: 'Your scouts tip you on overlooked players twice as often.' },
  { key: 'network', branch: 'scouting', label: 'Regional Network', level: 4, cost: 26, requires: ['gems'],
    blurb: 'One more scout on the staff, and cheaper ones are worth having.' },
  { key: 'forecast', branch: 'scouting', label: 'Development Forecasting', level: 6, cost: 40, requires: ['eye2'],
    blurb: 'You can see how a prospect will grow, not just how good he is now.' },
  { key: 'evaluation', branch: 'scouting', label: 'Advanced Evaluation', level: 9, cost: 56, requires: ['eye3', 'network'],
    blurb: "A full report shows a prospect's development curve and work rate." },
  { key: 'oppscout', branch: 'scouting', label: 'Opponent Scouting', level: 5, cost: 30, requires: ['eye1'],
    blurb: 'Your side knows what is coming. Both ends read the game a step earlier.' },
  { key: 'eye4', branch: 'scouting', label: 'The Eye', level: 14, cost: 96, requires: ['evaluation', 'forecast'],
    blurb: 'Nobody in the sport evaluates talent better. Reports are all but exact.' },

  // --- recruiting ---------------------------------------------------------
  { key: 'fundamentals', branch: 'recruiting', label: 'Recruiting Fundamentals', level: 1, cost: 10, requires: [],
    blurb: 'Every prospect starts warmer to you, and your board shows what he is weighing.' },
  { key: 'rnetwork', branch: 'recruiting', label: 'Recruiting Network', level: 2, cost: 18, requires: ['fundamentals'],
    blurb: 'Two more names in every class, and you hear about them sooner.' },
  { key: 'board', branch: 'recruiting', label: 'Expanded Board', level: 4, cost: 24, requires: ['rnetwork'],
    blurb: 'One more offer to give out every cycle.' },
  { key: 'pitch', branch: 'recruiting', label: 'Better Pitch', level: 3, cost: 24, requires: ['fundamentals'],
    blurb: 'An offer from you is worth noticeably more than an offer from anybody else.' },
  { key: 'relationships', branch: 'recruiting', label: 'Relationship Builder', level: 6, cost: 32, requires: ['pitch'],
    blurb: "Interest climbs every week you stay in a prospect's ear." },
  { key: 'closer', branch: 'recruiting', label: 'Closing Ability', level: 8, cost: 40, requires: ['relationships'],
    blurb: 'Prospects commit to you from further behind. You win the close ones.' },
  { key: 'momentum', branch: 'recruiting', label: 'Recruiting Momentum', level: 10, cost: 48, requires: ['closer'],
    blurb: 'Every commitment you land makes the next one easier.' },
  { key: 'board2', branch: 'recruiting', label: 'National Board', level: 11, cost: 58, requires: ['board', 'rnetwork'],
    blurb: 'Another offer, and four more names in every class.' },
  { key: 'elite', branch: 'recruiting', label: 'Elite Recruiter', level: 15, cost: 90, requires: ['momentum', 'board2'],
    blurb: 'Blue-chip prospects will take your call even when your programme should not get one.' },

  // --- the portal ---------------------------------------------------------
  { key: 'connections1', branch: 'transfers', label: 'Transfer Connections I', level: 2, cost: 14, requires: [],
    blurb: 'One more approach in every transfer window.' },
  { key: 'connections2', branch: 'transfers', label: 'Transfer Connections II', level: 5, cost: 28, requires: ['connections1'],
    blurb: 'Two more approaches, and a bigger window to work with.' },
  { key: 'connections3', branch: 'transfers', label: 'Transfer Connections III', level: 8, cost: 44, requires: ['connections2'],
    blurb: 'Three more approaches, and every pitch you make lands harder.' },
  { key: 'playingtime', branch: 'transfers', label: 'Honest Depth Charts', level: 4, cost: 24, requires: ['connections1'],
    blurb: 'Players believe you about playing time, because you have never lied about it.' },
  { key: 'tcloser', branch: 'transfers', label: 'Transfer Closer', level: 9, cost: 50, requires: ['connections2'],
    blurb: 'A player who is thinking about it comes to you far more often than not.' },
  { key: 'retention', branch: 'transfers', label: 'Nobody Leaves', level: 7, cost: 38, requires: ['playingtime'],
    blurb: 'Your own players stop taking calls. The squad you build stays built.' },
  { key: 'portalexpert', branch: 'transfers', label: 'Portal Expert', level: 13, cost: 78, requires: ['connections3', 'tcloser'],
    blurb: 'More names in the window, full reports on all of them, and another approach.' },

  // --- development --------------------------------------------------------
  { key: 'programme', branch: 'development', label: 'Development Programme', level: 2, cost: 16, requires: [],
    blurb: 'Every player on the roster grows faster in the offseason.' },
  { key: 'projects', branch: 'development', label: 'Individual Projects', level: 4, cost: 28, requires: ['programme'],
    blurb: 'Development projects cost a third less and drive harder.' },
  { key: 'young', branch: 'development', label: 'Young Player Development', level: 5, cost: 32, requires: ['programme'],
    blurb: 'Underclassmen improve sharply. Freshmen arrive and get better immediately.' },
  { key: 'practice', branch: 'development', label: 'Practice Planning', level: 3, cost: 22, requires: [],
    blurb: 'Your weekly practice focus moves an attribute half again as far.' },
  { key: 'position', branch: 'development', label: 'Position Coaching', level: 7, cost: 40, requires: ['young'],
    blurb: 'Specialists develop properly: keepers, faceoff men and poles all gain.' },
  { key: 'breakouts', branch: 'development', label: 'Breakout Coaching', level: 10, cost: 56, requires: ['projects'],
    blurb: 'Breakout seasons become common. Nobody on your roster stagnates.' },
  { key: 'veterans', branch: 'development', label: 'Veteran Development', level: 9, cost: 46, requires: ['position'],
    blurb: 'Upperclassmen keep improving instead of flattening out.' },
  { key: 'academy', branch: 'development', label: 'The Academy', level: 16, cost: 104, requires: ['breakouts', 'veterans'],
    blurb: 'Players leave your programme better than anybody thought possible.' },

  // --- offense ------------------------------------------------------------
  { key: 'preparation', branch: 'offense', label: 'Game Preparation', level: 1, cost: 12, requires: [],
    blurb: 'Your side reads the game a step earlier at both ends.' },
  { key: 'shooting', branch: 'offense', label: 'Shooting Coach', level: 2, cost: 16, requires: [],
    blurb: 'Your shooters finish. More of what they put on frame goes in.' },
  { key: 'ballmove', branch: 'offense', label: 'Ball Movement', level: 4, cost: 24, requires: ['shooting'],
    blurb: 'The ball moves before the defence can slide. Better looks, better shots.' },
  { key: 'dodging', branch: 'offense', label: 'Dodging & Isolation', level: 5, cost: 28, requires: ['shooting'],
    blurb: 'Your dodgers beat their man, and your offence reads it a step earlier.' },
  { key: 'offball', branch: 'offense', label: 'Off-Ball Movement', level: 6, cost: 32, requires: ['ballmove'],
    blurb: 'Cutters arrive on time. The spacing stops being a diagram and starts being a threat.' },
  { key: 'shotsel', branch: 'offense', label: 'Shot Selection', level: 8, cost: 40, requires: ['offball'],
    blurb: 'Your side stops forcing it. Fewer shots, far better ones.' },
  { key: 'fastbreak', branch: 'offense', label: 'Fast Breaks', level: 7, cost: 36, requires: ['ballmove'],
    blurb: 'A won ground ball turns into a goal before the defence is set.' },
  { key: 'lateoff', branch: 'offense', label: 'Late-Game Offense', level: 11, cost: 58, requires: ['shotsel'],
    blurb: 'With the game on the line your offence gets better, not tighter.' },
  { key: 'offmaster', branch: 'offense', label: 'Offensive Identity', level: 17, cost: 110, requires: ['lateoff', 'fastbreak'],
    blurb: 'Nobody games your offence. It is the best in the sport at every level you take it.' },

  // --- defense ------------------------------------------------------------
  { key: 'groundballs', branch: 'defense', label: 'Ground Balls', level: 1, cost: 12, requires: [],
    blurb: 'Your side wins the ball on the floor. Possession starts there.' },
  { key: 'slides', branch: 'defense', label: 'Slide Timing', level: 3, cost: 20, requires: [],
    blurb: 'The second slide arrives on time. Dodgers stop getting to the cage.' },
  { key: 'clearing', branch: 'defense', label: 'Clearing', level: 4, cost: 24, requires: ['groundballs'],
    blurb: 'You get the ball out of your end instead of handing it back.' },
  { key: 'mandef', branch: 'defense', label: 'Man Defense', level: 5, cost: 28, requires: ['slides'],
    blurb: 'Poles hold their man one-on-one without help.' },
  { key: 'goaliesup', branch: 'defense', label: 'Goalie Coaching', level: 6, cost: 32, requires: ['slides'],
    blurb: 'Your keeper sees the ball earlier and stops more of it.' },
  { key: 'transd', branch: 'defense', label: 'Transition Defense', level: 8, cost: 40, requires: ['clearing'],
    blurb: 'Nobody runs a break on you. The ride is organised and the slide is back.' },
  { key: 'adjustments', branch: 'defense', label: 'In-Game Adjustments', level: 9, cost: 46, requires: ['mandef'],
    blurb: 'You change what is not working at the quarter instead of after the game.' },
  { key: 'latedef', branch: 'defense', label: 'Late-Game Defense', level: 12, cost: 62, requires: ['transd', 'adjustments'],
    blurb: 'A one-goal lead in the fourth is a lead you keep.' },
  { key: 'defmaster', branch: 'defense', label: 'Defensive Identity', level: 17, cost: 110, requires: ['latedef', 'goaliesup'],
    blurb: 'Teams do not score on you. They survive against you.' },

  // --- strength & conditioning -------------------------------------------
  { key: 'stamina', branch: 'conditioning', label: 'Conditioning Base', level: 1, cost: 12, requires: [],
    blurb: 'Your side runs all four quarters instead of three.' },
  { key: 'speed', branch: 'conditioning', label: 'Speed Training', level: 3, cost: 22, requires: ['stamina'],
    blurb: 'Speed and stamina grow faster every offseason.' },
  { key: 'strength', branch: 'conditioning', label: 'Strength Programme', level: 5, cost: 28, requires: ['stamina'],
    blurb: 'Bigger bodies win more ground balls and lose fewer checks.' },
  { key: 'recovery', branch: 'conditioning', label: 'Recovery', level: 7, cost: 36, requires: ['speed'],
    blurb: 'Legs come back between games. Late-season form stops falling away.' },
  { key: 'fourthq', branch: 'conditioning', label: 'Fourth Quarter Team', level: 10, cost: 52, requires: ['recovery', 'strength'],
    blurb: 'You are the fitter side in every close game you play.' },
  { key: 'sportsci', branch: 'conditioning', label: 'Sports Science', level: 15, cost: 92, requires: ['fourthq'],
    blurb: 'A programme nobody at this level can match. Your squad never tires.' },

  // --- programme ----------------------------------------------------------
  { key: 'culture', branch: 'management', label: 'Programme Culture', level: 2, cost: 18, requires: [],
    blurb: 'Chemistry builds every season and players stop taking calls.' },
  { key: 'leadership', branch: 'management', label: 'Leadership Group', level: 4, cost: 26, requires: ['culture'],
    blurb: 'Your seniors run the locker room. Chemistry compounds faster.' },
  { key: 'depth', branch: 'management', label: 'Depth Management', level: 6, cost: 32, requires: ['culture'],
    blurb: 'The bench contributes. Tired starters cost you far less.' },
  { key: 'morale', branch: 'management', label: 'Player Happiness', level: 7, cost: 36, requires: ['leadership'],
    blurb: 'Nobody is unhappy enough to leave over minutes.' },
  { key: 'timeouts', branch: 'management', label: 'Clock & Timeouts', level: 8, cost: 40, requires: ['depth'],
    blurb: 'You manage the end of a half properly, at both ends of the field.' },
  { key: 'stability', branch: 'management', label: 'Programme Stability', level: 11, cost: 56, requires: ['morale'],
    blurb: 'A settled programme: chemistry, retention and a reputation that recruits itself.' },
  { key: 'dynasty', branch: 'management', label: 'Dynasty Builder', level: 18, cost: 120, requires: ['stability', 'timeouts'],
    blurb: 'Everything about your programme compounds. This is what a great one looks like.' },
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
/**
 * Twenty levels, on a curve that keeps climbing.
 *
 * It used to stop at twelve, which a long career reached with seasons to
 * spare — and a coach who has nothing left to earn has nothing left to decide.
 * The top of each branch now sits at levels 14-18, so the elite upgrades are a
 * late-career reward rather than a mid-career formality, and no single career
 * can buy more than a slice of the tree.
 */
export const MAX_COACH_LEVEL = 20;

export function levelOf(xp: number): number {
  let level = 1;
  let need = 40;
  let spent = 0;
  while (xp >= spent + need && level < MAX_COACH_LEVEL) {
    spent += need;
    need = Math.round(need * 1.32);
    level++;
  }
  return level;
}

export function xpForNextLevel(xp: number): { into: number; needed: number } {
  let level = 1;
  let need = 40;
  let spent = 0;
  while (xp >= spent + need && level < MAX_COACH_LEVEL) {
    spent += need;
    need = Math.round(need * 1.32);
    level++;
  }
  return level >= MAX_COACH_LEVEL ? { into: 1, needed: 1 } : { into: xp - spent, needed: need };
}

export const LEVEL_TITLE = [
  '', 'Volunteer assistant', 'Assistant', 'Position coach', 'Coordinator',
  'Head coach', 'Established', 'Respected', 'Programme builder', 'Veteran',
  'Renowned', 'Master coach', 'Architect', 'Standard bearer', 'Institution',
  'Hall of fame', 'Living legend', 'Untouchable', 'Icon', 'Immortal', 'The Greatest',
];

export function coachTitle(level: number): string {
  return LEVEL_TITLE[clamp(level, 1, MAX_COACH_LEVEL)] ?? 'Head coach';
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
  /** Added to the coach's in-match decision quality on BOTH sides, 0..1. */
  gameday: number;
  /** Added to offensive decision quality only, 0..1. */
  offenseIQ: number;
  /** Added to defensive decision quality only, 0..1. */
  defenseIQ: number;
  /** Chemistry gained per season. */
  chemistry: number;
  /** How strongly the programme holds its own players. */
  retention: number;

  /* --- on the field ------------------------------------------------------ */

  /** Multiplier on winning loose balls. */
  groundBalls: number;
  /** Multiplier on clearing out of the defensive end. */
  clearing: number;
  /** Multiplier on the faceoff share. */
  faceoffs: number;
  /** Multiplier on how often a shot becomes a goal. */
  shotQuality: number;
  /** Multiplier on the keeper's save rate. */
  saveSupport: number;
  /** Extra performance late in games and when trailing, 0..1. */
  lateGame: number;

  /* --- the squad --------------------------------------------------------- */

  /** Multiplier on in-game stamina. */
  stamina: number;
  /** Added weight on speed and stamina growth in the offseason. */
  athletic: number;
  /** Multiplier on how much a practice week moves an attribute. */
  trainingGain: number;
  /** Multiplier on what the bench contributes. */
  depth: number;
}

const NO_PERKS: CoachPerks = {
  scoutSpeed: 1, scoutAccuracy: 1, gemTips: 1, extraScouts: 0, deepReports: false,
  extraProspects: 0, extraOffers: 0, interestFloor: 0, interestPerWeek: 0,
  closing: 0, momentum: 0, reach: 0,
  extraPitches: 0, extraTargets: 0, pitchPower: 1, fullPortalReports: false,
  development: 1, breakouts: 1, projectDiscount: 0,
  gameday: 0, offenseIQ: 0, defenseIQ: 0, chemistry: 0, retention: 0,
  groundBalls: 1, clearing: 1, faceoffs: 1, shotQuality: 1, saveSupport: 1, lateGame: 0,
  stamina: 1, athletic: 0, trainingGain: 1, depth: 1,
};

export function coachPerks(profile: CoachProfile | null | undefined): CoachPerks {
  const p = { ...NO_PERKS };
  if (!profile) return p;
  const has = (k: string) => profile.owned.includes(k);

  // --- scouting
  if (has('eye1')) { p.scoutSpeed *= 1.25; p.scoutAccuracy *= 1.2; }
  if (has('eye2')) { p.scoutSpeed *= 1.2; p.scoutAccuracy *= 1.3; }
  if (has('eye3')) { p.scoutSpeed *= 1.15; p.scoutAccuracy *= 1.4; }
  if (has('gems')) p.gemTips *= 2;
  if (has('network')) { p.extraScouts += 1; p.scoutSpeed *= 1.1; }
  if (has('forecast')) { p.scoutAccuracy *= 1.2; p.deepReports = true; }
  if (has('evaluation')) { p.deepReports = true; p.scoutAccuracy *= 1.2; }
  if (has('oppscout')) { p.offenseIQ += 0.06; p.defenseIQ += 0.06; }
  if (has('eye4')) { p.scoutSpeed *= 1.3; p.scoutAccuracy *= 1.5; p.gemTips *= 1.4; }

  // --- recruiting
  if (has('fundamentals')) p.interestFloor += 6;
  if (has('rnetwork')) { p.extraProspects += 2; p.gemTips *= 1.2; }
  if (has('board')) p.extraOffers += 1;
  if (has('pitch')) p.closing += 8;
  if (has('relationships')) p.interestPerWeek += 1.2;
  if (has('closer')) p.closing += 10;
  if (has('momentum')) p.momentum += 4;
  if (has('board2')) { p.extraOffers += 1; p.extraProspects += 4; }
  if (has('elite')) { p.reach += 10; p.extraOffers += 1; p.closing += 6; }

  // --- the portal
  if (has('connections1')) p.extraPitches += 1;
  if (has('connections2')) { p.extraPitches += 1; p.extraTargets += 3; }
  if (has('connections3')) { p.extraPitches += 1; p.pitchPower *= 1.15; }
  if (has('playingtime')) p.pitchPower *= 1.12;
  if (has('tcloser')) p.pitchPower *= 1.25;
  if (has('retention')) p.retention += 0.3;
  if (has('portalexpert')) {
    p.extraPitches += 1; p.extraTargets += 4; p.fullPortalReports = true;
  }

  // --- development
  if (has('programme')) p.development *= 1.25;
  if (has('projects')) p.projectDiscount += 0.34;
  if (has('young')) p.development *= 1.15;
  if (has('practice')) p.trainingGain *= 1.5;
  if (has('position')) { p.development *= 1.1; p.saveSupport *= 1.04; p.faceoffs *= 1.04; }
  if (has('breakouts')) { p.breakouts *= 1.8; p.development *= 1.1; }
  if (has('veterans')) p.development *= 1.12;
  if (has('academy')) { p.development *= 1.3; p.breakouts *= 1.4; }

  // --- offense
  if (has('preparation')) p.gameday += 0.18;
  if (has('shooting')) p.shotQuality *= 1.07;
  if (has('ballmove')) { p.offenseIQ += 0.08; p.shotQuality *= 1.04; }
  if (has('dodging')) { p.offenseIQ += 0.08; p.shotQuality *= 1.03; }
  if (has('offball')) { p.offenseIQ += 0.1; p.shotQuality *= 1.04; }
  if (has('shotsel')) p.shotQuality *= 1.09;
  if (has('fastbreak')) { p.groundBalls *= 1.06; p.shotQuality *= 1.04; }
  if (has('lateoff')) { p.lateGame += 0.12; p.shotQuality *= 1.04; }
  if (has('offmaster')) { p.offenseIQ += 0.12; p.shotQuality *= 1.08; }

  // --- defense
  if (has('groundballs')) p.groundBalls *= 1.09;
  if (has('slides')) p.defenseIQ += 0.1;
  if (has('clearing')) p.clearing *= 1.12;
  if (has('mandef')) { p.defenseIQ += 0.08; p.saveSupport *= 1.03; }
  if (has('goaliesup')) p.saveSupport *= 1.08;
  if (has('transd')) { p.defenseIQ += 0.08; p.clearing *= 1.06; }
  if (has('adjustments')) p.gameday += 0.22;
  if (has('latedef')) { p.lateGame += 0.12; p.saveSupport *= 1.04; }
  if (has('defmaster')) { p.defenseIQ += 0.12; p.saveSupport *= 1.07; }

  // --- strength & conditioning
  if (has('stamina')) p.stamina *= 1.18;
  if (has('speed')) { p.athletic += 0.25; p.stamina *= 1.06; }
  if (has('strength')) { p.groundBalls *= 1.07; p.athletic += 0.15; }
  if (has('recovery')) { p.stamina *= 1.12; p.development *= 1.05; }
  if (has('fourthq')) { p.lateGame += 0.14; p.stamina *= 1.1; }
  if (has('sportsci')) { p.stamina *= 1.2; p.athletic += 0.3; p.lateGame += 0.08; }

  // --- programme
  if (has('culture')) { p.chemistry += 2.4; p.retention += 0.35; }
  if (has('leadership')) { p.chemistry += 1.6; p.lateGame += 0.05; }
  if (has('depth')) p.depth *= 1.18;
  if (has('morale')) { p.retention += 0.2; p.development *= 1.05; }
  if (has('timeouts')) { p.gameday += 0.1; p.lateGame += 0.08; }
  if (has('stability')) { p.chemistry += 1.4; p.retention += 0.15; p.interestFloor += 5; }
  if (has('dynasty')) {
    p.chemistry += 2; p.retention += 0.15; p.development *= 1.12; p.depth *= 1.12;
  }

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
export type CoachIdentity =
  | 'scout' | 'developer' | 'recruiter' | 'strategist' | 'builder' | 'allrounder';

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
    branches: ['offense', 'defense'],
  },
  builder: {
    key: 'builder',
    name: 'The Programme Builder',
    blurb: 'Culture, conditioning, depth and stability. Your programmes are still good five '
      + 'years after you leave them.',
    branches: ['conditioning', 'management'],
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
