import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { PERSONALITY, POSITIONS, depthAt, makePlayer, type Player, type Position } from '../data';
import { TEAMS, teamOr } from '../nfl';
import { MIN_SALARY, capRoom, marketValue, marketYears, starterBar } from './club';
import { coachingOf } from './staff';
import { driftOf } from './world';
import type { FreeAgent, Franchise } from './types';

/* ---------------------------------------------------------------------------
 * FREE AGENCY
 * ---------------------------------------------------------------------------
 * Every spring, a market — and the two things that make a market a market are
 * both here: THERE IS COMPETITION, and PEOPLE WANT DIFFERENT THINGS.
 *
 * A player has a price and a number of years he wants, and those are the easy
 * part. What actually decides it is whether he wants to come: a club that wins,
 * a club that pays, a club with a training centre and a full stadium and a
 * coach with a name. A bad club can still sign anybody — it just has to pay
 * over the odds for him, which is the cost of being a bad club and is the
 * correct cost.
 *
 * IT RUNS IN THREE WAVES. The best men go in the first one and they go fast; if
 * you are still deciding in wave three you are shopping in what is left, which
 * is what being late in free agency is.
 *
 * Every free agent in this game is generated. Nobody in it has ever existed.
 * ------------------------------------------------------------------------- */

export const FA_WAVES = 3;

/** How attractive this club is to somebody who has a choice, 0-1. */
export function clubAppeal(fr: Franchise): number {
  const team = teamOr(fr.teamId);
  const prestige = clamp((team.prestige + driftOf(fr, fr.teamId) / 8) / 5, 0, 1.2);
  const recent = fr.history.slice(-3);
  const form = recent.length
    ? recent.reduce((s, h) => s + h.wins / Math.max(1, h.wins + h.losses), 0) / recent.length
    : 0.5;
  const rings = clamp(fr.championships * 0.06, 0, 0.25);
  const buildings = (fr.facilities.training + fr.facilities.practice + fr.facilities.medical) / 18;
  return clamp(
    prestige * 0.3 + form * 0.32 + rings + buildings * 0.2 + (fr.fanSupport / 100) * 0.18,
    0.05, 1,
  );
}

/* ------------------------------------------------------------------ the pool */

/**
 * WHO IS ON THE MARKET.
 *
 * Generated from the seed and the year, because the other thirty-one rosters
 * are derived and cannot lose a man without being stored. What that means in
 * practice is the right thing anyway: every spring a few dozen grown
 * professionals come loose from around the league, and you have no more idea
 * which ones than anybody else does.
 *
 * Your own men who reached the end of their deals and were not re-signed are
 * added to it, at which point somebody else may very well take them.
 */
export function generateFreeAgents(fr: Franchise, released: Player[]): FreeAgent[] {
  const rng = new Rng(`nfl:fa:${fr.seed}:${fr.year}`);
  const appeal = clubAppeal(fr);
  const need = needMap(fr.roster);
  const out: FreeAgent[] = [];

  const add = (player: Player, wasMine: boolean): void => {
    const ask = Math.round(marketValue(player) * askMultiplier(player, rng) * 10) / 10;
    const info = PERSONALITY[player.personality];
    out.push({
      id: player.id,
      player,
      askSalary: Math.max(MIN_SALARY, ask),
      askYears: marketYears(player),
      interest: Math.round(clamp(
        30 + appeal * 45 + (need[player.pos] ?? 0) * 12
        + (wasMine ? 16 * info.loyalty : 0)
        + rng.range(-10, 10), 3, 97,
      )),
      /* HOW MANY OTHER CLUBS ARE IN IT. The better he is, the more of them, and
       * that is what stops the market from being a shop with prices on. */
      suitors: clamp(Math.round((player.overall - starterBar(player.pos) + 8) / 4.5
        + rng.range(0, 2.2)), 0, 7),
      offer: null,
      signedBy: null,
      outcome: null,
    });
  };

  /* Around thirty men a spring, weighted toward what a league actually lets go:
   * a lot of squad players, a handful of starters, and one or two who should
   * never have reached the market. */
  const count = 26 + rng.int(0, 8);
  for (let i = 0; i < count; i++) {
    const tier = rng.next();
    const par = tier > 0.94 ? rng.range(70, 78)
      : tier > 0.78 ? rng.range(62, 70)
        : tier > 0.45 ? rng.range(54, 62)
          : rng.range(45, 54);
    const pos = POSITIONS[rng.int(0, POSITIONS.length - 1)];
    const age = rng.int(24, 33);
    const player = makePlayer(`nfl:fa:${fr.seed}:${fr.year}:${i}`, { pos, par, age, years: age - 21 });
    add(player, false);
  }
  for (const p of released) add(p, true);

  return out.sort((a, b) => b.player.overall - a.player.overall);
}

