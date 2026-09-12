/* ---------------------------------------------------------------------------
 * THE SIMULATION ENGINE
 * ---------------------------------------------------------------------------
 * Games the coach does not play still have to look like lacrosse. A random
 * number in the right range does not: it produces the same 12-10 every week, it
 * does not care that one team has an elite goalie, and the box score it prints
 * afterwards is unrelated to the scoreline.
 *
 * So this does not generate a score. It plays out a game in four steps, the
 * same four that decide a real one:
 *
 *   1. POSSESSIONS   how many times each side gets the ball. Faceoffs, pace,
 *                    style and turnovers decide it.
 *   2. SHOTS         how often a possession ends in a shot, and how many of
 *                    those are on frame. Offensive quality against defensive
 *                    pressure, minus whatever the weather takes off.
 *   3. QUALITY       what kind of looks they are — a shot against a packed
 *                    crease is not a shot on the break.
 *   4. CONVERSION    the goalie. Save percentage is driven by his rating
 *                    measured against the level he is playing at, so a great
 *                    keeper genuinely steals games and a bad one genuinely
 *                    loses them.
 *
 * The box score falls out of those steps rather than being invented afterwards,
 * so saves always equal shots on goal minus goals, faceoffs always equal goals
 * plus the period starts, and the numbers on the statistics screen add up to
 * the number on the scoreboard.
 *
 * CALIBRATION. Each level has its own target rates (see LEVEL_PROFILE), set at
 * REGULATION length. The game's quarters are much shorter than a real match, so
 * everything scales with the career's game length: at Long quarters a Division I
 * game lands where a real one does, and shorter settings scale played and
 * simulated games down together so the two never disagree.
 * `npm run scoring` measures all of it across thousands of games.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import { GAME_LENGTHS } from '../data/constants';
import type { TeamRatings } from '../data/teams';
import { LEVELS, type Level } from '../data/levels';
import { levelSpanOf } from '../data/levelSpan';
import { DEFENSE_STYLES, OFFENSE_STYLES, type Tactics } from '../data/tactics';

/** One side's full line. Every number here is produced by the simulation. */
export interface SimTeamBox {
  goals: number;
  /** PLL only: goals from beyond the two-point arc, already counted in `goals`. */
  twoPointGoals: number;
  shots: number;
  shotsOnGoal: number;
  saves: number;
  groundBalls: number;
  turnovers: number;
  causedTurnovers: number;
  faceoffWins: number;
  faceoffTakes: number;
  clears: number;
  clearAttempts: number;
  possessions: number;
}

export interface SimResult {
  homeScore: number;
  awayScore: number;
  home: SimTeamBox;
  away: SimTeamBox;
  overtime: boolean;
  /**
   * Goals per quarter, so a game has a shape and not just a final score. Four
   * entries, plus a fifth for the sudden-victory period when `overtime` is set.
   */
  homeByQuarter: number[];
  awayByQuarter: number[];
  /** The biggest lead either side held, for comeback stories. */
  homeBiggestLead: number;
  awayBiggestLead: number;
}

/** Conditions, kept as plain numbers so this file never imports the renderer. */
export interface SimWeather {
  /** 0 = dry, 1 = heavy rain. */
  rain: number;
  /** 0 = still, 1 = a gale. */
  wind: number;
  label: string;
}

export interface SimOptions {
  level?: Level;
  /** Quarter length relative to Short, which is how the rest of the game measures it. */
  lengthScale?: number;
  /** True when the first team named is at home. */
  homeAdvantage?: boolean;
  weather?: SimWeather | null;
  rivalry?: boolean;
  /** A playoff game: tighter, lower-scoring, and no ties. */
  playoff?: boolean;
  homeTactics?: Tactics;
  awayTactics?: Tactics;
  /** What the coach's own upgrade tree is worth to each side. */
  homeStaff?: SideCoaching;
  awayStaff?: SideCoaching;
  /** 0..1 coaching quality, from the coach's office. */
  homeCoaching?: number;
  awayCoaching?: number;
}

