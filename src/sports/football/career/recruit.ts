import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { POSITIONS, makePlayer, type Player, type Position } from '../data';
import { LEVELS, shapeFor, teamPar } from '../levels';
import { worldTeam } from '../world';
import { perksOf } from './coach';
import type { FootballCareer, Recruit } from './types';

/* ---------------------------------------------------------------------------
 * RECRUITING
 * ---------------------------------------------------------------------------
 * Where next year's team comes from, and the part of a football career that most
 * rewards paying attention.
 *
 * THE RULE THIS FILE EXISTS TO GET RIGHT, and it is stated in the brief for a
 * reason because almost every game gets it wrong: A PLAYER IS NOT UNINTERESTED
 * JUST BECAUSE YOU ALREADY HAVE SOMEBODY AT HIS POSITION. Depth at a position
 * makes a recruit slightly warier of the playing time, and that is all — it is
 * one small term among six. A quarterback who would walk into your programme
 * does not refuse to talk to you because you happen to have a senior starter,
 * and a system that says he does turns recruiting into a filling-in-the-gaps
 * exercise instead of a competition for players.
 *
 * WHAT ACTUALLY DECIDES IT: how big your programme is, how good you have been,
 * how much attention you have paid HIM, whether you have made an offer, how
 * good he is (the best players have more choices), and the small playing-time
 * term above.
 * ------------------------------------------------------------------------- */

const STAR_BANDS: [stars: number, chance: number][] = [
  [5, 0.02], [4, 0.09], [3, 0.26], [2, 0.38], [1, 0.25],
];

function starFor(rng: Rng, pull: number): number {
  /* A PROGRAMME WITH A NAME SEES BETTER PLAYERS, which is separate from whether
   * it lands them: the pool a big programme is shown is genuinely different from
   * the one a small one is shown, and that is most of what recruiting pull is. */
  const roll = rng.next() * (1 + pull / 160);
  let acc = 0;
  for (const [stars, chance] of STAR_BANDS) {
    acc += chance;
    if (roll < acc) return stars;
  }
  return 2;
}

/**
 * WHAT A RECRUIT OF THIS MANY STARS IS WORTH.
 *
 * DRAWN FROM THE SAME BAND THE WORLD BUILDS ITS ROSTERS FROM, and centred on the
 * MEAN star rather than on three stars — which is the whole of it, because the
 * star distribution is not symmetrical. A class centred two and a half points
 * below the band every rival is regenerated from is a programme that gets
 * quietly worse every year it recruits: measured over twenty seasons it was
 * worth seven rating points and a record of 50-189.
 *
 * A five-star at a high school is still a high school player. The level sets the
 * band; the stars only say where inside it he sits.
 */
const MEAN_STARS = 2.25;

/**
 * WHERE THE PROGRAMME ACTUALLY STANDS, which is not where it was written.
 *
 * A coach who has won for a decade is recruiting for a different programme from
 * the one he took over, and this is where that is said. Without it a dynasty has
 * no compounding in it at all: the twentieth season recruits exactly as well as
 * the first, and the whole point of building something is missing.
 */
export function standingOf(career: FootballCareer): number {
  const club = worldTeam(career.teamId);
  return clamp((club?.standing ?? 50) + (career.standingDrift[career.teamId] ?? 0), 1, 99);
}

function parFor(career: FootballCareer, stars: number): number {
  const info = LEVELS[career.level];
  const base = teamPar(career.level, standingOf(career));
  return base + ((stars - MEAN_STARS) / 4) * info.spread * 1.7;
}

/** How many players the programme may sign this year. */
export function classSize(career: FootballCareer): number {
  const info = LEVELS[career.level];
  // Enough to fill the squad back up, plus a little room to improve on it.
  return clamp(info.rosterSize - career.roster.length + 4, 6,
    info.ageSystem === 'pro' ? 12 : 16);
}

export const offerBudget = (career: FootballCareer): number =>
  classSize(career) + 3 + perksOf(career.coach).offers;

export const visitBudget = (career: FootballCareer): number =>
  6 + Math.round(LEVELS[career.level].games / 3) + perksOf(career.coach).visits;

/**
 * THE CLASS THIS PROGRAMME IS SHOWN.
 *
 * Deterministic from the career's seed and year, so a coach who closes the game
 * and comes back sees the same board. It is a POOL rather than a shortlist:
 * three times as many players as can be signed, so the choice is real.
 */