/** What he is asking over the odds, because nobody asks for exactly market. */
const askMultiplier = (p: Player, rng: Rng): number =>
  PERSONALITY[p.personality].ask * rng.range(0.94, 1.22);

function needMap(roster: Player[]): Record<Position, number> {
  const out = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const at = depthAt(roster, pos);
    out[pos] = clamp((starterBar(pos) - (at[0]?.overall ?? 40)) / 16
      + (at.length < 2 ? 0.5 : 0), 0, 1.4);
  }
  return out;
}

/* ------------------------------------------------------------------- offers */

/** Put a number on the table. Replaces any earlier offer to the same man. */
export function offerTo(
  fr: Franchise, id: string, salary: number, years: number,
): { ok: boolean; why: string } {
  const fa = fr.freeAgents.find((x) => x.id === id);
  if (!fa) return { ok: false, why: 'He is not on the market.' };
  if (fa.signedBy) return { ok: false, why: 'He has already signed somewhere.' };
  const clean = Math.round(clamp(salary, MIN_SALARY, 60) * 10) / 10;
  const yrs = clamp(Math.round(years), 1, 5);
  const committed = fr.freeAgents
    .filter((x) => x.offer && !x.signedBy && x.id !== id)
    .reduce((s, x) => s + (x.offer?.salary ?? 0), 0);
  if (clean + committed > capRoom(fr)) {
    return { ok: false, why: 'You have not got the cap room for that and everything else you have offered.' };
  }
  fa.offer = { salary: clean, years: yrs };
  return { ok: true, why: `Offered ${clean.toFixed(1)}M a year for ${yrs}.` };
}

export function withdrawOffer(fr: Franchise, id: string): void {
  const fa = fr.freeAgents.find((x) => x.id === id);
  if (fa) fa.offer = null;
}

/**
 * WHAT IT WOULD PROBABLY TAKE, so a screen can suggest a number rather than
 * making somebody guess into a black box.
 *
 * A CLUB NOBODY WANTS TO JOIN HAS TO PAY OVER THE ODDS, and that is the correct
 * and interesting answer: a bad franchise is not locked out of the market, it
 * is charged for being bad. Without the premium the arithmetic quietly made
 * every rebuilding club unable to sign anybody at all, which is a rebuild that
 * cannot be rebuilt.
 */
export function suggestedOffer(fa: FreeAgent, fr?: Franchise): number {
  const underdog = fr ? Math.max(0, 0.62 - clubAppeal(fr)) * 0.75 : 0;
  return Math.round(fa.askSalary * (1 + fa.suitors * 0.04 + underdog) * 10) / 10;
}

/**
 * HOW LIKELY HE IS TO TAKE IT, said plainly on the card rather than hidden.
 *
 * A negotiation the player cannot read is a slot machine, and a slot machine
 * with a salary cap attached to it is not a decision.
 */
export function chanceOf(fr: Franchise, fa: FreeAgent): number {
  if (!fa.offer) return 0;
  const info = PERSONALITY[fa.player.personality];
  const money = fa.offer.salary / Math.max(0.5, fa.askSalary) - 1;
  const term = fa.offer.years >= fa.askYears ? 0.06 : -0.09 * (fa.askYears - fa.offer.years);
  const management = coachingOf(fr.staff).management * 0.12;
  return clamp(
    0.2 + money * 1.9 / info.ask + (fa.interest - 50) / 150 + term
    + management - fa.suitors * 0.04,
    0.02, 0.97,
  );
}

