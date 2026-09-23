import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import {
  ATTR_LABEL, COLLEGES, POSITIONS, POSITION_WEIGHTS, depthAt, makePlayer,
  type AttrKey, type Player, type Position,
} from '../data';
import { TEAMS, teamOr } from '../nfl';
import { DIFFICULTIES } from '../tuning';
import { MIN_SALARY, starterBar } from './club';
import { rosterOf } from './world';
import { sortStandings, winPct } from './schedule';
import type { DraftPick, Franchise, Prospect, Standing } from './types';

/* ---------------------------------------------------------------------------
 * THE DRAFT
 * ---------------------------------------------------------------------------
 * Four rounds, a hundred and forty young men, and NOT ONE OF THEM IS A REAL
 * PERSON. Every name, school, age and rating in this file is generated.
 *
 * THE THING THAT MAKES A DRAFT A GAME rather than a shop is that you do not
 * know what you are buying. A prospect has a true rating and a true ceiling
 * which the franchise never shows you; what you see is a REPORT, and the report
 * is wrong by an amount that shrinks as you spend scouting on him. Scout
 * nobody and you are drafting on projected round and a hunch. Scout six men
 * properly and you know those six and nothing about the rest — which is exactly
 * the trade every scouting department actually makes.
 *
 * The report is never perfect, even fully scouted. A game where enough clicking
 * removes all doubt has turned its draft back into a shop.
 * ------------------------------------------------------------------------- */

export const DRAFT_ROUNDS = 4;
export const CLASS_SIZE = 140;

/* ---------------------------------------------------------------- the class */

/** How good the board is at the top, and how fast it falls away. */
const parAt = (index: number): number => 72 - Math.pow(index / CLASS_SIZE, 0.62) * 30;

export function generateClass(seed: number, year: number): Prospect[] {
  const rng = new Rng(`nfl:draft:${seed}:${year}`);
  const out: Prospect[] = [];

  /* EVERY POSITION IS ON THE BOARD, ALWAYS. A weighted draw over eleven
   * positions can easily return no quarterback at all, and a franchise that
   * cannot draft a quarterback plays a street free agent at quarterback for
   * ever, because next year's board is drawn the same way. */
  const slots: Position[] = [];
  for (const pos of POSITIONS) slots.push(pos, pos);
  const spread: Record<Position, number> = {
    QB: 5, RB: 10, WR: 22, TE: 9, OL: 24, DL: 22, LB: 17, CB: 18, S: 12, K: 3, P: 3,
  };
  for (const pos of POSITIONS) {
    for (let i = 0; i < spread[pos]; i++) slots.push(pos);
  }
  while (slots.length < CLASS_SIZE) slots.push(POSITIONS[rng.int(0, POSITIONS.length - 1)]);
  // Shuffle, so the board is not sorted by position.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  for (let i = 0; i < CLASS_SIZE; i++) {
    const pos = slots[i];
    const age = rng.int(21, 23);
    const player = makePlayer(`nfl:pro:${seed}:${year}:${i}`, {
      pos,
      par: parAt(i) + rng.range(-4, 4),
      years: 0,
      age,
    });
    /* HEADROOM IS THE POINT OF A ROOKIE. A twenty-one-year-old is bought for
     * what he becomes, and the top of the board has a great deal more of it —
     * which is also what makes the top of the board a gamble rather than a
     * purchase. */
    const headroom = Math.round(rng.range(2, 20) * (1 - i / CLASS_SIZE) + rng.range(0, 7));
    player.potential = clamp(Math.max(player.potential, player.overall + headroom), player.overall, 99);
    player.college = COLLEGES[rng.int(0, COLLEGES.length - 1)];
    player.contractYears = 4;
    player.salary = rookieSalary(i);
    player.morale = rng.int(65, 88);

    const p: Prospect = {
      id: player.id,
      first: player.first,
      last: player.last,
      pos,
      college: player.college,
      age,
      player,
      scouted: 0,
      grade: 0,
      floor: 0,
      ceiling: 0,
      strengths: strengthsOf(player, true),
      weaknesses: strengthsOf(player, false),
      projectedRound: clamp(Math.floor(i / 32) + 1, 1, DRAFT_ROUNDS + 1),
      takenBy: null,
      takenAt: null,
    };
    writeReport(p, 0, 0);
    out.push(p);
  }

  /* WHERE THE ROOM EXPECTS HIM TO GO is decided by what he is WORTH, not by
   * the order he was generated in. A punter reading eighty-two is not a first-
   * round pick in any room anybody has ever sat in, and the first version of
   * this board projected three of them there. */
  const ranked = [...out].sort((a, b) => trueValue(b) - trueValue(a));
  ranked.forEach((p, rank) => {
    p.projectedRound = clamp(Math.floor(rank / 32) + 1, 1, DRAFT_ROUNDS + 1);
  });
  return out;
}

