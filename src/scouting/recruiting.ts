/* ---------------------------------------------------------------------------
 * RECRUITING
 * ---------------------------------------------------------------------------
 * The class runs all season, alongside the games. Every week your scouts see a
 * little more, every week somebody else notices the player you found, and every
 * week a few prospects stop listening and commit somewhere.
 *
 * The core tension is simple and it never goes away:
 *
 *   You have more prospects than scouts, more targets than offers, and the
 *   longer you wait to be sure, the more likely somebody else is sure first.
 *
 * AI programmes recruit for real, and — importantly — they recruit off HYPE.
 * A well-resourced programme scouts too and will find a gem on its own, but a
 * mid-table one chases rankings. That is precisely why hidden gems exist and
 * why they do not last: the better the competition, the smaller your window.
 *
 * Everything is capped so this cannot be farmed. Offers are scarce, scouts cost
 * the same Coach Points as your staff, and a prospect who is ranked far above
 * your programme will not listen no matter how much you spend on him.
 * ------------------------------------------------------------------------- */

import { Rng } from '../core/rng';
import { clamp } from '../core/math';
import type { Position } from '../data/constants';
import { LEVELS, type Level } from '../data/levels';
import { emptyStats, type PlayerData } from '../data/players';
import type { GameTeam } from '../data/teams';
import {
  buildClass, estimateOf, levelPar,
  type Prospect, type ProspectOrigin,
} from './prospects';
import {
  noiseDecay, scoutMarket, weeklyProgress, weeklyRapport, type Scout,
} from './scouts';

export interface RecruitNews {
  week: number;
  text: string;
  /** 'gem' and 'lost' are the two the coach needs to see. */
  kind: 'signed' | 'lost' | 'gem' | 'interest' | 'battle' | 'scout';
}

export interface RecruitingState {
  /** Which class this is, counted from the start of the career. */
  cycle: number;
  level: Level;
  prospects: Prospect[];
  /** Scouts on the payroll. */
  scouts: Scout[];
  /** Scouts available to hire this cycle. */
  market: Scout[];
  offersLeft: number;
  maxOffers: number;
  /** Committed to you. They join the roster at the offseason. */
  signed: string[];
  news: RecruitNews[];
  week: number;
  /**
   * Professional only. A draft pick is spent on a name the league has ranked;
   * a camp invite is spent on somebody nobody drafted. Every genuinely
   * overlooked player in a draft class ends up here, which is where a club that
   * scouted properly gets paid.
   */
  invites: number;
  /** Set once the class closes, so signing day only happens once. */
  closed: boolean;
}

/* ------------------------------------------------------------------ setup */

/** Offers a programme can extend in one cycle. Scarcity is the whole design. */
export function offerBudget(level: Level): number {
  switch (level) {
    case 'hs': return 3;
    case 'd3': return 6;
    case 'd2': return 6;
    case 'd1': return 7;
    case 'semipro': return 5;
    case 'pll': return 4;
  }
}

/** Size of a class at this level. Bigger pools higher up. */
export function classSize(level: Level): number {
  switch (level) {
    case 'hs': return 14;
    case 'd3': return 24;
    case 'd2': return 24;
    case 'd1': return 28;
    case 'semipro': return 20;
    case 'pll': return 22;
  }
}

/** What the intake is called at this level, which changes how it reads. */
export function originFor(level: Level): ProspectOrigin {
  if (level === 'hs') return 'club';
  if (LEVELS[level].ageSystem === 'pro') return 'draft';
  return 'hs';
}

export interface NewClassOptions {
  seed: number;
  cycle: number;
  level: Level;
  prestige: number;
  /** A shell whose ratings set the talent pool the class is drawn from. */
  shell: GameTeam;
  /** Scouts carried over from last cycle. */
  keepScouts?: Scout[];
}

export function newRecruitingClass(opts: NewClassOptions): RecruitingState {
  const key = `${opts.seed}:class:${opts.cycle}`;
  const prospects = buildClass(key, {
    level: opts.level,
    size: classSize(opts.level),
    origin: originFor(opts.level),
    shell: opts.shell,
  });
  const scouts = (opts.keepScouts ?? []).map((s) => ({ ...s, assignedTo: null }));
  return {
    cycle: opts.cycle,
    level: opts.level,
    prospects,
    scouts,
    market: scoutMarket(`${key}:market`, opts.level, opts.prestige),
    offersLeft: offerBudget(opts.level),
    maxOffers: offerBudget(opts.level),
    signed: [],
    news: [],
    week: 0,
    invites: LEVELS[opts.level].ageSystem === 'pro' ? 2 : 0,
    closed: false,
  };
}

