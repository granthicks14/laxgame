import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { TEAMS, teamOr } from '../nfl';
import { priceRoster } from './club';
import { rosterOf } from './world';
import { push } from './news';
import type { Franchise } from './types';

/* ---------------------------------------------------------------------------
 * THE HOT SEAT
 * ---------------------------------------------------------------------------
 * Dynasty is a job for life. Challenge is a job.
 *
 * An owner has a number in his head before the season starts, and it is an
 * HONEST number: it is what this club, with this roster, ought to win. Taking a
 * two-win team to seven is a triumph; taking a twelve-win team to nine gets you
 * sacked, and a mode that cannot tell those apart is a mode that rewards taking
 * the best job and coasting.
 *
 * Beat the number and better clubs come calling. Miss it for long enough and
 * the seat gets hot enough to end the job — and then you find out who will have
 * you, which is usually somebody worse than where you started.
 * ------------------------------------------------------------------------- */

/** What the owner expects, in wins out of seventeen. */
export function expectationFor(fr: Franchise): number {
  const team = teamOr(fr.teamId);
  const drift = fr.prestigeDrift[fr.teamId] ?? 0;
  /* WHAT THE CLUB OUGHT TO BE, from what it is rather than from what it was
   * last year: a club that got lucky once is not owed eleven wins for ever. */
  const structural = 4.6 + team.prestige * 1.5 + drift / 4;
  /* AND WHAT IT HAS ACTUALLY BEEN DOING, which an owner cannot help weighting. */
  const recent = fr.history.slice(-2);
  const form = recent.length
    ? recent.reduce((s, h) => s + h.wins, 0) / recent.length
    : structural;
  /* A COACH IN HIS FIRST YEAR IS GIVEN A LITTLE ROOM, and only a little. */
  const grace = (fr.challenge?.seasonsHere ?? 0) === 0 ? -1.2 : 0;
  return Math.round(clamp(structural * 0.72 + form * 0.28 + grace, 3, 14));
}

export function beginChallengeSeason(fr: Franchise): void {
  const ch = fr.challenge;
  if (!ch) return;
  ch.expectation = expectationFor(fr);
  ch.offers = [];
  push(fr, 'league',
    `The owner wants ${ch.expectation} wins${ch.heat > 55 ? ', and he is not asking' : ' this year'}.`);
}

export const heatLabel = (heat: number): string =>
  (heat >= 85 ? 'On the brink' : heat >= 62 ? 'Running out of patience'
    : heat >= 38 ? 'Watching closely' : heat >= 18 ? 'Fine, for now' : 'Backed all the way');

/**
 * THE VERDICT ON A SEASON.
 *
 * Wins against the number, and then the two things that override it in both
 * directions: a championship buys a coach years, and a collapse costs him them.
 */
export function judgeChallengeSeason(
  fr: Franchise, wins: number, losses: number, champion: boolean, madePlayoffs: boolean,
): void {
  const ch = fr.challenge;
  if (!ch) return;
  ch.seasonsHere += 1;

  /* WINS AGAINST THE NUMBER, and that is nearly the whole verdict. Beating it
   * cools the seat by the same arithmetic that missing it heats one, so a good
   * year is worth a bad one and no more — a single eleven-win season should not
   * buy a decade. The two things that override it are the two things that
   * override it in life: January, and a trophy. */
  const miss = ch.expectation - wins;
  let move = miss * 10;
  if (madePlayoffs) move -= 12;
  if (champion) move -= 70;
  move = clamp(move, -40, 60);
  ch.heat = Math.round(clamp(ch.heat + move, 0, 120));

  const over = wins - ch.expectation;
  push(fr, 'league', champion
    ? 'A championship. Nobody is going anywhere.'
    : over >= 2 ? `${wins}-${losses}, well past what they wanted. ${heatLabel(ch.heat)}.`
      : over >= 0 ? `${wins}-${losses}, about what they wanted. ${heatLabel(ch.heat)}.`
        : `${wins}-${losses}, short of the ${ch.expectation} they asked for. ${heatLabel(ch.heat)}.`);

  if (ch.heat >= 100) {
    sack(fr);
    return;
  }

  /* WHO IS INTERESTED. Overperforming at a small club is the thing that gets a
   * coach a big one, which is the whole arc of the mode. */
  if (over >= 2 || champion) {
    const rng = new Rng(`nfl:offers:${fr.seed}:${fr.year}`);
    const here = teamOr(fr.teamId);
    const better = TEAMS
      .filter((t) => t.id !== fr.teamId
        && t.prestige + (fr.prestigeDrift[t.id] ?? 0) / 8 > here.prestige + 0.4)
      .sort(() => rng.next() - 0.5)
      .slice(0, champion ? 3 : 2);
    ch.offers = better.map((t) => t.id);
    for (const id of ch.offers) {
      push(fr, 'staff', `${teamOr(id).city} ${teamOr(id).name} have been in touch.`);
    }
  }
}