/** What a prospect is actually worth to a room that could see everything. */
const trueValue = (p: Prospect): number =>
  p.player.overall * 0.72 + p.player.potential * 0.28 + POSITION_VALUE[p.pos];

/**
 * THE ORDER A BOARD IS READ IN: the report, not the truth, and what the
 * position is worth. Sorting on the grade alone puts every kicker and punter in
 * the class near the top — a specialist's overall is four-fifths of one
 * attribute — which is a board that is lying about who the good players are.
 */
export const boardValue = (p: Prospect): number =>
  p.grade * 0.72 + p.ceiling * 0.28 + POSITION_VALUE[p.pos];

/** A rookie deal, which is the cheapest labour in the sport and the point of a draft. */
export const rookieSalary = (index: number): number =>
  Math.round(Math.max(MIN_SALARY, 7.5 - Math.pow(index / CLASS_SIZE, 0.5) * 6.6) * 10) / 10;

/** The two or three things a scout would actually write down. */
function strengthsOf(p: Player, best: boolean): string[] {
  const weights = POSITION_WEIGHTS[p.pos];
  const keys = Object.keys(weights) as AttrKey[];
  const scored = keys
    .map((k) => ({ k, v: p.attrs[k] }))
    .sort((a, b) => (best ? b.v - a.v : a.v - b.v));
  return scored.slice(0, 2)
    .filter((x) => (best ? x.v >= 62 : x.v <= 66))
    .map((x) => ATTR_LABEL[x.k]);
}

/* -------------------------------------------------------------- the report */

/**
 * WHAT THE BOARD SAYS HE IS.
 *
 * The error is deterministic from his id and the level of work done on him, so
 * a report does not change every time a screen repaints — which would be both a
 * bug and an invitation to reroll it by leaving the page.
 */
export function writeReport(p: Prospect, scouted: number, facility: number): void {
  const spread = Math.max(1.6, 11 - scouted * 2.9 - facility * 1.1);
  const rng = new Rng(`scout:${p.id}:${scouted}`);
  const err = rng.gauss(0, spread / 2.4);
  p.scouted = scouted;
  p.grade = Math.round(clamp(p.player.overall + err, 28, 99));
  p.floor = Math.round(clamp(p.grade - spread * 0.7, 25, 99));
  /* THE CEILING IS A GUESS AT A GUESS, so it is the widest number on the card
   * and it stays wide even when he is fully scouted. */
  p.ceiling = Math.round(clamp(
    Math.max(p.grade + 2, p.player.potential + rng.gauss(0, spread / 1.6)), p.grade + 1, 99,
  ));
}

export const SCOUT_COST = 1;

/** Put another week's work into a man. */
export function scout(fr: Franchise, prospectId: string): boolean {
  const p = fr.draftClass.find((x) => x.id === prospectId);
  if (!p || p.scouted >= 3 || fr.scoutPoints < SCOUT_COST) return false;
  fr.scoutPoints -= SCOUT_COST;
  writeReport(p, p.scouted + 1, fr.facilities.scouting);
  return true;
}

export const scoutLabel = (n: number): string =>
  ['Unseen', 'Watched', 'Studied', 'Known inside out'][clamp(n, 0, 3)];

/* ------------------------------------------------------------------- order */

/**
 * THE ORDER, and it is the sport's own: worst club picks first, the champion
 * picks last, and everybody who reached January picks behind everybody who did
 * not. Losing is worth something, which is the only mercy a bad season has.
 */