/** What this level calls an offer, so a draft reads like a draft. */
export function offerWord(level: Level): { one: string; many: string } {
  return LEVELS[level].ageSystem === 'pro'
    ? { one: 'pick', many: 'picks' }
    : { one: 'offer', many: 'offers' };
}

/**
 * Players nobody has taken with the class closing. At professional levels these
 * are the undrafted free agents, and a club with camp invites left can sign one
 * outright — no bidding, because nobody else wants him.
 */
export function undrafted(state: RecruitingState): Prospect[] {
  if (!state.invites) return [];
  if (state.week < 9) return [];
  return state.prospects
    .filter((p) => !p.committedTo && !p.suitors.length)
    .sort((a, b) => b.player.potential - a.player.potential);
}

/** Signs an undrafted player straight into the class. */
export function signUndrafted(state: RecruitingState, id: string, teamId: string): HireResult {
  if (state.invites <= 0) return { ok: false, reason: 'No camp invites left.' };
  const p = state.prospects.find((x) => x.id === id);
  if (!p) return { ok: false, reason: 'No such player.' };
  if (p.committedTo) return { ok: false, reason: 'He has already signed somewhere.' };
  if (p.suitors.length) return { ok: false, reason: 'Somebody else is on him — you would have to draft him.' };
  if (state.week < 9) return { ok: false, reason: 'The draft has not finished. Nobody is undrafted yet.' };
  state.invites--;
  p.committedTo = teamId;
  state.news.push({
    week: state.week,
    kind: 'signed',
    text: `${p.player.first} ${p.player.last} signs as an undrafted free agent.`,
  });
  return { ok: true };
}

/* -------------------------------------------------------------- the board */

export type BoardTab = 'targets' | 'gems' | 'scouting' | 'offers' | 'battles' | 'committed';

export const BOARD_LABEL: Record<BoardTab, string> = {
  targets: 'Top targets',
  gems: 'Hidden gems',
  scouting: 'Being scouted',
  offers: 'Offers out',
  battles: 'Recruiting battles',
  committed: 'Committed',
};

/** The board, sorted the way a coach would actually want each list. */
export function board(state: RecruitingState, teamId: string, tab: BoardTab): Prospect[] {
  const par = levelPar(state.level);
  const open = state.prospects.filter((p) => !p.committedTo);
  switch (tab) {
    case 'targets':
      // Everything you have a reason to be interested in: the top of the
      // rankings, plus anyone your own people have flagged.
      return [...open]
        .sort((a, b) => estimateOf(b, par).potential - estimateOf(a, par).potential)
        .slice(0, 16);
    case 'gems':
      // Only what YOUR scouts have actually established, never the hidden truth.
      return open
        .filter((p) => p.scouted >= 50 && estimateOf(p, par).potential - p.hype >= 6)
        .sort((a, b) => (estimateOf(b, par).potential - b.hype) - (estimateOf(a, par).potential - a.hype));
    case 'scouting':
      return open.filter((p) => p.tracked).sort((a, b) => b.scouted - a.scouted);
    case 'offers':
      return open.filter((p) => p.offered).sort((a, b) => b.interest - a.interest);
    case 'battles':
      return open.filter((p) => p.offered && p.suitors.length > 0)
        .sort((a, b) => b.suitors.length - a.suitors.length);
    case 'committed':
      return state.prospects.filter((p) => p.committedTo === teamId);
  }
}

/* ---------------------------------------------------------------- actions */

export function trackProspect(state: RecruitingState, id: string, on: boolean): void {
  const p = state.prospects.find((x) => x.id === id);
  if (!p || p.committedTo) return;
  p.tracked = on;
  if (!on) for (const s of state.scouts) if (s.assignedTo === id) s.assignedTo = null;
}

export function assignScout(state: RecruitingState, scoutId: string, prospectId: string | null): boolean {
  const s = state.scouts.find((x) => x.id === scoutId);
  if (!s) return false;
  if (prospectId === null) { s.assignedTo = null; return true; }
  const p = state.prospects.find((x) => x.id === prospectId);
  if (!p || p.committedTo) return false;
  // One scout per prospect: doubling up is not how it works, and it stops the
  // whole staff being parked on one player.
  for (const other of state.scouts) if (other.assignedTo === prospectId) other.assignedTo = null;
  p.tracked = true;
  s.assignedTo = prospectId;
  return true;
}

export interface HireResult {
  ok: boolean;
  reason?: string;
}