/* --------------------------------------------------------- calibration */

/**
 * What a game at this level looks like over a full regulation match. These are
 * the numbers `npm run scoring` checks against, and they are modelled targets
 * for a believable version of each level rather than a claim about any real
 * competition's published statistics.
 */
interface LevelProfile {
  /** Offensive possessions per team. */
  possessions: number;
  /** Shots per possession. */
  shotRate: number;
  /** Share of shots that reach the keeper. */
  onGoal: number;
  /** Baseline save percentage for an average keeper AT THIS LEVEL. */
  savePct: number;
  /** Ground balls per team. */
  groundBalls: number;
  /** Turnovers per team. */
  turnovers: number;
  /** Extra spread on team strength, which is what makes a blowout possible. */
  spread: number;
  /** Share of goals scored from two-point range. */
  twoPointRate: number;
  /**
   * How much of a real match's possession count this game's compressed quarters
   * actually fit, MEASURED FROM THE MATCH ENGINE with `npm run levels`.
   *
   * A played game is the ground truth: whatever the simulation says has to be a
   * game the coach could have played, or the league table is a lie. The engine
   * runs a little slower than a straight time-scaling of a real match, and it
   * runs at different rates at different levels, so this is the one constant
   * that reconciles the two. Re-measure it if anything in `src/match/` changes.
   */
  enginePace: number;
}

const LEVEL_PROFILE: Record<Level, LevelProfile> = {
  // High school: fewer possessions, weaker keepers, and the widest gap between
  // the best programme in a district and the worst.
  hs: {
    possessions: 32, shotRate: 1.02, onGoal: 0.6, savePct: 0.54,
    groundBalls: 26, turnovers: 19, spread: 1.35, twoPointRate: 0, enginePace: 1.06,
  },
  d3: {
    possessions: 35, shotRate: 1.08, onGoal: 0.61, savePct: 0.53,
    groundBalls: 29, turnovers: 17, spread: 1.15, twoPointRate: 0, enginePace: 0.80,
  },
  d2: {
    possessions: 35, shotRate: 1.08, onGoal: 0.62, savePct: 0.53,
    groundBalls: 30, turnovers: 16, spread: 1.0, twoPointRate: 0, enginePace: 0.93,
  },
  d1: {
    possessions: 36, shotRate: 1.1, onGoal: 0.62, savePct: 0.55,
    groundBalls: 31, turnovers: 15, spread: 0.95, twoPointRate: 0, enginePace: 0.74,
  },
  semipro: {
    possessions: 35, shotRate: 1.08, onGoal: 0.62, savePct: 0.51,
    groundBalls: 29, turnovers: 15, spread: 0.9, twoPointRate: 0, enginePace: 0.94,
  },
  // The professional game: a shot clock, the best finishers alive, the best
  // keepers alive, and a two-point arc that adds about a goal a game.
  pll: {
    possessions: 36, shotRate: 1.14, onGoal: 0.63, savePct: 0.55,
    groundBalls: 30, turnovers: 14, spread: 0.8, twoPointRate: 0.09, enginePace: 1.01,
  },
};

/** Long quarters are the game's stand-in for a regulation match. */
const REGULATION_SCALE =
  GAME_LENGTHS.long.quarterSeconds / GAME_LENGTHS.short.quarterSeconds;

/**
 * The middle of a level, in the units team ratings are actually expressed in.
 *
 * This is the trap that made the first version of this file produce Division I
 * games finishing 15-15: a team's `offense`, `defense` and `goalie` are ratings
 * WITHIN their own level (see data/levels.ts), not absolute attribute values.
 * Measuring a keeper against the level's *attribute band* made every college
 * goalie look eleven points below average, and save percentage collapsed.
 * The right yardstick is the range of team ratings the level actually contains.
 */