export function draftOrder(fr: Franchise): string[] {
  const table = Object.values(fr.standings);
  const playoffRank = new Map<string, number>();
  for (const f of fr.playoffs) {
    if (!f.played) continue;
    const winner = f.homeScore >= f.awayScore ? f.homeId : f.awayId;
    const loser = f.homeScore >= f.awayScore ? f.awayId : f.homeId;
    playoffRank.set(loser, (playoffRank.get(loser) ?? 0) + 1);
    playoffRank.set(winner, (playoffRank.get(winner) ?? 0) + 2);
  }
  const sorted = [...table].sort((a: Standing, b: Standing) => {
    const pa = playoffRank.get(a.teamId) ?? -1;
    const pb = playoffRank.get(b.teamId) ?? -1;
    if (pa !== pb) return pa - pb;
    return winPct(a) - winPct(b)
      || (a.pointsFor - a.pointsAgainst) - (b.pointsFor - b.pointsAgainst)
      || a.teamId.localeCompare(b.teamId);
  });
  const ids = sorted.map((s) => s.teamId);
  // A franchise started mid-stream may have an empty table; fall back to prestige.
  if (ids.length < TEAMS.length) {
    for (const t of [...TEAMS].sort((a, b) => a.prestige - b.prestige)) {
      if (!ids.includes(t.id)) ids.push(t.id);
    }
  }
  return ids;
}

/** Who holds a given slot, once trades are taken into account. */
export function pickOwner(fr: Franchise, year: number, round: number, fromId: string): string {
  const moved = fr.picks.find((p) => p.year === year && p.round === round && p.fromId === fromId);
  return moved?.ownerId ?? fromId;
}

export interface Slot {
  overall: number;
  round: number;
  fromId: string;
  ownerId: string;
}

/** Every pick in the draft, in order. */
export function draftSlots(fr: Franchise, order: string[]): Slot[] {
  const out: Slot[] = [];
  let n = 1;
  for (let round = 1; round <= DRAFT_ROUNDS; round++) {
    for (const fromId of order) {
      out.push({ overall: n++, round, fromId, ownerId: pickOwner(fr, fr.year, round, fromId) });
    }
  }
  return out;
}

/** The picks you are holding, for the trade desk and the draft screen. */
export function myPicks(fr: Franchise, year = fr.year): DraftPick[] {
  return fr.picks.filter((p) => p.ownerId === fr.teamId && p.year === year)
    .sort((a, b) => a.round - b.round);
}

/* -------------------------------------------------------------- the CPU room */

/**
 * WHAT A CLUB THINKS OF A PROSPECT.
 *
 * Its own noisy read of him, plus what it is short of — and the need term is
 * deliberately modest. A room that drafts purely for need takes a bad
 * quarterback over a great tackle every time, which is both wrong and the most
 * common thing a franchise game gets wrong.
 */
const POSITION_VALUE: Record<Position, number> = {
  QB: 14, RB: -6, WR: 3, TE: -3, OL: 4, DL: 5, LB: -2, CB: 4, S: -2, K: -20, P: -22,
};

function cpuValue(p: Prospect, need: number, rng: Rng, blur = 4.5): number {
  const read = p.player.overall * 0.72 + p.player.potential * 0.28 + rng.gauss(0, blur);
  /* WHAT THE POSITION IS WORTH, and this is not decoration. A specialist's
   * overall is four-fifths of one attribute, so the best kicker in a class
   * reads higher than the best tackle — and a board that sorts on the number
   * takes a kicker first overall, twice, which is exactly what it did. */
  return read + need * 9 + POSITION_VALUE[p.pos];
}

/** What the board would take next, for a coach who is not in the room. */
export function boardChoice(fr: Franchise): Prospect | null {
  const rng = new Rng(`nfl:board:${fr.seed}:${fr.year}:${fr.draftCursor}`);
  return bestAvailable(fr, fr.teamId, rng, new Map());
}

function needsOf(roster: Player[]): Record<Position, number> {
  const out = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const at = depthAt(roster, pos);
    const starter = at[0]?.overall ?? 40;
    const want = pos === 'OL' ? 5 : pos === 'WR' ? 4 : pos === 'DL' || pos === 'CB' ? 4
      : pos === 'K' || pos === 'P' ? 1 : 2;
    const thin = clamp((want - at.length) / want, 0, 1);
    const weak = clamp((starterBar(pos) - starter) / 17, 0, 1);
    out[pos] = clamp(thin * 0.6 + weak * 0.8, 0, 1.4);
  }
  return out;
}

