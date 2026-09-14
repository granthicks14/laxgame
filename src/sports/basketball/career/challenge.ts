import type { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { LEVELS } from '../levels';
import {
  FINAL_RUNG, RUNGS, chapterOf, completesChapter, rungAt,
} from './ladder';
import { DEFAULT_TIER, modsFor, tierInfo, type HoopsTier } from './difficulty';

/* ---------------------------------------------------------------------------
 * THE COACHING CAREER
 * ---------------------------------------------------------------------------
 * One coach, one lifetime, nine rungs. This file is the machinery that decides
 * what happens to him at the end of every season:
 *
 *   REPUTATION   what the sport thinks of you. Built by winning, and by winning
 *                MORE THAN THE ROSTER YOU WERE GIVEN SHOULD HAVE WON. It is the
 *                only thing that decides which jobs you are offered.
 *   EXPECTATION  what THIS programme wants, adjusted for the mess you inherited.
 *                Beating it cools you off; missing it heats you up.
 *   HEAT         how close you are to being sacked. Three bad years and you are
 *                out — but never in your first season, because nobody is fired
 *                for a squad somebody else built.
 *   OFFERS       winning a championship gets you interviews, not a promotion.
 *                You choose from what you are actually offered, and the best
 *                programme in the list is reliably the one in the worst state.
 *
 * Failure is real and it is survivable. Getting sacked drops you a rung and
 * costs you the recruits you were chasing. Failing to find any job at all costs
 * you a year. Two of those in a row and it is over — which is the only way this
 * mode ends other than winning the professional league.
 * ------------------------------------------------------------------------- */

export type SituationKey =
  | 'stable' | 'rebuild' | 'scandal' | 'exodus' | 'expectation' | 'sleeping';

export interface SituationInfo {
  key: SituationKey;
  label: string;
  blurb: string;
  /** Rating points the inherited squad sits below the programme's standard. */
  squadPenalty: number;
  /** How much slack the board gives you because of it, in win percentage. */
  relief: number;
}

export const SITUATIONS: Record<SituationKey, SituationInfo> = {
  stable: {
    key: 'stable',
    label: 'A settled programme',
    blurb: 'Nothing is broken. Which means nothing is an excuse either.',
    squadPenalty: 0,
    relief: 0,
  },
  rebuild: {
    key: 'rebuild',
    label: 'A rebuild',
    blurb: 'The squad that got the last coach sacked, minus its two best players.',
    squadPenalty: 7,
    relief: 0.1,
  },
  scandal: {
    key: 'scandal',
    label: 'Coming off a scandal',
    blurb: 'Sanctions, a thin roster and a recruiting reputation in the bin.',
    squadPenalty: 9,
    relief: 0.13,
  },
  exodus: {
    key: 'exodus',
    label: 'An exodus',
    blurb: 'Half the squad entered the portal the day the last coach left.',
    squadPenalty: 11,
    relief: 0.14,
  },
  expectation: {
    key: 'expectation',
    label: 'Under the microscope',
    blurb: 'Money, facilities, and a board that has already written the headline.',
    squadPenalty: -3,
    relief: -0.05,
  },
  sleeping: {
    key: 'sleeping',
    label: 'A sleeping giant',
    blurb: 'A programme with a past, a full arena and fifteen years of nothing.',
    squadPenalty: 4,
    relief: 0.06,
  },
};

/** Pick a situation for a programme. Severity is a difficulty setting. */
export function situationFor(standing: number, rng: Rng, severity: number): SituationKey {
  const bad: SituationKey[] = ['rebuild', 'scandal', 'exodus'];
  const ok: SituationKey[] = ['stable', 'sleeping'];
  // A strong programme in trouble is a "sleeping giant"; a weak one is a mess.
  const badChance = clamp(0.3 + severity * 0.4 + (60 - standing) / 200, 0, 0.92);
  if (rng.bool(badChance)) return bad[rng.int(0, bad.length - 1)];
  if (standing >= 82 && rng.bool(0.45)) return 'expectation';
  return ok[rng.int(0, ok.length - 1)];
}

/* ----------------------------------------------------------- expectations */

export interface Expectation {
  /** Win percentage the programme considers acceptable. */
  winPct: number;
  /** True when nothing but a championship will do. */
  title: boolean;
  text: string;
}

export function expectationFor(
  rungIndex: number, standing: number, situation: SituationKey,
  reputation: number, tier: HoopsTier = DEFAULT_TIER,
): Expectation {
  const rung = rungAt(rungIndex);
  const relief = SITUATIONS[situation].relief;
  // A big reputation raises what people want from you. Success has a cost.
  const fame = clamp((reputation - 50) / 100, -0.06, 0.08);
  const strength = clamp((standing - 55) / 90, -0.12, 0.18);
  const demand = modsFor(tier).expectation;
  const winPct = clamp(rung.parWinPct + strength + fame + demand - relief, 0.2, 0.82);
  const title = standing >= 85 && rung.parWinPct >= 0.5;
  const text = title
    ? 'Win the championship. Anything else is a failed season.'
    : winPct >= 0.62 ? 'Compete for the title and win most nights.'
      : winPct >= 0.5 ? 'A winning record, and be in the postseason picture.'
        : winPct >= 0.38 ? 'Show progress. Do not get embarrassed.'
          : 'Keep the programme alive and develop the young players.';
  return { winPct: Math.round(winPct * 100) / 100, title, text };
}

/* ------------------------------------------------------------- the state */

export interface JobOffer {
  teamId: string;
  teamName: string;
  teamShort: string;
  rungIndex: number;
  standing: number;
  situation: SituationKey;
  expectation: Expectation;
  /** One line on why this job is open. */
  note: string;
}

export type SeasonOutcome = 'stay' | 'promoted' | 'fired' | 'unemployed' | 'complete';
export type OfferKind = 'promotion' | 'demotion' | 'rehire';

export interface ChallengeStep {
  year: number;
  rungKey: string;
  teamShort: string;
  wins: number;
  losses: number;
  finish: string;
  champion: boolean;
  outcome: SeasonOutcome;
}

export interface ChallengeState {
  tier: HoopsTier;
  rungIndex: number;
  /** Seasons coached, including ones spent out of work. */
  totalYears: number;
  /** 0..100. */
  reputation: number;
  situation: SituationKey;
  /** Seasons at the current programme. */
  tenure: number;
  expectation: Expectation;
  /** 0..3. Three and the programme moves on. */
  heat: number;
  offers: JobOffer[] | null;
  offerKind: OfferKind | null;
  fired: boolean;
  /** Seasons in a row spent without a job. Two ends the career. */
  strikes: number;
  /** Championships won, by rung key. */
  titles: Record<string, number>;
  steps: ChallengeStep[];
  complete: boolean;
  endedReason: string | null;
}

export function newChallengeState(
  rungIndex: number, situation: SituationKey, expectation: Expectation,
  tier: HoopsTier = DEFAULT_TIER,
): ChallengeState {
  return {
    tier,
    rungIndex,
    totalYears: 0,
    reputation: 20,
    situation,
    tenure: 0,
    expectation,
    heat: 0,
    offers: null,
    offerKind: null,
    fired: false,
    strikes: 0,
    titles: {},
    steps: [],
    complete: false,
    endedReason: null,
  };
}

/* -------------------------------------------------------------- a season */

export interface SeasonInput {
  wins: number;
  losses: number;
  champion: boolean;
  finish: string;
  teamShort: string;
  standing: number;
}

export interface SeasonVerdict {
  outcome: SeasonOutcome;
  messages: string[];
  reputationDelta: number;
}

/** Reputation a title is worth at each rung. Winning the top one is a career. */
const titleValue = (rungIndex: number): number => 10 + rungIndex * 2.8;

/**
 * Grade the season, move reputation and heat, and decide what happens next. The
 * caller generates offers if the verdict calls for them.
 */
export function evaluateSeason(state: ChallengeState, input: SeasonInput): SeasonVerdict {
  const rung = rungAt(state.rungIndex);
  const games = Math.max(1, input.wins + input.losses);
  const pct = input.wins / games;
  const gap = pct - state.expectation.winPct;
  const messages: string[] = [];

  state.totalYears++;
  state.tenure++;

  // Reputation: winning matters, but beating what you were given matters more.
  let rep = gap * 26;
  if (input.champion) rep += titleValue(state.rungIndex);
  if (state.expectation.title && !input.champion) rep -= 4;
  rep -= 1.2; // the sport forgets you if you do nothing
  state.reputation = clamp(state.reputation + rep, 0, 100);

  const badly = gap < -0.14;
  const well = gap >= 0 || input.champion;
  if (input.champion) state.heat = 0;
  else if (well) state.heat = Math.max(0, state.heat - 1);
  else if (badly && state.tenure > 1) state.heat++;

  if (input.champion) {
    state.titles[rung.key] = (state.titles[rung.key] ?? 0) + 1;
    messages.push(`You won the ${LEVELS[rung.level].trophy}.`);
  } else if (gap >= 0.1) {
    messages.push('You got more out of this roster than anybody expected.');
  } else if (badly) {
    messages.push(
      `The programme wanted ${Math.round(state.expectation.winPct * 100)}%`
      + ` and got ${Math.round(pct * 100)}%.`,
    );
  }

  let outcome: SeasonOutcome = 'stay';

  /* THE ONLY ENDING. A championship at any other rung finishes a rung — and, at
   * the top of a chapter, a chapter — and the career carries on. Nothing else
   * may ever set `complete` from a win, at any level, for any reason. */
  if (input.champion && state.rungIndex >= FINAL_RUNG) {
    state.complete = true;
    state.endedReason = `You won the ${LEVELS[rung.level].trophy}.`;
    outcome = 'complete';
    messages.push('There is nothing above this. The climb is over.');
  } else if (input.champion) {
    outcome = 'promoted';
    if (completesChapter(state.rungIndex)) {
      const chapter = chapterOf(state.rungIndex);
      messages.push(`${chapter.headline.toUpperCase()}. ${chapter.blurb}`);
      messages.push(`Next: ${chapter.nextName.toLowerCase()}.`);
    } else {
      messages.push('The phone has started ringing.');
    }
  } else if (state.heat >= 3) {
    outcome = 'fired';
    state.fired = true;
    state.heat = 0;
    state.tenure = 0;
    state.reputation = clamp(state.reputation - 8, 0, 100);
    messages.push('You have been let go.');
  } else if (state.heat === 2) {
    messages.push('One more season like that and you will be out.');
  }

  state.steps.push({
    year: state.totalYears,
    rungKey: rung.key,
    teamShort: input.teamShort,
    wins: input.wins,
    losses: input.losses,
    finish: input.finish,
    champion: input.champion,
    outcome,
  });

  return { outcome, messages, reputationDelta: Math.round(rep * 10) / 10 };
}

/* ------------------------------------------------------------- the offers */

export interface Programme {
  id: string;
  name: string;
  short: string;
  standing: number;
}

/**
 * How far a championship carries you: EXACTLY ONE RUNG, always.
 *
 * Skipping a level is skipping the point of the mode — a junior college title
 * producing a high-major job means the coach never has to prove he can build a
 * Division II programme, and the climb stops being a climb. The pace problem
 * belongs to the pace levers, not to the structure of the ladder.
 */
export const PROMOTION_REACH = 1;

/**
 * The jobs actually on the table.
 *
 * Reputation is the gate: a coach nobody has heard of gets the worst programme
 * at the next rung and is grateful for it. There are always at least two, they
 * are always different bets, and the best programme in the list is reliably the
 * one in the deepest trouble.
 */
export function generateOffers(
  state: ChallengeState, kind: OfferKind, pool: Programme[], rng: Rng, count = 3,
  targetRung = kind === 'promotion'
    ? Math.min(FINAL_RUNG, state.rungIndex + 1)
    : kind === 'demotion' ? Math.max(0, state.rungIndex - 1) : state.rungIndex,
): JobOffer[] {
  // THE LADDER HAS NO SHORTCUTS. Clamped here rather than trusting callers: a
  // skipped level is the one bug in this mode that cannot be seen in a
  // screenshot, so it is made unwritable instead of watched for.
  const rung = Math.max(0, Math.min(state.rungIndex + PROMOTION_REACH, targetRung));
  const mods = modsFor(state.tier);
  const sorted = [...pool].sort((a, b) => a.standing - b.standing);
  const rep = clamp(state.reputation / 100, 0, 1);

  // A coach who has just won is a hot name and shops higher up the order; a
  // sacked one shops lower. This is the main pace lever for the mode.
  const standing = kind === 'promotion' ? 0.44 : kind === 'demotion' ? 0.16 : 0.3;
  const width = kind === 'promotion' ? 0.38 : 0.5;
  const top = clamp(standing + rep * 0.72 + mods.jobQuality, 0.16, 1);
  const bottom = clamp(top - width, 0, 0.9);
  const last = Math.max(0, sorted.length - 1);
  const lo = Math.floor(bottom * last);
  const hi = Math.max(lo, Math.ceil(top * last));
  const window = sorted.slice(lo, hi + 1);
  const picked = rng.shuffle([...window]).slice(0, count);
  if (!picked.length && sorted.length) picked.push(sorted[0]);

  // Three programmes on one screen with the identical problem reads as a
  // generator rather than a job market, and it makes the choice meaningless.
  const taken = new Set<SituationKey>();
  return picked.map((p) => {
    let situation = situationFor(p.standing, rng, mods.situationSeverity);
    for (let tries = 0; tries < 4 && taken.has(situation); tries++) {
      situation = situationFor(p.standing, rng, mods.situationSeverity);
    }
    taken.add(situation);
    return {
      teamId: p.id,
      teamName: p.name,
      teamShort: p.short,
      rungIndex: rung,
      standing: Math.round(p.standing),
      situation,
      expectation: expectationFor(rung, p.standing, situation, state.reputation, state.tier),
      note: SITUATIONS[situation].blurb,
    };
  }).sort((a, b) => (b.rungIndex - a.rungIndex) || (b.standing - a.standing));
}

/** Applies an accepted offer. The career continues; the job does not. */
export function acceptOffer(state: ChallengeState, offer: JobOffer): void {
  state.rungIndex = offer.rungIndex;
  state.situation = offer.situation;
  state.expectation = offer.expectation;
  state.tenure = 0;
  state.heat = 0;
  state.fired = false;
  state.strikes = 0;
  state.offers = null;
  state.offerKind = null;
}

/** Turning everything down. A year out of the game is a real cost. */
export function declineAll(state: ChallengeState): void {
  state.offers = null;
  state.offerKind = null;
  if (state.fired) {
    state.strikes++;
    state.totalYears++;
    if (state.strikes >= 2) {
      state.complete = true;
      state.endedReason = 'Two years out of the game. Nobody is calling any more.';
    }
  }
}

/* ---------------------------------------------------------------- legacy */

export interface Legacy {
  score: number;
  title: string;
  lines: { label: string; value: string; points: number }[];
}

/**
 * The number the whole career adds up to. Championships are weighted by how hard
 * they were to win, so a professional title is worth several school ones, and a
 * coach who climbed the whole ladder outranks one who won the same rung nine
 * times.
 */
export function legacyScore(
  state: ChallengeState, extra: { developed: number; found: number } = { developed: 0, found: 0 },
): Legacy {
  const lines: Legacy['lines'] = [];
  let score = 0;

  let titles = 0;
  let titlePoints = 0;
  RUNGS.forEach((rung, i) => {
    const n = state.titles[rung.key] ?? 0;
    if (!n) return;
    titles += n;
    titlePoints += n * (12 + i * 9);
  });
  score += titlePoints;
  lines.push({ label: 'Championships', value: `${titles}`, points: Math.round(titlePoints) });

  const climb = state.rungIndex * 26;
  score += climb;
  lines.push({
    label: 'Highest level reached',
    value: rungAt(state.rungIndex).short,
    points: climb,
  });

  const rep = Math.round(state.reputation * 1.6);
  score += rep;
  lines.push({ label: 'Reputation', value: `${Math.round(state.reputation)}`, points: rep });

  const wins = state.steps.reduce((n, s) => n + s.wins, 0);
  const winPoints = Math.round(wins * 0.5);
  score += winPoints;
  lines.push({ label: 'Career wins', value: `${wins}`, points: winPoints });

  const years = Math.round(state.totalYears * 1.2);
  score += years;
  lines.push({ label: 'Seasons coached', value: `${state.totalYears}`, points: years });

  if (extra.developed) {
    const dp = extra.developed * 6;
    score += dp;
    lines.push({
      label: 'Players developed into stars', value: `${extra.developed}`, points: dp,
    });
  }
  if (extra.found) {
    const fp = extra.found * 12;
    score += fp;
    lines.push({ label: 'Players nobody else wanted', value: `${extra.found}`, points: fp });
  }

  // DIFFICULTY. Everything above is what the coach did; this is what it was done
  // under. Every one of those championships was won with fewer points, a
  // contested portal and a squad that grew slowly.
  const mult = modsFor(state.tier).legacy;
  if (mult !== 1) {
    const before = score;
    score = Math.round(score * mult);
    lines.push({ label: tierInfo(state.tier).name, value: `${mult}x`, points: score - before });
  }

  // The TITLE describes the career; the SCORE describes it weighted by what it
  // was won under, so the thresholds move with the multiplier.
  const bar = (n: number): number => n * mult;
  const title = score >= bar(1500) ? 'Immortal'
    : score >= bar(1100) ? 'Legend'
      : score >= bar(800) ? 'Great'
        : score >= bar(500) ? 'Respected'
          : score >= bar(280) ? 'Established'
            : score >= bar(110) ? 'Journeyman' : 'Footnote';

  return { score: Math.round(score), title, lines };
}