function levelPar(level: Level): number {
  return levelSpanOf(level).mean;
}

/* ------------------------------------------------------------- the model */

/**
 * What a COACH brings to a simulated game, over and above the squad.
 *
 * Everything here is 1 (or 0) for a side with no coach tree behind it, so a
 * Dynasty programme and every AI opponent behave exactly as they always have.
 * These are the upgrades a Challenge coach actually bought, which is what makes
 * the office worth spending in rather than a menu of adjectives.
 */
export interface SideCoaching {
  groundBalls: number;
  clearing: number;
  faceoffs: number;
  shotQuality: number;
  saveSupport: number;
  depth: number;
  lateGame: number;
}

export const NEUTRAL_COACHING: SideCoaching = {
  groundBalls: 1, clearing: 1, faceoffs: 1, shotQuality: 1, saveSupport: 1, depth: 1, lateGame: 0,
};

interface SideInput {
  ratings: TeamRatings;
  tactics: Tactics;
  coaching: number;
  staff: SideCoaching;
  home: boolean;
}

const DEFAULT_TACTICS: Tactics = { offense: 'balanced', defense: 'balanced' };

/** A rating's distance above or below the middle of its level, in points. */
const edge = (value: number, par: number): number => value - par;

/**
 * Pace: how many possessions this side's approach generates. Fast-break teams
 * play a different game from possession teams, and the scoreboard shows it.
 */
function paceFactor(side: SideInput, opponent: SideInput, par: number): number {
  const off = OFFENSE_STYLES[side.tactics.offense];
  const def = DEFENSE_STYLES[opponent.tactics.defense];
  // Transition and shot greed both shorten possessions; a packed defence
  // lengthens them.
  const style = 0.72 + off.transition * 0.16 + off.shotGreed * 0.12;
  const pressure = def.checkRate > 1.2 ? 1.05 : def.checkRate < 0.7 ? 0.94 : 1;
  const athletic = 1 + edge(side.ratings.speed, par) / 900;
  // Ground balls and clears are possessions. A side that wins the floor and
  // gets the ball out of its own end simply has the ball more often.
  const possession = 1 + (side.staff.groundBalls - 1) * 0.5 + (side.staff.clearing - 1) * 0.35;
  return style * pressure * athletic * possession;
}

/** Shots per possession: can this offence actually generate a look? */
function shotRateFactor(side: SideInput, opponent: SideInput, par: number, rain: number): number {
  const off = OFFENSE_STYLES[side.tactics.offense];
  const def = DEFENSE_STYLES[opponent.tactics.defense];
  const creation = edge(side.ratings.offense * 0.6 + side.ratings.attack * 0.4, par);
  const denial = edge(opponent.ratings.defense, par);
  const iq = (side.ratings.chemistry - 70) / 500 + side.coaching * 0.05;
  const styleGreed = 0.82 + off.shotGreed * 0.18;
  const packed = def.creaseBias > 1.2 ? 1.06 : def.creaseBias < 0.85 ? 0.97 : 1;
  return clamp(
    styleGreed * packed * (1 + (creation - denial) / 300 + iq - rain * 0.05),
    0.6, 1.5,
  );
}

/** Shot quality: what share of the shots are worth taking. */
function onGoalFactor(side: SideInput, opponent: SideInput, par: number, w: SimWeather | null): number {
  const off = OFFENSE_STYLES[side.tactics.offense];
  const shooting = edge(side.ratings.attack * 0.55 + side.ratings.midfield * 0.45, par);
  const contest = edge(opponent.ratings.defense, par);
  // A greedy offence takes worse shots; a patient one takes better ones.
  const patience = 1.08 - off.shotGreed * 0.08;
  const weather = w ? 1 - w.rain * 0.06 - w.wind * 0.05 : 1;
  // A shooting coach, better ball movement and better shot selection all land
  // here: the same number of shots, more of them worth taking.
  return clamp(
    patience * weather * side.staff.shotQuality * (1 + (shooting - contest) / 470),
    0.72, 1.4,
  );
}

