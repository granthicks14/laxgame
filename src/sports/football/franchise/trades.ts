import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { POSITIONS, depthAt, type Player, type Position } from '../data';
import { TEAMS, teamOr } from '../nfl';
import { DIFFICULTIES } from '../tuning';
import { MINIMUM_SHAPE, SALARY_CAP, capUsed, marketValue, starterBar } from './club';
import { coachingOf } from './staff';
import { rosterOf } from './world';
import { DRAFT_ROUNDS } from './draft';
import type { Franchise, TradeAsset, TradeProposal, TradeVerdict } from './types';

/* ---------------------------------------------------------------------------
 * THE TRADE DESK
 * ---------------------------------------------------------------------------
 * ONE RULE ABOVE ALL THE OTHERS, and it is the one every franchise game gets
 * wrong: THE OTHER CLUB IS NOT AN IDIOT. It will not give you a twenty-six-year
 * -old eighty-four for a fourth-round pick, it will not take your thirty-four
 * -year-old on twelve million because you would like it to, and it knows the
 * difference between a player it needs and a player it does not.
 *
 * What a club is worth to another club is: how good he is, how old he is, how
 * much is left above him, what he plays, and what he is being paid — a great
 * player on a terrible contract is a smaller asset than a good one on a cheap
 * one, which is the whole reason a cap exists.
 *
 * And they want to win the trade, a little. That premium is what difficulty
 * moves: it is harder to fleece a Legend front office than a Rookie one, and
 * not one rating on either roster has changed.
 * ------------------------------------------------------------------------- */

const POSITION_WORTH: Record<Position, number> = {
  QB: 1.55, RB: 0.78, WR: 1.1, TE: 0.85, OL: 1.1,
  DL: 1.18, LB: 0.95, CB: 1.12, S: 0.9, K: 0.3, P: 0.26,
};

/** Trade value, in the same arbitrary points picks are priced in. */
export function playerValue(p: Player): number {
  const base = Math.pow(clamp(p.overall - 46, 0, 53) / 53, 2.5) * 1400;
  const age = p.age <= 24 ? 1.2 : p.age <= 27 ? 1.05 : p.age <= 29 ? 0.9
    : p.age <= 31 ? 0.66 : p.age <= 33 ? 0.42 : 0.24;
  const upside = 1 + clamp(p.potential - p.overall, 0, 22) / 55 * (p.age <= 26 ? 1 : 0.25);
  /* THE CONTRACT IS PART OF THE PLAYER. A man on half his market value is an
   * asset; the same man on twice it is somebody else's problem. */
  const market = Math.max(0.6, marketValue(p));
  const deal = clamp(1.3 - (p.salary / market) * 0.42, 0.45, 1.35);
  const hurt = p.injury && p.injury.weeks >= 4 ? 0.6 : 1;
  return Math.round(base * POSITION_WORTH[p.pos] * age * upside * deal * hurt);
}

/**
 * WHAT A PICK IS WORTH, on the curve the sport actually uses: the top of the
 * first round is worth more than the whole of the fourth, and the difference
 * between pick forty and pick fifty is almost nothing.
 */
export function pickValue(round: number, slotHint = 16): number {
  const overall = (round - 1) * 32 + slotHint;
  return Math.round(1500 * Math.exp(-overall / 24) + 22);
}

/** Where a club's pick is likely to land, from how good it currently is. */
export function expectedSlot(fr: Franchise, teamId: string): number {
  const s = fr.standings[teamId];
  if (!s) return 16;
  const games = s.wins + s.losses + s.ties;
  if (games < 4) return 16;
  const rate = (s.wins + s.ties * 0.5) / games;
  return clamp(Math.round(32 - rate * 30), 1, 32);
}

export function assetValue(fr: Franchise, a: TradeAsset, ownerId: string): number {
  if (a.kind === 'pick') return pickValue(a.round, expectedSlot(fr, a.fromId));
  const squad = ownerId === fr.teamId ? fr.roster : rosterOf(fr, ownerId, fr.year);
  const p = squad.find((x) => x.id === a.id);
  return p ? playerValue(p) : 0;
}

export function assetLabel(fr: Franchise, a: TradeAsset, ownerId: string): string {
  if (a.kind === 'pick') {
    const who = a.fromId === fr.teamId ? 'own' : `${teamOr(a.fromId).abbr}`;
    const when = a.year === fr.year ? 'This year' : a.year === fr.year + 1 ? 'Next year' : `Year ${a.year}`;
    return `${when} R${a.round} (${who})`;
  }
  const squad = ownerId === fr.teamId ? fr.roster : rosterOf(fr, ownerId, fr.year);
  const p = squad.find((x) => x.id === a.id);
  return p ? `${p.pos} ${p.first} ${p.last} (${p.overall})` : 'unknown';
}

