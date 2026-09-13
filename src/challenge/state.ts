/* ---------------------------------------------------------------------------
 * THE CHALLENGE CAREER
 * ---------------------------------------------------------------------------
 * One coach, one lifetime, nine rungs. This file is the machinery that decides
 * what happens to him at the end of every season:
 *
 *   REPUTATION   what the sport thinks of you. Built by winning, and by winning
 *                more than the roster you were given should have won. It is the
 *                only thing that decides which jobs you are offered.
 *   EXPECTATION  what THIS programme wants, adjusted for the mess you inherited.
 *                Beating it cools you off; missing it heats you up.
 *   HEAT         how close you are to being sacked. Three bad years and you are
 *                out — but never in your first season, because nobody is fired
 *                for a squad somebody else built.
 *   OFFERS       winning the championship gets you interviews, not a promotion.
 *                You choose from what you are actually offered, and the best
 *                job available is usually the one with the worst situation.
 *
 * Failure is real and it is survivable. Getting fired drops you a rung and
 * costs you the recruits you were chasing. Failing to find any job at all costs
 * you a year of your career. Two of those in a row and it is over — which is
 * the only way this mode ends other than the PLL.
 * ------------------------------------------------------------------------- */

import type { Rng } from '../core/rng';
import { clamp } from '../core/math';
import { STAGES, FINAL_STAGE, stageAt, type Stage } from './ladder';
import { SITUATIONS, situationFor, type SituationKey } from './situations';
import { DEFAULT_TIER, modsFor, tierInfo, type ChallengeTier } from './difficulty';

export interface Expectation {
  /** Win percentage the programme considers acceptable. */
  winPct: number;
  /** True when nothing but a championship will do. */
  title: boolean;
  text: string;
}

export interface JobOffer {
  teamId: string;
  teamName: string;
  teamShort: string;
  stageIndex: number;
  prestige: number;
  situation: SituationKey;
  expectation: Expectation;
  /** One line on why this job is open. */
  note: string;
}

export type SeasonOutcome = 'stay' | 'promoted' | 'fired' | 'unemployed' | 'complete';

export interface ChallengeStep {
  year: number;
  stageKey: string;
  teamShort: string;
  wins: number;
  losses: number;
  finish: string;
  champion: boolean;
  outcome: SeasonOutcome;
}

export type OfferKind = 'promotion' | 'demotion' | 'rehire';

export interface ChallengeState {
  /** How hard this career is. Chosen once, before the first job, and fixed for
   *  the life of the coach — the whole point is that the record says what it
   *  was won under. */
  tier: ChallengeTier;
  stageIndex: number;
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
  /** Pending decision. Null when there is nothing to decide. */
  offers: JobOffer[] | null;
  offerKind: OfferKind | null;
  /** Set the season you are sacked, cleared when you take a job. */
  fired: boolean;
  /** Seasons in a row spent without a job. Two ends the career. */
  strikes: number;
  /** Championships won, by stage key. */
  titles: Record<string, number>;
  steps: ChallengeStep[];
  /** Set when the PLL is won, or when the career ends badly. */
  complete: boolean;
  endedReason: string | null;
}

/* ------------------------------------------------------------ expectations */

/**
 * What a programme wants. A strong programme at a high rung wants a title; a
 * broken one at the bottom wants signs of life. The situation you inherited is
 * a genuine allowance, which is what keeps this hard rather than unfair.
 */
export function expectationFor(
  stage: Stage, prestige: number, situation: SituationKey, reputation: number,
  tier: ChallengeTier = DEFAULT_TIER,
): Expectation {
  const relief = SITUATIONS[situation].expectationRelief;
  // A big reputation raises what people want from you. Success has a cost.
  const fame = clamp((reputation - 50) / 100, -0.06, 0.08);
  const strength = clamp((prestige - 55) / 90, -0.12, 0.18);
  // Harder tiers put you in front of boards with less patience.
  const demand = modsFor(tier).expectation;
  const winPct = clamp(stage.parWinPct + strength + fame + demand - relief, 0.2, 0.82);
  const title = prestige >= 85 && stage.parWinPct >= 0.5;
  const text = title
    ? 'Win the championship. Anything else is a failed season.'
    : winPct >= 0.62 ? 'Compete for the title and win most weeks.'
      : winPct >= 0.5 ? 'A winning record, and be in the playoff picture.'
        : winPct >= 0.38 ? 'Show progress. Do not get embarrassed.'
          : 'Keep the programme alive and develop the young players.';
  return { winPct: Math.round(winPct * 100) / 100, title, text };
}