/**
 * The goalie. This is the single biggest lever in the whole model, and it is
 * deliberately the one that responds hardest: an elite keeper behind an
 * ordinary defence should still drag a game into the single figures.
 */
function saveFactor(keeper: SideInput, par: number, profile: LevelProfile): number {
  const g = edge(keeper.ratings.goalie, par);
  // Roughly 0.9 percentage points of save percentage per rating point, which is
  // about what separates a great college keeper from an average one.
  const pct = (profile.savePct + g * 0.009 + keeper.coaching * 0.012) * keeper.staff.saveSupport;
  return clamp(pct, 0.3, 0.78);
}

/** Faceoffs decide who gets the extra possessions, and they compound. */
function faceoffShare(a: SideInput, b: SideInput): number {
  const diff = a.ratings.faceoff - b.ratings.faceoff;
  // A faceoff coach moves the share, not the rating: the same man wins a few
  // more clamps because he has been taught how.
  const coached = (a.staff.faceoffs - b.staff.faceoffs) * 0.22;
  return clamp(0.5 + diff / 240 + coached, 0.2, 0.8);
}

/**
 * A gamma-ish multiplier, so results are overdispersed relative to a plain
 * Poisson. This is what produces the occasional blowout and the occasional
 * 8-7 between two teams who normally trade fifteen.
 */
function formSwing(rng: Rng, spread: number, chemistry: number, depth = 1): number {
  // A settled team is more consistent week to week. That is what chemistry is.
  // DEPTH is the other half of it: a programme whose bench can play does not
  // have bad days for the same reasons, because a tired starter is replaced
  // rather than endured.
  const steadiness = clamp(1.25 - (chemistry - 45) / 90, 0.6, 1.3) / depth;
  const raw = rng.gauss(1, 0.13 * spread * steadiness);
  return clamp(raw, 0.45, 1.75);
}

function poisson(rng: Rng, mean: number): number {
  if (mean <= 0) return 0;
  if (mean > 24) {
    // Normal approximation, which stays cheap when a long PLL game runs hot.
    return Math.max(0, Math.round(rng.gauss(mean, Math.sqrt(mean))));
  }
  const l = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > l && k < 120);
  return k - 1;
}

function emptyBox(): SimTeamBox {
  return {
    goals: 0, twoPointGoals: 0, shots: 0, shotsOnGoal: 0, saves: 0, groundBalls: 0,
    turnovers: 0, causedTurnovers: 0, faceoffWins: 0, faceoffTakes: 0,
    clears: 0, clearAttempts: 0, possessions: 0,
  };
}

/* ------------------------------------------------------------------ entry */

/**
 * Plays out one game. `lengthScale` is 1 for Short quarters and scales with the
 * career's setting, exactly as the rest of the game measures it.
 */
