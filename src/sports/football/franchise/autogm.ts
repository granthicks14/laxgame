import { clamp } from '../../../core/math';
import { POSITIONS, depthAt, type Player, type Position } from '../data';
import type { FacilityKey, Franchise, OffseasonStep } from './types';
import { capRoom, facilityCost, marketValue, starterBar, upgradeFacility } from './club';
import { chanceOf, offerTo, reSign, reSignAsk, resolveWave, suggestedOffer, FA_WAVES } from './freeAgency';
import { push } from './news';

/* ---------------------------------------------------------------------------
 * THE FRONT OFFICE, WHEN YOU ARE NOT IN IT
 * ---------------------------------------------------------------------------
 * A coach who skips free agency should not be punished as though his club had
 * sacked everybody who works there. Real clubs re-sign their own, bid on the
 * market and spend the budget whether or not anybody is watching, and a
 * franchise mode that models "the player did not click" as "the organisation
 * did nothing" produces exactly one outcome: a squad that decays by arithmetic
 * against thirty-one rivals who are rebuilt at full strength every year.
 *
 * Measured, that was worth a hundred and fifty wins over twenty seasons.
 *
 * So this is the club's own judgement, applied to whatever the coach left
 * undone — and ONLY to that. The offseason runs in order, so anything you have
 * already walked past is your decision and is never revisited. Skip the whole
 * thing and you get a competent, unremarkable offseason. Do it yourself and you
 * can do much better, which is the point of doing it yourself.
 * ------------------------------------------------------------------------- */

/** What a squad wants at each position, before depth becomes waste. */
export const TARGET_SHAPE: Record<Position, number> = {
  QB: 2, RB: 3, WR: 5, TE: 2, OL: 6, DL: 5, LB: 4, CB: 4, S: 3, K: 1, P: 1,
};

/** How badly the club needs help at a position, 0 to about 1.5. */
export function needFor(roster: Player[], pos: Position): number {
  const at = depthAt(roster, pos);
  const starter = at[0]?.overall ?? 40;
  const thin = clamp((TARGET_SHAPE[pos] - at.length) / TARGET_SHAPE[pos], 0, 1);
  /* AGAINST WHAT AN AVERAGE STARTER AT THIS POSITION ACTUALLY READS, not
   * against a number somebody typed. See `starterBar`. */
  const weak = clamp((starterBar(pos) - starter) / 16, 0, 1);
  return thin * 0.7 + weak * 0.9;
}

/** Every hole, worst first, for the roster screen and for the club itself. */
export const needsOf = (roster: Player[]): { pos: Position; need: number }[] =>
  POSITIONS.map((pos) => ({ pos, need: needFor(roster, pos) }))
    .sort((a, b) => b.need - a.need);

/* ------------------------------------------------------------- re-signings */

/**
 * KEEP THE ONES WORTH KEEPING.
 *
 * Value for money and nothing else: what he is against what he wants, with a
 * thumb on the scale for a young player with room above him. A club with no
 * cap space keeps nobody, which is the cap doing its job.
 */
export function autoReSign(fr: Franchise): Player[] {
  const kept: Player[] = [];
  const expiring = fr.roster.filter((p) => p.contractYears <= 0)
    .sort((a, b) => worth(b) - worth(a));
  for (const p of expiring) {
    const ask = reSignAsk(fr, p);
    if (ask.salary > capRoom(fr) + p.salary) continue;
    /* THE RULE: pay for a player, do not pay for a body. A thirty-two-year-old
     * sixty-four asking four million is what a bad franchise is made of. */
    if (worth(p) < 1 && needFor(fr.roster, p.pos) < 0.5) continue;
    if (reSign(fr, p.id, ask.salary, ask.years)) kept.push(p);
  }
  return kept;
}

const worth = (p: Player): number => {
  const price = Math.max(0.8, marketValue(p));
  const quality = Math.pow(clamp(p.overall - 50, 0, 49) / 49, 1.7) * 10;
  const youth = p.age <= 26 ? 1.25 : p.age <= 29 ? 1 : p.age <= 32 ? 0.7 : 0.45;
  return (quality * youth) / Math.pow(price, 0.55);
};

/* ------------------------------------------------------------- free agency */

/**
 * SHOP, AND SHOP FOR WHAT IS MISSING.
 *
 * One pass per wave: bid the going rate on the best available man at the
 * position the club is shortest of, while there is room for him.
 */