/**
 * THE WAVE CLOSES.
 *
 * Everybody with an offer on the table decides. Everybody without one either
 * signs elsewhere or rolls into the next wave — and the good ones go first,
 * which is what makes being early worth something.
 */
export function resolveWave(fr: Franchise): { signed: Player[]; lost: FreeAgent[] } {
  const rng = new Rng(`nfl:fa:${fr.seed}:${fr.year}:${fr.faWave}`);
  const signed: Player[] = [];
  const lost: FreeAgent[] = [];

  for (const fa of fr.freeAgents) {
    if (fa.signedBy) continue;

    if (fa.offer && rng.next() < chanceOf(fr, fa)) {
      fa.signedBy = fr.teamId;
      fa.outcome = `Signed with you — ${fa.offer.salary.toFixed(1)}M for ${fa.offer.years}.`;
      const player: Player = {
        ...fa.player,
        salary: fa.offer.salary,
        contractYears: fa.offer.years,
        morale: clamp(fa.player.morale + 8, 5, 100),
      };
      fr.roster.push(player);
      signed.push(player);
      continue;
    }

    /* SOMEBODY ELSE TAKES HIM. How likely depends on how many clubs were in it
     * and how good he is — a fifty-eight overall punter will still be there in
     * wave three, and a seventy-nine overall corner will not. */
    const gone = clamp(0.12 + fa.suitors * 0.13
      + (fa.player.overall - starterBar(fa.player.pos)) / 120, 0.05, 0.9);
    if (rng.next() < gone) {
      const other = elsewhere(fr, rng);
      fa.signedBy = other;
      fa.outcome = fa.offer
        ? `Turned you down and signed with ${teamOr(other).name}.`
        : `Signed with ${teamOr(other).name}.`;
      lost.push(fa);
      /* AND HE GOES SOMEWHERE REAL. A club that signs a free agent is a club
       * that got better, and next season it is. */
      const edit = fr.rosterEdits[other] ?? { out: [], in: [] };
      edit.in.push({ ...fa.player, contractYears: fa.askYears, salary: fa.askSalary });
      fr.rosterEdits[other] = edit;
      continue;
    }
    fa.offer = null;
  }
  fr.faWave += 1;
  return { signed, lost };
}

function elsewhere(fr: Franchise, rng: Rng): string {
  const pool = TEAMS.filter((t) => t.id !== fr.teamId);
  /* Winning clubs sign more, which is how the rich stay rich and is also why
   * the third year of a rebuild is the hard one. */
  const weights = pool.map((t) => 1 + t.prestige * 0.4 + (fr.prestigeDrift[t.id] ?? 0) / 20);
  let total = 0;
  for (const w of weights) total += w;
  let t = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    t -= weights[i];
    if (t <= 0) return pool[i].id;
  }
  return pool[pool.length - 1].id;
}

/* ------------------------------------------------------- your own contracts */

/** What one of your own would sign for again. Loyalty and a good coach both help. */
export function reSignAsk(fr: Franchise, p: Player): { salary: number; years: number } {
  const info = PERSONALITY[p.personality];
  const management = coachingOf(fr.staff).management;
  const mood = clamp((p.morale - 55) / 200, -0.12, 0.1);
  const discount = clamp(info.loyalty * 0.06 + management * 0.1 + mood, 0, 0.3);
  return {
    salary: Math.max(MIN_SALARY, Math.round(marketValue(p) * info.ask * (1 - discount) * 10) / 10),
    years: marketYears(p),
  };
}

export function reSign(fr: Franchise, id: string, salary: number, years: number): boolean {
  const p = fr.roster.find((x) => x.id === id);
  if (!p) return false;
  const ask = reSignAsk(fr, p);
  if (salary + 0.001 < ask.salary) return false;
  if (salary > capRoom(fr) + p.salary) return false;
  p.salary = Math.round(salary * 10) / 10;
  p.contractYears = clamp(Math.round(years), 1, 5);
  p.morale = Math.round(clamp(p.morale + 6, 5, 100));
  return true;
}

/** Let him go. He joins the market, where somebody else may well take him. */
export function release(fr: Franchise, id: string): Player | null {
  const i = fr.roster.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [p] = fr.roster.splice(i, 1);
  return p;
}