export function simulateMatch(
  homeRatings: TeamRatings, awayRatings: TeamRatings, seedKey: string, opts: SimOptions = {},
): SimResult {
  const rng = new Rng(seedKey);
  const level = opts.level ?? 'hs';
  const profile = LEVEL_PROFILE[level];
  const par = levelPar(level);
  const lengthScale = opts.lengthScale ?? 1;
  // Everything below is expressed at regulation and then cut to the game the
  // player has actually chosen to play.
  const timeScale = lengthScale / REGULATION_SCALE;

  const home: SideInput = {
    ratings: homeRatings,
    tactics: opts.homeTactics ?? DEFAULT_TACTICS,
    coaching: clamp(opts.homeCoaching ?? 0, 0, 1),
    staff: opts.homeStaff ?? NEUTRAL_COACHING,
    home: true,
  };
  const away: SideInput = {
    ratings: awayRatings,
    tactics: opts.awayTactics ?? DEFAULT_TACTICS,
    coaching: clamp(opts.awayCoaching ?? 0, 0, 1),
    staff: opts.awayStaff ?? NEUTRAL_COACHING,
    home: false,
  };
  const weather = opts.weather ?? null;
  const rain = weather?.rain ?? 0;

  // --- 1. Possessions. The faceoff man decides who gets the extra ones, and a
  //        playoff game is tighter and slower than a Tuesday in April.
  const share = faceoffShare(home, away);
  const tempo = opts.playoff ? 0.95 : opts.rivalry ? 1.02 : 1;
  const basePoss = profile.possessions * profile.enginePace * timeScale * tempo;
  const homePace = paceFactor(home, away, par);
  const awayPace = paceFactor(away, home, par);
  const pairPace = (homePace + awayPace) / 2;
  const totalPoss = basePoss * 2 * pairPace * rng.range(0.94, 1.06);
  // Faceoffs shift possessions, but only so far: you still have to score.
  const homePoss = totalPoss * clamp(0.5 + (share - 0.5) * 0.42, 0.34, 0.66);
  const awayPoss = totalPoss - homePoss;

  const box = { home: emptyBox(), away: emptyBox() };
  const sides: [SideInput, SideInput, number, SimTeamBox, SimTeamBox][] = [
    [home, away, homePoss, box.home, box.away],
    [away, home, awayPoss, box.away, box.home],
  ];

  const expected: number[] = [];
  for (const [side, opp, poss, mine, theirs] of sides) {
    // --- 2. Shots.
    const rate = profile.shotRate * shotRateFactor(side, opp, par, rain);
    const shots = poss * rate;

    // --- 3. Quality.
    const onGoal = clamp(profile.onGoal * onGoalFactor(side, opp, par, weather), 0.4, 0.82);
    const sog = shots * onGoal;

    // --- 4. Conversion. The keeper he is shooting at.
    const savePct = saveFactor(opp, par, profile);
    // A home crowd is worth a little, and it is worth more the bigger the ground.
    const homeEdge = side.home && opts.homeAdvantage !== false ? 1.035 : 1;
    const goalsMean = sog * (1 - savePct) * homeEdge;

    mine.possessions = Math.round(poss);
    expected.push(goalsMean);
    // Stash the intermediate rates on the box for the second pass.
    mine.shots = shots;
    mine.shotsOnGoal = sog;
    void theirs;
  }

  // Roll both scores, then fill the box score in from the result so the two can
  // never disagree.
  const scores: number[] = [];
  sides.forEach(([side, , , mine], i) => {
    const swing = formSwing(rng, profile.spread, side.ratings.chemistry, side.staff.depth);
    const mean = expected[i] * swing;
    // A side having a good day shoots more as well as finishing more, so the
    // shooting percentage on the box score stays believable instead of a team
    // scoring eight on forty shots one week and twenty on forty the next.
    const volume = Math.pow(swing, 0.45);
    mine.shots *= volume;
    mine.shotsOnGoal *= volume;
    let goals = poisson(rng, mean);
    // Nobody scores more than they put on frame.
    goals = Math.min(goals, Math.round(mine.shotsOnGoal));
    scores.push(goals);
  });

  let [homeGoals, awayGoals] = scores;

  // Overtime: lacrosse plays sudden victory rather than ending level.
  let overtime = false;
  if (homeGoals === awayGoals) {
    overtime = true;
    const hStrength = expected[0] + (opts.homeAdvantage === false ? 0 : 0.3);
    const aStrength = expected[1];
    if (rng.next() < hStrength / Math.max(0.01, hStrength + aStrength)) homeGoals++;
    else awayGoals++;
  }

  // How the game unfolded. Quarters are drawn from each side's own scoring
  // rate with real run-of-play streakiness, so a 13-11 that was never in doubt
  // and a 13-11 won from five down are different games on the same scoreline.
  //
  // A game that went to overtime was LEVEL after four quarters, so only the
  // regulation goals are split; the sudden-victory goal is its own period. Any
  // other arrangement would let the run of play disagree with the fact that it
  // needed overtime at all.
  const homeReg = overtime && homeGoals > awayGoals ? homeGoals - 1 : homeGoals;
  const awayReg = overtime && awayGoals > homeGoals ? awayGoals - 1 : awayGoals;
  const [homeByQuarter, awayByQuarter] = splitGame(
    rng, homeReg, awayReg, home.staff.lateGame - away.staff.lateGame,
  );
  if (overtime) {
    homeByQuarter.push(homeGoals - homeReg);
    awayByQuarter.push(awayGoals - awayReg);
  }
  let lead = 0;
  let homeBiggestLead = 0;
  let awayBiggestLead = 0;
  for (let q = 0; q < homeByQuarter.length; q++) {
    lead += homeByQuarter[q] - awayByQuarter[q];
    homeBiggestLead = Math.max(homeBiggestLead, lead);
    awayBiggestLead = Math.max(awayBiggestLead, -lead);
  }

  fillBox(box.home, box.away, homeGoals, awayGoals, profile, timeScale, share, rng, level);
  fillBox(box.away, box.home, awayGoals, homeGoals, profile, timeScale, 1 - share, rng, level);
  // Faceoff takes are the same event for both sides, so they have to match.
  const draws = homeGoals + awayGoals + 4;
  box.home.faceoffTakes = draws;
  box.away.faceoffTakes = draws;
  box.home.faceoffWins = Math.round(draws * share);
  box.away.faceoffWins = draws - box.home.faceoffWins;
  // A save is a shot on goal that did not go in. There is no other definition.
  box.home.saves = Math.max(0, box.away.shotsOnGoal - awayGoals);
  box.away.saves = Math.max(0, box.home.shotsOnGoal - homeGoals);
  // Turnovers one side commits are partly forced by the other.
  box.home.causedTurnovers = Math.round(box.away.turnovers * rng.range(0.45, 0.62));
  box.away.causedTurnovers = Math.round(box.home.turnovers * rng.range(0.45, 0.62));

  return {
    homeScore: homeGoals,
    awayScore: awayGoals,
    home: box.home,
    away: box.away,
    overtime,
    homeByQuarter,
    awayByQuarter,
    homeBiggestLead,
    awayBiggestLead,
  };
}