/** Hiring costs Coach Points up front; the caller owns the budget. */
export function hireScout(state: RecruitingState, scoutId: string): Scout | null {
  const i = state.market.findIndex((s) => s.id === scoutId);
  if (i < 0) return null;
  if (state.scouts.length >= maxScouts(state.level)) return null;
  const [s] = state.market.splice(i, 1);
  state.scouts.push(s);
  return s;
}

export function releaseScout(state: RecruitingState, scoutId: string): void {
  const i = state.scouts.findIndex((s) => s.id === scoutId);
  if (i < 0) return;
  const [s] = state.scouts.splice(i, 1);
  s.assignedTo = null;
  state.market.push(s);
}

/** A programme can only carry so many scouts, whatever it can afford. */
export function maxScouts(level: Level): number {
  switch (level) {
    case 'hs': return 2;
    case 'd3': return 3;
    case 'd2': return 3;
    case 'd1': return 5;
    case 'semipro': return 3;
    case 'pll': return 4;
  }
}

export function makeOffer(state: RecruitingState, id: string): HireResult {
  const p = state.prospects.find((x) => x.id === id);
  if (!p) return { ok: false, reason: 'No such prospect.' };
  if (p.committedTo) return { ok: false, reason: 'He has already committed somewhere.' };
  if (p.offered) return { ok: false, reason: 'He already has your offer.' };
  if (state.offersLeft <= 0) return { ok: false, reason: 'No offers left in this class.' };
  p.offered = true;
  p.tracked = true;
  state.offersLeft--;
  // An offer from a programme that has been in his gym all season is worth more
  // than one out of nowhere.
  p.interest = clamp(p.interest + 16 + p.scouted * 0.14, 0, 100);
  state.news.push({
    week: state.week,
    kind: 'interest',
    text: `Offer extended to ${p.player.first} ${p.player.last}.`,
  });
  return { ok: true };
}

export function withdrawOffer(state: RecruitingState, id: string): void {
  const p = state.prospects.find((x) => x.id === id);
  if (!p || !p.offered || p.committedTo) return;
  p.offered = false;
  state.offersLeft++;
  p.interest = clamp(p.interest - 25, 0, 100);
}

/* ------------------------------------------------------------- the weekly */

export interface RecruitContext {
  teamId: string;
  teamName: string;
  prestige: number;
  /** From the coaching staff: 0..1. */
  appeal: number;
  wins: number;
  losses: number;
  championships: number;
  /** How many players you already carry at each position. */
  depth: Record<Position, number>;
  /** Programmes that can compete for these players. */
  rivals: { id: string; name: string; recruiting: number }[];
}

/**
 * How much a prospect fancies your programme, before this week's dice. Every
 * term is something the coach can point at and change.
 */
export function interestFactors(
  p: Prospect, ctx: RecruitContext, level: Level,
): { label: string; delta: number }[] {
  const out: { label: string; delta: number }[] = [];
  const par = levelPar(level);

  // A prospect ranked far above your programme is not listening.
  const reach = p.hype - (ctx.prestige * 0.35 + par * 0.65);
  if (reach > 6) out.push({ label: 'Ranked above your programme', delta: -Math.round(reach * 1.6) });
  else if (reach < -8) out.push({ label: 'You are a step up for him', delta: Math.round(Math.min(14, -reach * 0.8)) });

  const record = ctx.wins - ctx.losses;
  if (record >= 3) out.push({ label: 'You have been winning', delta: Math.min(14, record * 2) });
  else if (record <= -3) out.push({ label: 'Losing record', delta: Math.max(-14, record * 2) });

  if (ctx.championships > 0) {
    out.push({ label: `${ctx.championships} championship${ctx.championships === 1 ? '' : 's'}`, delta: Math.min(15, ctx.championships * 5) });
  }
  if (ctx.appeal > 0.05) out.push({ label: 'Programme reputation', delta: Math.round(ctx.appeal * 16) });

  const have = ctx.depth[p.player.pos] ?? 0;
  const room = have <= 2 ? 12 : have <= 4 ? 4 : -10;
  out.push({ label: room > 0 ? 'He would play right away' : 'You are stacked at his position', delta: room });

  if (p.offered) out.push({ label: 'You have offered', delta: 16 });
  if (p.suitors.length >= 2) out.push({ label: `${p.suitors.length} other programmes involved`, delta: -Math.min(18, p.suitors.length * 5) });

  return out;
}

function interestTarget(p: Prospect, ctx: RecruitContext, level: Level): number {
  const base = 30;
  const sum = interestFactors(p, ctx, level).reduce((n, f) => n + f.delta, 0);
  return clamp(base + sum, 0, 100);
}