/* ------------------------------------------------------------------ the room */

function needOf(roster: Player[], pos: Position): number {
  const at = depthAt(roster, pos);
  const starter = at[0]?.overall ?? 40;
  return clamp((starterBar(pos) - starter) / 16, 0, 1);
}

/**
 * WHAT THEY THINK OF IT.
 *
 * They price what they get at face value plus what it fills, and what they give
 * at face value plus the premium they want for doing business at all. The
 * margin is the answer; anything at or above zero is a deal.
 */
export function evaluateTrade(fr: Franchise, prop: TradeProposal): TradeVerdict {
  const them = teamOr(prop.withId);
  const theirRoster = rosterOf(fr, prop.withId, fr.year);
  const d = DIFFICULTIES[fr.difficulty];
  /* HOW HARD THEY ARE TO DEAL WITH. This is a coaching difference, not a
   * ratings one: the same players are on both rosters either way. */
  const premium = 0.06 + (1 - d.throwWindow) * 0.22 + d.playRead * 0.12;
  /* AND HOW GOOD YOUR OWN FRONT OFFICE IS AT THIS. */
  const management = coachingOf(fr.staff).management * 0.1;

  let incoming = 0;   // what they would receive
  let outgoing = 0;   // what they would give up
  let salaryIn = 0;
  let salaryOut = 0;

  for (const a of prop.give) {
    let v = assetValue(fr, a, fr.teamId);
    if (a.kind === 'player') {
      const p = fr.roster.find((x) => x.id === a.id);
      if (p) {
        v *= 1 + needOf(theirRoster, p.pos) * 0.35;
        salaryIn += p.salary;
      }
    }
    incoming += v;
  }
  for (const a of prop.get) {
    const v = assetValue(fr, a, prop.withId);
    if (a.kind === 'player') {
      const p = theirRoster.find((x) => x.id === a.id);
      if (p) {
        /* THEY DO NOT WANT TO SELL WHAT THEY NEED. A club whose only decent
         * corner you have asked for wants a great deal more than face value. */
        outgoing += v * (1 + needOf(theirRoster, p.pos) * 0.5);
        salaryOut += p.salary;
        continue;
      }
    }
    outgoing += v;
  }

  const want = outgoing * (1 + premium - management);
  const margin = Math.round(incoming - want);

  if (!prop.give.length || !prop.get.length) {
    return { accepted: false, reason: 'A trade needs something on both sides.', margin: -1 };
  }
  /* THE CAP APPLIES TO BOTH OF YOU. */
  const myRoom = SALARY_CAP - (capUsed(fr.roster) - salaryIn + salaryOut);
  if (myRoom < 0) {
    return {
      accepted: false,
      reason: `You would be ${Math.abs(Math.round(myRoom * 10) / 10)}M over the cap.`,
      margin,
    };
  }
  const theirRoom = SALARY_CAP - (capUsed(theirRoster) - salaryOut + salaryIn);
  if (theirRoom < 0) {
    return { accepted: false, reason: `${them.name} cannot fit that salary.`, margin };
  }
  if (fr.roster.length - prop.give.filter((a) => a.kind === 'player').length
    + prop.get.filter((a) => a.kind === 'player').length > 40) {
    return { accepted: false, reason: 'That would leave you with too many players.', margin };
  }
  const thin = shortAfter(fr, prop);
  if (thin) {
    return { accepted: false, reason: `That would leave you without enough at ${thin}.`, margin };
  }

  if (margin >= 0) {
    return {
      accepted: true,
      reason: margin > outgoing * 0.25
        ? `${them.name} take it without thinking about it.`
        : `${them.name} will do that.`,
      margin,
    };
  }
  const short = Math.abs(margin) / Math.max(1, outgoing);
  return {
    accepted: false,
    reason: short > 0.5 ? `${them.name} are not remotely interested.`
      : short > 0.2 ? `${them.name} want considerably more than that.`
        : `${them.name} are close, but they want a bit more.`,
    margin,
  };
}

/**
 * WOULD THIS LEAVE YOU UNABLE TO LINE UP?
 *
 * Counted with BOTH sides of the deal, which is the point: the first version
 * refused to let you move a lineman at all when you carried the minimum, even
 * in a trade that sent one straight back. Returns the position you would be
 * short at, or null.
 */