/**
 * Splits both final scores across four quarters TOGETHER.
 *
 * Drawing each side independently was the reason a comeback never happened: two
 * independent clumpings almost always cancel out, so the lead crept along with
 * the final margin and no team ever got three or four clear and then lost it.
 *
 * Real games have a shape. One side takes the first half, the other takes the
 * second; or somebody scores five in a row and holds on. A single shared
 * momentum swing gives every game one, and because it only moves goals BETWEEN
 * quarters it can never change the final score.
 */
function splitGame(
  rng: Rng, homeGoals: number, awayGoals: number, lateBias = 0,
): [number[], number[]] {
  // Where the game turned, and how hard. Most games swing a little; some are
  // two different games either side of half time.
  const turn = 1 + Math.floor(rng.next() * 3);   // quarter the run breaks on
  const strength = rng.range(0, 1) ** 1.6;       // mostly gentle, occasionally not
  const toward = rng.next() < 0.5 ? 1 : -1;      // who owns the early part of it

  const tilt = (q: number, side: 1 | -1): number => {
    const early = q < turn ? 1 : -1;
    // A side coached to finish games scores more of its goals in the second
    // half. It does not change the final score — only when it arrived — which
    // is what makes a late-game coach show up in comebacks and in holding on.
    const late = q >= 2 ? 1 + lateBias * side * 0.6 : 1 - lateBias * side * 0.35;
    return Math.max(0.15, (1 + strength * 0.85 * early * toward * side) * late);
  };
  const weightsFor = (side: 1 | -1): number[] => [0, 1, 2, 3]
    .map((q) => Math.max(0.08, rng.range(0.55, 1.5) * tilt(q, side)));

  return [
    allocate(homeGoals, weightsFor(1)),
    allocate(awayGoals, weightsFor(-1)),
  ];
}