export function newChallengeState(
  stageIndex: number, situation: SituationKey, expectation: Expectation,
  tier: ChallengeTier = DEFAULT_TIER,
): ChallengeState {
  return {
    tier,
    stageIndex,
    totalYears: 0,
    reputation: 22,
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

/* -------------------------------------------------------------- the season */

export interface SeasonInput {
  wins: number;
  losses: number;
  champion: boolean;
  finish: string;
  teamShort: string;
  /** Where the programme was expected to finish, 0..1 of the table. */
  prestige: number;
}

export interface SeasonVerdict {
  outcome: SeasonOutcome;
  /** Lines the end-of-season screen shows, in order. */
  messages: string[];
  reputationDelta: number;
}

/** Reputation a title is worth at each rung. Winning the PLL is a career. */
function titleValue(stageIndex: number): number {
  return 10 + stageIndex * 2.6;
}

/**
 * Grades the season, moves reputation and heat, and decides what happens next.
 * The caller then generates offers if the verdict calls for them.
 */
export function evaluateSeason(state: ChallengeState, input: SeasonInput): SeasonVerdict {
  const stage = stageAt(state.stageIndex);
  const games = Math.max(1, input.wins + input.losses);
  const pct = input.wins / games;
  const gap = pct - state.expectation.winPct;
  const messages: string[] = [];

  state.totalYears++;
  state.tenure++;

  // Reputation: winning matters, but beating what you were given matters more.
  let rep = gap * 26;
  if (input.champion) rep += titleValue(state.stageIndex);
  if (state.expectation.title && !input.champion) rep -= 4;
  rep -= 1.2; // the sport forgets you if you do nothing
  state.reputation = clamp(state.reputation + rep, 0, 100);

  // Heat.
  const badly = gap < -0.14;
  const well = gap >= 0 || input.champion;
  if (input.champion) state.heat = 0;
  else if (well) state.heat = Math.max(0, state.heat - 1);
  else if (badly && state.tenure > 1) state.heat++;

  if (input.champion) {
    state.titles[stage.key] = (state.titles[stage.key] ?? 0) + 1;
    messages.push(`${stage.requirement.replace('Win the', 'You won the').replace('Win a', 'You won a')}.`);
  } else if (gap >= 0.1) {
    messages.push('You got more out of this roster than anybody expected.');
  } else if (badly) {
    messages.push(`The programme wanted ${Math.round(state.expectation.winPct * 100)}% and got ${Math.round(pct * 100)}%.`);
  }

  let outcome: SeasonOutcome = 'stay';

  // THE ONLY ENDING. A championship at any other rung finishes a rung — and,
  // at the top of a chapter, a chapter — and the career carries on. Nothing
  // else may ever set `complete` from a win, at any level, for any reason.
  if (input.champion && state.stageIndex >= FINAL_STAGE) {
    state.complete = true;
    state.endedReason = 'You won the Premier Lacrosse League.';
    outcome = 'complete';
    messages.push('There is nothing above this. The climb is over.');
  } else if (input.champion) {
    outcome = 'promoted';
    if (completesChapter(state.stageIndex)) {
      const chapter = chapterOf(state.stageIndex);
      messages.push(`${chapter.headline.toUpperCase()}. ${chapter.blurb}`);
      messages.push(`Next chapter: ${chapter.nextName.toLowerCase()}.`);
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
    stageKey: stage.key,
    teamShort: input.teamShort,
    wins: input.wins,
    losses: input.losses,
    finish: input.finish,
    champion: input.champion,
    outcome,
  });

  return { outcome, messages, reputationDelta: Math.round(rep * 10) / 10 };
}

/* ----------------------------------------------------------------- offers */

export interface Programme {
  id: string;
  name: string;
  short: string;
  prestige: number;
}

/**
 * The jobs actually on the table. Reputation is the gate: a coach nobody has
 * heard of gets the worst programme at the next rung and is grateful for it.
 * There are always at least two, and they are always different bets — the best
 * programme in the list is reliably the one in the deepest trouble.
 */
export function generateOffers(
  state: ChallengeState, kind: OfferKind, pool: Programme[], rng: Rng, count = 3,
  targetStage = kind === 'promotion'
    ? Math.min(FINAL_STAGE, state.stageIndex + 1)
    : kind === 'demotion' ? Math.max(0, state.stageIndex - 1) : state.stageIndex,
): JobOffer[] {
  // THE LADDER HAS NO SHORTCUTS. Clamping here rather than trusting callers is
  // deliberate: a skipped level is the one bug in this mode that cannot be
  // noticed from a screenshot, so it is made unwritable instead of watched for.
  targetStage = Math.max(0, Math.min(state.stageIndex + PROMOTION_REACH, targetStage));
  const stage = stageAt(targetStage);

  // Reputation decides WHERE IN THE POOL you can shop, not an absolute rating —
  // a pool of six Class D schools and a pool of seventy D-I programmes have to
  // behave the same way. A coach nobody knows shops at the bottom; a coach with
  // a name has the whole market open to him.
  const mods = modsFor(state.tier);
  const sorted = [...pool].sort((a, b) => a.prestige - b.prestige);
  const rep = clamp(state.reputation / 100, 0, 1);
  // A COACH WHO HAS JUST WON A CHAMPIONSHIP IS A HOT NAME. With promotion
  // strictly one rung at a time, the whole climb is nine titles, so arriving at
  // a new level with a programme that cannot contend is nine seasons of
  // rebuilding rather than one. A champion shops higher up the order; a sacked
  // coach shops lower. This is the main pace lever for the mode — see the
  // per-rung table in `npm run careers`.
  const standing = kind === 'promotion' ? 0.44 : kind === 'demotion' ? 0.16 : 0.3;
  const width = kind === 'promotion' ? 0.38 : 0.5;
  // On the harder tiers the programmes that come calling are the ones nobody
  // else would take. The window slides down the prestige order rather than
  // closing: there is always a job, it is just rarely a good one.
  const top = clamp(standing + rep * 0.72 + mods.jobQuality, 0.16, 1);
  const bottom = clamp(top - width, 0, 0.9);
  const last = Math.max(0, sorted.length - 1);
  const lo = Math.floor(bottom * last);
  const hi = Math.max(lo, Math.ceil(top * last));
  const window = sorted.slice(lo, hi + 1);
  const picked = rng.shuffle([...window]).slice(0, count);
  if (!picked.length && sorted.length) picked.push(sorted[0]);

  // Three programmes on the same screen with the identical problem — the same
  // headline, the same blurb, the same fix — reads as a generator rather than a
  // job market, and it makes the choice meaningless. Each offer gets a few
  // attempts at a situation nobody else in this set has; a repeat is allowed
  // after that, because two programmes really can be in the same trouble.
  const taken = new Set<SituationKey>();
  return picked.map((p) => {
    let situation = situationFor(p.prestige, rng, mods.situationSeverity);
    for (let tries = 0; tries < 4 && taken.has(situation); tries++) {
      situation = situationFor(p.prestige, rng, mods.situationSeverity);
    }
    taken.add(situation);
    return {
      teamId: p.id,
      teamName: p.name,
      teamShort: p.short,
      stageIndex: targetStage,
      prestige: Math.round(p.prestige),
      situation,
      expectation: expectationFor(stage, p.prestige, situation, state.reputation, state.tier),
      note: SITUATIONS[situation].blurb,
    };
  }).sort((a, b) => (b.stageIndex - a.stageIndex) || (b.prestige - a.prestige));
}

/**
 * How far a championship carries you: EXACTLY ONE RUNG, always.
 *
 * There used to be a two-rung path for a well-known coach, added to stop a
 * nine-rung ladder taking eighty seasons. It was the wrong fix. Skipping a
 * level is skipping the entire point of the mode — a Division III title
 * producing a Division I job means the coach never has to prove he can build a
 * Division II programme, and the climb stops being a climb. The pace problem
 * belongs to the pace levers (see `parWinPct` and the difficulty tiers), not to
 * the structure of the ladder.
 *
 * Every level must be earned, one championship at a time.
 */
export const PROMOTION_REACH = 1;

/* ---------------------------------------------------------------- chapters */

/**
 * The ladder is nine rungs but three CHAPTERS, and crossing between them is the
 * moment the career changes shape: schoolboys become recruited college players,
 * and college players become professionals who are paid to be there.
 *
 * Winning the last rung of a chapter completes that chapter. It does NOT end
 * the career. There is exactly one ending, and it is the PLL.
 */
export type Chapter = 'highschool' | 'college' | 'professional';

export interface ChapterInfo {
  key: Chapter;
  name: string;
  /** Stage indices, inclusive. */
  from: number;
  to: number;
  /** Shown when the chapter is finished. */
  headline: string;
  blurb: string;
  /** What the next chapter is called on the job screen. */
  nextName: string;
}

export const CHAPTERS: ChapterInfo[] = [
  {
    key: 'highschool',
    name: 'High school',
    from: 0,
    to: 3,
    headline: 'High school chapter complete',
    blurb: 'You have conquered high school lacrosse. But your coaching journey is far from over.',
    nextName: 'College lacrosse',
  },
  {
    key: 'college',
    name: 'College',
    from: 4,
    to: 6,
    headline: 'College chapter complete',
    blurb: 'You have won at every level of college lacrosse. What is left is the professional game.',
    nextName: 'The professional game',
  },
  {
    key: 'professional',
    name: 'Professional',
    from: 7,
    to: 8,
    headline: 'The climb is over',
    blurb: 'There is nothing above this.',
    nextName: '',
  },
];

export function chapterOf(stageIndex: number): ChapterInfo {
  return CHAPTERS.find((c) => stageIndex >= c.from && stageIndex <= c.to) ?? CHAPTERS[0];
}

/** True when winning at this rung finishes a chapter and opens the next one. */
export function completesChapter(stageIndex: number): boolean {
  const c = chapterOf(stageIndex);
  return stageIndex === c.to && c.key !== 'professional';
}

/** Applies an accepted offer. The career continues; the job does not. */
export function acceptOffer(state: ChallengeState, offer: JobOffer): void {
  state.stageIndex = offer.stageIndex;
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
 * The number the whole career adds up to. Championships are weighted by how
 * hard they were to win, so a PLL title is worth several high school ones, and
 * a coach who climbed the whole ladder outranks one who won Class D nine times.
 */
export function legacyScore(state: ChallengeState, extra: { gems: number; developed: number } = { gems: 0, developed: 0 }): Legacy {
  const lines: Legacy['lines'] = [];
  let score = 0;

  let titles = 0;
  let titlePoints = 0;
  for (const stage of STAGES) {
    const n = state.titles[stage.key] ?? 0;
    if (!n) continue;
    titles += n;
    titlePoints += n * (12 + STAGES.indexOf(stage) * 9);
  }
  score += titlePoints;
  lines.push({ label: 'Championships', value: `${titles}`, points: Math.round(titlePoints) });

  const climb = state.stageIndex * 26;
  score += climb;
  lines.push({ label: 'Highest level reached', value: stageAt(state.stageIndex).short, points: climb });

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

  if (extra.gems) {
    const gp = extra.gems * 14;
    score += gp;
    lines.push({ label: 'Overlooked players you found', value: `${extra.gems}`, points: gp });
  }
  if (extra.developed) {
    const dp = extra.developed * 6;
    score += dp;
    lines.push({ label: 'Players developed into stars', value: `${extra.developed}`, points: dp });
  }

  // DIFFICULTY. Everything above is what the coach did; this is what it was
  // done under. A Final Challenge career is worth well over twice a Standard
  // one, because at that tier every one of those championships was won with
  // fewer Coach Points, a contested portal and a squad that grew slowly.
  const mult = modsFor(state.tier).legacy;
  if (mult !== 1) {
    const before = score;
    score = Math.round(score * mult);
    lines.push({
      label: `${tierInfo(state.tier).name}`,
      value: `${mult}x`,
      points: score - before,
    });
  }

  // Calibrated against simulated careers: a coach who climbs to Division I and
  // wins there is a Legend; Immortal means the ladder was finished.
  // The TITLE describes the career; the SCORE describes the career weighted by
  // what it was won under. So the thresholds move with the multiplier — a
  // Footnote on Final is still a Footnote — while the number a coach compares
  // against his last run reflects the tier he chose.
  const bar = (n: number) => n * mult;
  const title = score >= bar(1500) ? 'Immortal'
    : score >= bar(1100) ? 'Legend'
      : score >= bar(800) ? 'Great'
        : score >= bar(500) ? 'Respected'
          : score >= bar(280) ? 'Established'
            : score >= bar(110) ? 'Journeyman' : 'Footnote';

  return { score: Math.round(score), title, lines };
}