/**
 * One week of the class. This is where the whole system actually happens:
 * scouts work, rivals notice, interest drifts toward where it should be, and
 * players commit.
 */
export function advanceRecruitingWeek(
  state: RecruitingState, ctx: RecruitContext, seed: string,
): RecruitNews[] {
  if (state.closed) return [];
  const rng = new Rng(`${seed}:${state.cycle}:${state.week}`);
  const before = state.news.length;
  state.week++;
  const par = levelPar(state.level);

  // 0. Tips. A scout does not only watch the player you pointed him at — he
  //    hears about somebody. This is the ONLY way a genuinely hidden prospect
  //    ever gets onto your board, because you cannot scout a player you have
  //    never heard of, and the rankings will not tell you about him.
  for (const s of state.scouts) {
    const chance = 0.12 + s.quality * 0.05;
    if (rng.next() > chance) continue;
    const unseen = state.prospects.filter((p) => !p.committedTo && p.scouted < 12 && !p.tracked);
    if (!unseen.length) continue;
    // A scout with an eye for a sleeper mostly tips genuinely undervalued
    // players. Everyone else is guessing, which is what makes him worth hiring.
    const bias = s.trait === 'gems' ? 0.62 : 0.22;
    const undervalued = unseen.filter((p) => p.player.potential - p.hype >= 8);
    const pool = undervalued.length && rng.next() < bias ? undervalued : unseen;
    const p = rng.pick(pool);
    p.tracked = true;
    p.scouted = clamp(p.scouted + rng.range(8, 16), 0, 100);
    state.news.push({
      week: state.week,
      kind: 'scout',
      text: `${s.name}: "There is a ${p.player.pos} in ${p.hometown} nobody is looking at. `
        + `Ranked #${p.nationalRank}. Send me back."`,
    });
  }

  // 1. Your scouts work their assignment.
  for (const s of state.scouts) {
    if (!s.assignedTo) continue;
    const p = state.prospects.find((x) => x.id === s.assignedTo);
    if (!p || p.committedTo) { s.assignedTo = null; continue; }
    const wasBlind = p.scouted < 50;
    p.scouted = clamp(p.scouted + weeklyProgress(s, p) * rng.range(0.8, 1.2), 0, 100);
    p.noise *= noiseDecay(s);
    p.interest = clamp(p.interest + weeklyRapport(s), 0, 100);

    if (wasBlind && p.scouted >= 50) {
      const est = estimateOf(p, par);
      if (p.gem) {
        state.news.push({
          week: state.week,
          kind: 'gem',
          text: `${s.name}: "${p.player.first} ${p.player.last} is a lot better than #${p.nationalRank}. `
            + `We have him at a ${est.potential} ceiling. Nobody else is on him yet."`,
        });
      } else if (p.overrated) {
        state.news.push({
          week: state.week,
          kind: 'scout',
          text: `${s.name}: "I would stay away from ${p.player.last}. The ranking is ahead of the player."`,
        });
      } else {
        state.news.push({
          week: state.week,
          kind: 'scout',
          text: `${s.name} filed a full report on ${p.player.first} ${p.player.last}.`,
        });
      }
    }
  }

  // 2. Everyone else works too. AI programmes chase the rankings, and the
  //    better-resourced ones do their own scouting — which is how a gem gets
  //    found without you.
  for (const p of state.prospects) {
    if (p.committedTo) continue;
    for (const rival of ctx.rivals) {
      if (p.suitors.some((s) => s.teamId === rival.id)) continue;
      // Interest from a rival is mostly a function of the public ranking.
      const fit = clamp((rival.recruiting - (p.hype - 8)) / 30, 0, 1);
      // A well-resourced programme scouts too and will eventually see through a
      // ranking — but it takes them most of a cycle, which is the window you
      // are racing. Find him early and he is yours; dither and he is not.
      const insight = p.gem
        ? clamp((rival.recruiting - 68) / 240, 0, 0.055) * (0.25 + state.week / 14)
        : 0;
      const chance = fit * 0.06 + insight;
      if (rng.next() < chance) {
        p.suitors.push({ teamId: rival.id, push: rng.range(25, 60) });
        if (p.tracked && p.scouted >= 40) {
          state.news.push({
            week: state.week,
            kind: 'battle',
            text: `${rival.name} have entered on ${p.player.first} ${p.player.last}.`,
          });
        }
      }
    }
    // Word gets around about a player who is suddenly being watched.
    if (p.gem && p.scouted > 60 && rng.next() < 0.05) {
      p.hype = Math.round(clamp(p.hype + rng.range(1, 3), 25, 99));
    }
  }

  // 3. Interest drifts toward where your programme actually stands.
  for (const p of state.prospects) {
    if (p.committedTo) continue;
    const target = interestTarget(p, ctx, state.level);
    p.interest = clamp(p.interest + (target - p.interest) * 0.28 + rng.gauss(0, 2.5), 0, 100);
    for (const s of p.suitors) s.push = clamp(s.push + rng.gauss(1.5, 4), 0, 100);
  }

  // 4. Commitments. The class closes from the top down, so waiting on a
  //    blue-chip costs you the players underneath him.
  // The class closes from the top down, and it closes LATE: a coach has to have
  // time to learn something before the board starts emptying.
  const closingPressure = clamp((state.week - 5) / 11, 0, 1);
  for (const p of state.prospects) {
    if (p.committedTo) continue;
    const rank = 1 - (p.nationalRank / Math.max(1, state.prospects.length));
    const readiness = closingPressure * (0.45 + rank * 0.55);
    if (rng.next() > readiness * 0.35) continue;

    const yours = p.offered ? p.interest : p.interest * 0.25;
    const best = p.suitors.reduce((b, s) => (s.push > b ? s.push : b), 0);
    if (yours >= best && yours > 45) {
      commit(state, p, ctx.teamId, `${p.player.first} ${p.player.last} has committed to ${ctx.teamName}.`, 'signed');
    } else if (best > 55 && p.suitors.length) {
      const winner = [...p.suitors].sort((a, b) => b.push - a.push)[0];
      const name = ctx.rivals.find((r) => r.id === winner.teamId)?.name ?? 'another programme';
      const mine = p.offered || p.tracked;
      commit(state, p, winner.teamId,
        mine ? `${p.player.first} ${p.player.last} has committed to ${name}.` : '', mine ? 'lost' : 'interest');
    }
  }

  return state.news.slice(before);
}