/** Hands out `goals` across four quarters in proportion to `weights`. */
function allocate(goals: number, weights: number[]): number[] {
  const total = weights.reduce((n, w) => n + w, 0);
  const out = [0, 0, 0, 0];
  let left = goals;
  for (let q = 0; q < 3; q++) {
    const n = Math.min(left, Math.round((weights[q] / total) * goals));
    out[q] = n;
    left -= n;
  }
  out[3] = left;
  return out;
}

/**
 * Turns the rates worked out above into whole numbers that agree with the
 * scoreline: shots at least as many as goals, shots on goal in between, and
 * everything else at the level's own rate.
 */
function fillBox(
  mine: SimTeamBox, _theirs: SimTeamBox, goals: number, _against: number,
  profile: LevelProfile, timeScale: number, foShare: number, rng: Rng, level: Level,
): void {
  const sog = Math.max(goals, Math.round(mine.shotsOnGoal + rng.range(-1.5, 1.5)));
  const shots = Math.max(sog, Math.round(mine.shots + rng.range(-2, 2)));
  mine.shotsOnGoal = sog;
  mine.shots = shots;
  mine.goals = goals;
  mine.twoPointGoals = profile.twoPointRate > 0
    ? Math.min(goals, poisson(rng, goals * profile.twoPointRate))
    : 0;
  // Ground balls follow possession and the level's own rate.
  mine.groundBalls = Math.max(0, Math.round(
    profile.groundBalls * timeScale * (0.85 + foShare * 0.3) * rng.range(0.85, 1.15),
  ));
  mine.turnovers = Math.max(0, Math.round(profile.turnovers * timeScale * rng.range(0.8, 1.2)));
  // Clears: you clear after every save and most turnovers in your own half.
  mine.clearAttempts = Math.max(0, Math.round((mine.groundBalls * 0.45 + 4) * rng.range(0.85, 1.15)));
  const clearSkill = LEVELS[level].ageSystem === 'hs' ? 0.82 : 0.88;
  mine.clears = Math.round(mine.clearAttempts * clamp(clearSkill + rng.range(-0.08, 0.08), 0.6, 0.99));
}

/**
 * The original entry point, kept so every existing call site works unchanged.
 * Callers that know the level, the weather or the tactics should use
 * `simulateMatch` and get a game that reflects them.
 */
export function simulateGame(
  home: TeamRatings, away: TeamRatings, seedKey: string, lengthScale = 1,
): SimResult {
  return simulateMatch(home, away, seedKey, { lengthScale, homeAdvantage: true });
}

/** Everything the debug tool needs to explain a scoreline. */
export function simulationBreakdown(r: SimResult): string[] {
  const line = (name: string, b: SimTeamBox) => {
    const shooting = b.shots ? ((b.goals / b.shots) * 100).toFixed(1) : '0.0';
    const faced = b.saves + (name === 'HOME' ? 0 : 0);
    void faced;
    return `${name.padEnd(5)} ${String(b.goals).padStart(2)}g  `
      + `${String(b.possessions).padStart(2)} poss  ${String(b.shots).padStart(2)} sh  `
      + `${String(b.shotsOnGoal).padStart(2)} sog  ${shooting.padStart(4)}%  `
      + `${String(b.saves).padStart(2)} sv  ${String(b.groundBalls).padStart(2)} gb  `
      + `${String(b.turnovers).padStart(2)} to  ${String(b.faceoffWins).padStart(2)}/${b.faceoffTakes} fo`;
  };
  return [
    line('HOME', r.home),
    line('AWAY', r.away),
    r.overtime ? 'Decided in sudden victory.' : '',
  ].filter(Boolean);
}