export function autoFreeAgency(fr: Franchise): Player[] {
  const signed: Player[] = [];
  let guard = 0;
  while (fr.faWave > 0 && fr.faWave <= FA_WAVES && guard++ < 10) {
    const open = fr.freeAgents.filter((f) => !f.signedBy);
    const ranked = open
      .map((f) => ({
        f,
        score: f.player.overall + needFor(fr.roster, f.player.pos) * 22
          - suggestedOffer(f, fr) * 1.2,
      }))
      .sort((a, b) => b.score - a.score);

    let committed = 0;
    for (const { f } of ranked.slice(0, 10)) {
      const price = suggestedOffer(f, fr);
      /* LEAVE ROOM FOR A DRAFT CLASS AND A SEASON'S WORTH OF SIGNINGS. A club
       * that spends its last dollar in March cannot replace an injured starter
       * in October. */
      if (committed + price > capRoom(fr) - 8) continue;
      if (fr.roster.length >= 36) break;
      if (needFor(fr.roster, f.player.pos) < 0.25
        && f.player.overall < starterBar(f.player.pos) + 2) continue;
      const res = offerTo(fr, f.id, price, f.askYears);
      if (res.ok) committed += price;
    }
    const { signed: got } = resolveWave(fr);
    signed.push(...got);
  }
  return signed;
}

/** What the club thinks its chances are, so a screen can say so. */
export const readOut = (fr: Franchise, id: string): number => {
  const fa = fr.freeAgents.find((x) => x.id === id);
  return fa ? chanceOf(fr, fa) : 0;
};

/* ------------------------------------------------------------------- staff */

/**
 * REPLACE A COACH WHO IS NO LONGER ONE.
 *
 * Only when the difference is real and the money is there. A club that churns
 * its coordinators every spring is a club whose players never learn anything.
 */
export function autoStaff(fr: Franchise): string[] {
  const notes: string[] = [];
  for (const cand of [...fr.staffMarket].sort((a, b) => b.overall - a.overall)) {
    const current = fr.staff[cand.role];
    if (cand.overall < current.overall + 8) continue;
    if (cand.salary > fr.funds * 0.35) continue;
    fr.funds = Math.round((fr.funds - cand.salary) * 10) / 10;
    fr.staff[cand.role] = { ...cand, tenure: 0 };
    fr.staffMarket = fr.staffMarket.filter((s) => s.id !== cand.id);
    notes.push(`${cand.name} comes in as ${cand.role}, replacing ${current.name}.`);
  }
  return notes;
}

export const staffFit = (overall: number): string =>
  (overall >= 82 ? 'Outstanding' : overall >= 72 ? 'Very good' : overall >= 62 ? 'Solid'
    : overall >= 52 ? 'Adequate' : 'Struggling');

/* -------------------------------------------------------------- facilities */

/**
 * SPEND THE BUDGET ON THE CHEAPEST USEFUL THING, and keep a reserve. Money
 * sitting in an account has never won a football game.
 */
export function autoFacilities(fr: Franchise): FacilityKey[] {
  const built: FacilityKey[] = [];
  const priority: FacilityKey[] = ['training', 'medical', 'scouting', 'practice', 'stadium'];
  let guard = 0;
  while (guard++ < 8) {
    const next = priority
      .map((k) => ({ k, cost: facilityCost(fr, k) }))
      .filter((x): x is { k: FacilityKey; cost: number } => x.cost !== null)
      .sort((a, b) => a.cost - b.cost)[0];
    if (!next || next.cost > fr.funds - 12) break;
    if (!upgradeFacility(fr, next.k)) break;
    built.push(next.k);
  }
  return built;
}

/* ------------------------------------------------------------ all together */

/**
 * FINISH WHATEVER THE COACH DID NOT.
 *
 * `from` is the step he was standing on when he pressed "start the season", so
 * everything before it was his and everything from it on is the club's.
 */
export function autoOffseason(fr: Franchise, from: OffseasonStep): void {
  const order: OffseasonStep[] = ['review', 'staff', 'contracts', 'freeagency', 'draft', 'facilities'];
  const at = order.indexOf(from);
  const doing = (step: OffseasonStep): boolean => at >= 0 && order.indexOf(step) >= at;

  if (doing('staff')) {
    for (const n of autoStaff(fr)) push(fr, 'staff', n);
  }
  if (doing('contracts')) {
    const kept = autoReSign(fr);
    if (kept.length) {
      push(fr, 'signing', `${kept.length} of your own re-signed.`);
    }
  }
  if (doing('freeagency')) {
    const signed = autoFreeAgency(fr);
    for (const p of signed) {
      push(fr, 'signing', `${p.pos} ${p.first} ${p.last} (${p.overall}) signs, `
        + `${p.salary.toFixed(1)}M for ${p.contractYears}.`);
    }
  }
  if (doing('facilities')) {
    const built = autoFacilities(fr);
    for (const k of built) push(fr, 'league', `${k} facility upgraded.`);
  }
}