function commit(
  state: RecruitingState, p: Prospect, teamId: string, text: string, kind: RecruitNews['kind'],
): void {
  p.committedTo = teamId;
  if (p.offered && teamId !== null) {
    // An offer to a player who went elsewhere is gone; it is not refunded.
    p.offered = false;
  }
  for (const s of state.scouts) if (s.assignedTo === p.id) s.assignedTo = null;
  if (text) state.news.push({ week: state.week, kind, text });
}

/* ------------------------------------------------------------ signing day */

/**
 * Closes the class and hands back the players who actually signed. Their true
 * ratings become visible for the first time here, which is where a coach finds
 * out whether he was right.
 */
export function signingDay(state: RecruitingState, teamId: string): PlayerData[] {
  state.closed = true;
  const out: PlayerData[] = [];
  for (const p of state.prospects) {
    if (p.committedTo !== teamId) continue;
    out.push({ ...p.player, season: emptyStats(), career: emptyStats(), xp: 0 });
    state.signed.push(p.id);
  }
  return out;
}

/** How the class went, in one line, for the offseason report and the news. */
export function classSummary(state: RecruitingState, teamId: string, par = 70): string {
  const mine = state.prospects.filter((p) => p.committedTo === teamId);
  if (!mine.length) return 'Signed nobody. The class was a write-off.';
  const avg = mine.reduce((n, p) => n + p.player.overall, 0) / mine.length;
  const gems = mine.filter((p) => p.gem).length;
  const busts = mine.filter((p) => p.overrated).length;
  const parts = [`Signed ${mine.length} (avg ${Math.round(avg)} OVR)`];
  if (gems) parts.push(`${gems} ranked well below their ceiling`);
  if (busts) parts.push(`${busts} who did not live up to the ranking`);
  void par;
  return `${parts.join(' · ')}.`;
}

/** National ranking of the class you put together, judged on what signed. */
export function classGrade(state: RecruitingState, teamId: string): { grade: string; score: number } {
  const mine = state.prospects.filter((p) => p.committedTo === teamId);
  if (!mine.length) return { grade: 'F', score: 0 };
  // Judged on hype, because that is what a ranking service can see. Your gems
  // are worth more than this says — which is the point.
  const score = mine.reduce((n, p) => n + p.hype, 0) / mine.length
    + Math.min(10, mine.length * 1.5);
  const grade = score >= 88 ? 'A+' : score >= 82 ? 'A' : score >= 77 ? 'B+'
    : score >= 72 ? 'B' : score >= 66 ? 'C+' : score >= 60 ? 'C' : score >= 54 ? 'D' : 'F';
  return { grade, score: Math.round(score) };
}