export function generateClass(career: FootballCareer): Recruit[] {
  const rng = new Rng(`fb:class:${career.seed}:${career.year}`);
  const club = worldTeam(career.teamId);
  const perks = perksOf(career.coach);
  const risen = standingOf(career) - (club?.standing ?? 50);
  const pull = (club?.recruiting ?? 50) + perks.recruitingPull + risen;
  const size = classSize(career) * 3;

  // Weighted toward the positions the roster is actually short of, but never
  // exclusively: the board shows the sport, not a shopping list.
  const shape = shapeFor(career.level);
  const have: Record<string, number> = {};
  for (const p of career.roster) have[p.pos] = (have[p.pos] ?? 0) + 1;
  const weights = POSITIONS.map((pos) => {
    const short = Math.max(0, shape[pos] - (have[pos] ?? 0));
    return 1 + short * 1.6;
  });

  /* EVERY POSITION IS ON THE BOARD, ALWAYS.
   *
   * A weighted draw over eleven positions and a dozen places can easily return
   * no quarterback at all, and a programme that cannot recruit a quarterback
   * plays a walk-on at quarterback — for ever, because next year's board is
   * drawn the same way. Measured, it left a twenty-season programme with a
   * seventy-eight at quarterback against a league averaging eighty-five, and the
   * same story at tight end, kicker and punter.
   *
   * So the board is seeded with one man at every position and the rest is drawn
   * by need. It is a recruiting BOARD, not a shopping list: what it must
   * guarantee is a choice, not a signing.
   */
  const slots: Position[] = [...POSITIONS];
  for (let i = POSITIONS.length; i < size; i++) {
    let total = 0;
    for (const w of weights) total += w;
    let t = rng.next() * total;
    let pos: Position = 'WR';
    for (let j = 0; j < POSITIONS.length; j++) {
      t -= weights[j];
      if (t <= 0) { pos = POSITIONS[j]; break; }
    }
    slots.push(pos);
  }

  const out: Recruit[] = [];
  for (let i = 0; i < slots.length; i++) {
    const pos = slots[i];
    const stars = starFor(rng, pull);
    const player = makePlayer(`fb:rec:${career.seed}:${career.year}:${i}`, {
      pos,
      par: parFor(career, stars),
      years: 1,
      age: 18,
    });
    out.push({
      id: player.id,
      first: player.first,
      last: player.last,
      pos,
      overall: player.overall,
      potential: player.potential,
      stars,
      /* WHERE HE STARTS. The programme's name, and nothing about your roster —
       * the roster term below only ever moves him a few points. */
      interest: clamp(Math.round(34 + pull * 0.3 - stars * 8 + rng.range(-8, 8)), 2, 92),
      attention: 0,
      offered: false,
      committedTo: null,
      player,
    });
  }
  return out.sort((a, b) => b.stars - a.stars || b.overall - a.overall);
}

/**
 * HOW HE FEELS ABOUT THIS PROGRAMME, and every term is named so the screen can
 * show him the reasons rather than a number he has to take on faith.
 */
export function interestReasons(
  career: FootballCareer, r: Recruit,
): { label: string; delta: number }[] {
  const club = worldTeam(career.teamId);
  const perks = perksOf(career.coach);
  const shape = shapeFor(career.level);
  const have = career.roster.filter((p) => p.pos === r.pos).length;
  const crowded = Math.max(0, have - shape[r.pos]);

  const risen = standingOf(career) - (club?.standing ?? 50);
  const out: { label: string; delta: number }[] = [
    { label: 'Your programme', delta: Math.round(((club?.recruiting ?? 50) - 50) * 0.35) },
    { label: 'What you have built here', delta: Math.round(risen * 0.5) },
    { label: 'Recruiting operation', delta: Math.round(perks.recruitingPull * 0.3) },
    { label: 'Your record', delta: Math.round((career.coach.reputation - 50) * 0.22) },
    { label: 'Visits', delta: r.attention * 6 },
    { label: 'Offer on the table', delta: r.offered ? 16 : 0 },
    { label: 'He has other options', delta: -(r.stars - 2) * 7 },
  ];
  /* AND THE PLAYING-TIME TERM, which is small ON PURPOSE. A programme already
   * two deep at his position is a slightly harder sell and nothing more. */
  if (crowded > 0) out.push({ label: 'Crowded at his position', delta: -crowded * 4 });
  return out.filter((x) => x.delta !== 0);
}

export function interestOf(career: FootballCareer, r: Recruit): number {
  const base = r.interest;
  const sum = interestReasons(career, r).reduce((n, x) => n + x.delta, 0);
  return clamp(Math.round(base + sum), 0, 99);
}

export function visit(career: FootballCareer, r: Recruit): boolean {
  if (career.visitsLeft <= 0 || r.committedTo) return false;
  career.visitsLeft -= 1;
  r.attention += 1;
  return true;
}

export function offer(career: FootballCareer, r: Recruit): boolean {
  if (r.offered || r.committedTo) return false;
  if (career.offersLeft <= 0) return false;
  career.offersLeft -= 1;
  r.offered = true;
  return true;
}

/**
 * SIGNING DAY.
 *
 * Everybody with an offer rolls against his interest; the ones who say yes
 * arrive, up to the class size. Anybody left goes somewhere else, which is said
 * plainly rather than hidden — a recruit who vanishes without explanation reads
 * as a bug.
 */
export function signingDay(career: FootballCareer): { signed: Player[]; lost: Recruit[] } {
  const rng = new Rng(`fb:sign:${career.seed}:${career.year}`);
  const limit = classSize(career);
  const signed: Player[] = [];
  const lost: Recruit[] = [];

  const offered = career.recruits
    .filter((r) => r.offered && !r.committedTo)
    .sort((a, b) => interestOf(career, b) - interestOf(career, a));

  for (const r of offered) {
    if (signed.length >= limit) {
      r.committedTo = 'elsewhere';
      lost.push(r);
      continue;
    }
    /* THE PLAYERS AT THE BOTTOM OF THE BOARD TAKE THE OFFER.
     *
     * A two-star with one offer on the table signs it; a five-star has six
     * programmes calling and can afford to say no. Without that difference every
     * recruit is equally hard to sign, the bottom of the class never fills, and
     * a programme loses eight players a year and replaces five — which over
     * twenty seasons is a roster of twenty-five men going 0-11 for ever. */
    const chance = clamp(interestOf(career, r) / 100 + (4 - r.stars) * 0.13, 0.05, 0.96);
    if (rng.next() < chance) {
      r.committedTo = career.teamId;
      signed.push(r.player);
    } else {
      r.committedTo = 'elsewhere';
      lost.push(r);
    }
  }
  for (const r of career.recruits) {
    if (!r.committedTo) r.committedTo = 'elsewhere';
  }
  return { signed, lost };
}