export interface DraftPickResult {
  slot: Slot;
  prospect: Prospect;
}

/** Whose turn it is, or null when the draft is over. */
export function onTheClock(fr: Franchise, slots: Slot[]): Slot | null {
  return slots[fr.draftCursor - 1] ?? null;
}

/**
 * RUN THE ROOM UNTIL IT IS YOUR TURN.
 *
 * The cursor is stored on the franchise rather than recomputed, because a draft
 * that works out where it is by counting what has been taken cannot survive a
 * traded pick, a save in the middle of round two, or a class where two men have
 * the same grade.
 */
export function runDraft(fr: Franchise, slots: Slot[]): DraftPickResult[] {
  const rng = new Rng(`nfl:room:${fr.seed}:${fr.year}`);
  const made: DraftPickResult[] = [];
  const needs = new Map<string, Record<Position, number>>();

  while (fr.draftCursor <= slots.length) {
    const slot = slots[fr.draftCursor - 1];
    if (slot.ownerId === fr.teamId) break;
    const best = bestAvailable(fr, slot.ownerId, rng, needs);
    if (!best) { fr.draftCursor += 1; continue; }
    made.push(take(slot, best));
    fr.draftCursor += 1;
  }
  return made;
}

/** You are on the clock and this is the man. */
export function makePick(fr: Franchise, slot: Slot, prospectId: string): Prospect | null {
  const p = fr.draftClass.find((x) => x.id === prospectId && !x.takenBy);
  if (!p) return null;
  take(slot, p);
  fr.draftCursor += 1;
  const player = { ...p.player, salary: rookieSalary(slot.overall - 1), contractYears: 4 };
  fr.roster.push(player);
  fr.lastDraft.push({
    round: slot.round,
    pick: slot.overall,
    name: `${p.first} ${p.last}`,
    pos: p.pos,
    grade: p.grade,
  });
  return p;
}

/** The board's own choice, for a coach who would rather not be in the room. */
export function autoPick(fr: Franchise, slot: Slot): Prospect | null {
  const rng = new Rng(`nfl:auto:${fr.seed}:${fr.year}:${slot.overall}`);
  const best = bestAvailable(fr, fr.teamId, rng, new Map());
  return best ? makePick(fr, slot, best.id) : null;
}

function bestAvailable(
  fr: Franchise, teamId: string, rng: Rng, cache: Map<string, Record<Position, number>>,
): Prospect | null {
  let need = cache.get(teamId);
  if (!need) {
    const roster = teamId === fr.teamId ? fr.roster : rosterOf(fr, teamId, Math.max(1, fr.year - 1));
    need = needsOf(roster);
    cache.set(teamId, need);
  }
  /* HOW GOOD THE OTHER ROOMS ARE IS A DIFFICULTY SETTING, and it is a fair one:
   * a Rookie league's scouts misread a prospect by six points and a Legend
   * league's by two, so the man who falls to you at the end of round one is a
   * very different man. Not one rating on any roster has changed. */
  const d = DIFFICULTIES[fr.difficulty];
  const blur = 7.2 - d.playRead * 5.4;

  let best: Prospect | null = null;
  let bestScore = -Infinity;
  for (const p of fr.draftClass) {
    if (p.takenBy) continue;
    const score = cpuValue(p, need[p.pos] ?? 0, rng, blur);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (best) need[best.pos] = Math.max(0, (need[best.pos] ?? 0) - 0.9);
  return best;
}

function take(slot: Slot, p: Prospect): DraftPickResult {
  p.takenBy = slot.ownerId;
  p.takenAt = slot.overall;
  return { slot, prospect: p };
}

/** True once every slot has been used. */
export const draftDone = (fr: Franchise, slots: Slot[]): boolean =>
  fr.draftCursor > slots.length;

/** How a prospect reads on a card, in one line. */
export const prospectLine = (p: Prospect): string =>
  `${p.pos} · ${p.college} · age ${p.age} · ${scoutLabel(p.scouted)}`;

export const roundLabel = (n: number): string =>
  (n > DRAFT_ROUNDS ? 'Undrafted' : `Round ${n}`);

export const teamNameOf = (id: string): string => `${teamOr(id).city} ${teamOr(id).name}`;

export { sortStandings };