function sack(fr: Franchise): void {
  const ch = fr.challenge;
  if (!ch) return;
  const here = teamOr(fr.teamId);
  push(fr, 'staff', `${here.city} ${here.name} part company with ${fr.coachName}.`);
  ch.sacked = true;
  ch.heat = 100;
  const job = ch.jobs[ch.jobs.length - 1];
  if (job) job.to = fr.year;

  /* WHO WILL HAVE YOU NOW. Somebody always will — it is just never anybody
   * good, which is the price of the last three years. */
  const rng = new Rng(`nfl:sacked:${fr.seed}:${fr.year}`);
  const worse = TEAMS
    .filter((t) => t.id !== fr.teamId
      && t.prestige + (fr.prestigeDrift[t.id] ?? 0) / 8 <= here.prestige)
    .sort((a, b) => (a.prestige - b.prestige) || (rng.next() - 0.5))
    .slice(0, 3);
  ch.offers = worse.map((t) => t.id);
}

/** Take a job. The roster changes; everything you have done does not. */
export function takeJob(fr: Franchise, teamId: string): boolean {
  const ch = fr.challenge;
  if (!ch || !ch.offers.includes(teamId)) return false;
  const team = teamOr(teamId);

  const job = ch.jobs[ch.jobs.length - 1];
  if (job && job.to === null) job.to = fr.year;
  ch.jobs.push({ teamId, from: fr.year, to: null });
  ch.seasonsHere = 0;
  ch.heat = 0;
  ch.offers = [];
  ch.sacked = false;

  fr.teamId = teamId;
  fr.roster = rosterOf(fr, teamId, fr.year);
  priceRoster(fr.roster, new Rng(`nfl:job:${fr.seed}:${fr.year}:${teamId}`));
  fr.rosterEdits = {};
  fr.picks = fr.picks.filter((p) => p.ownerId !== fr.teamId);
  for (const year of [fr.year, fr.year + 1]) {
    for (let round = 1; round <= 4; round++) {
      fr.picks.push({ year, round, fromId: teamId, ownerId: teamId });
    }
  }
  fr.seasonStats = {};
  fr.gamesMissed = {};
  fr.funds = 20 + team.market * 3;
  fr.fanSupport = 38 + team.prestige * 7;
  fr.facilities = { training: 1, medical: 1, stadium: 1, scouting: 1, practice: 1 };

  push(fr, 'staff', `${fr.coachName} takes over the ${team.name}.`);
  return true;
}

/** No job and nobody calling: the career is over. */
export const careerOver = (fr: Franchise): boolean =>
  !!fr.challenge && fr.challenge.sacked && fr.challenge.offers.length === 0;

/** The line the hub shows about the board. */
export function boardLine(fr: Franchise): string {
  const ch = fr.challenge;
  if (!ch) return '';
  if (ch.sacked) return ch.offers.length ? 'Out of a job — somebody is calling' : 'Out of a job';
  return `${heatLabel(ch.heat)} · wants ${ch.expectation}`;
}