export function shortAfter(fr: Franchise, prop: TradeProposal): Position | null {
  const theirs = rosterOf(fr, prop.withId, fr.year);
  const counts = new Map<Position, number>();
  for (const p of fr.roster) counts.set(p.pos, (counts.get(p.pos) ?? 0) + 1);
  for (const a of prop.give) {
    if (a.kind !== 'player') continue;
    const p = fr.roster.find((x) => x.id === a.id);
    if (p) counts.set(p.pos, (counts.get(p.pos) ?? 0) - 1);
  }
  for (const a of prop.get) {
    if (a.kind !== 'player') continue;
    const p = theirs.find((x) => x.id === a.id);
    if (p) counts.set(p.pos, (counts.get(p.pos) ?? 0) + 1);
  }
  for (const [pos, need] of Object.entries(MINIMUM_SHAPE) as [Position, number][]) {
    if ((counts.get(pos) ?? 0) < need) return pos;
  }
  return null;
}

/** Do it. Assumes it has already been evaluated and accepted. */
export function executeTrade(fr: Franchise, prop: TradeProposal): boolean {
  const verdict = evaluateTrade(fr, prop);
  if (!verdict.accepted) return false;
  const theirRoster = rosterOf(fr, prop.withId, fr.year);
  const edit = fr.rosterEdits[prop.withId] ?? { out: [], in: [] };

  for (const a of prop.give) {
    if (a.kind === 'player') {
      const i = fr.roster.findIndex((x) => x.id === a.id);
      if (i < 0) return false;
      const [p] = fr.roster.splice(i, 1);
      edit.in.push(p);
    } else {
      const i = fr.picks.findIndex((x) =>
        x.year === a.year && x.round === a.round && x.fromId === a.fromId
        && x.ownerId === fr.teamId);
      if (i < 0) return false;
      fr.picks[i] = { ...fr.picks[i], ownerId: prop.withId };
    }
  }
  for (const a of prop.get) {
    if (a.kind === 'player') {
      const p = theirRoster.find((x) => x.id === a.id);
      if (!p) return false;
      edit.out.push(p.id);
      fr.roster.push({ ...p, morale: clamp(p.morale - 4, 5, 100) });
    } else {
      const existing = fr.picks.findIndex((x) =>
        x.year === a.year && x.round === a.round && x.fromId === a.fromId);
      if (existing >= 0) fr.picks[existing] = { ...fr.picks[existing], ownerId: fr.teamId };
      else fr.picks.push({ year: a.year, round: a.round, fromId: a.fromId, ownerId: fr.teamId });
    }
  }
  fr.rosterEdits[prop.withId] = edit;
  return true;
}

/* ------------------------------------------------------------------ browsing */

/** Who a club would listen about: everybody but the two or three it will not move. */
export function tradeBlock(fr: Franchise, teamId: string): Player[] {
  const squad = rosterOf(fr, teamId, fr.year);
  const rng = new Rng(`nfl:block:${fr.seed}:${fr.year}:${teamId}`);
  const byValue = [...squad].sort((a, b) => playerValue(b) - playerValue(a));
  const untouchable = new Set(byValue.slice(0, 2).map((p) => p.id));
  return byValue.filter((p) => !untouchable.has(p.id) || rng.bool(0.08));
}

/** The picks a club still holds, for the other side of a deal. */
export function theirPicks(fr: Franchise, teamId: string): TradeAsset[] {
  const out: TradeAsset[] = [];
  for (const year of [fr.year, fr.year + 1]) {
    for (let round = 1; round <= DRAFT_ROUNDS; round++) {
      const moved = fr.picks.find((p) => p.year === year && p.round === round && p.fromId === teamId);
      if (moved && moved.ownerId !== teamId) continue;
      out.push({ kind: 'pick', year, round, fromId: teamId });
    }
  }
  return out;
}

/** A one-line summary of a club, for the list of who to call. */
export function clubLine(fr: Franchise, teamId: string): string {
  const squad = rosterOf(fr, teamId, fr.year);
  const s = fr.standings[teamId];
  const record = s ? `${s.wins}-${s.losses}` : '0-0';
  const holes = POSITIONS.filter((pos) => needOf(squad, pos) > 0.5);
  return holes.length
    ? `${record} · short at ${holes.slice(0, 3).join(', ')}`
    : `${record} · no obvious holes`;
}

export const everyOtherClub = (fr: Franchise): string[] =>
  TEAMS.filter((t) => t.id !== fr.teamId).map((t) => t.id);
