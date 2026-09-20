import { CONFERENCES, teamOr, type Conference } from '../nfl';
import { REGULAR_SEASON_WEEKS } from './schedule';
import { ROUND_LABEL, type Fixture, type PlayoffRound, type SeedEntry } from './types';

/* ---------------------------------------------------------------------------
 * JANUARY
 * ---------------------------------------------------------------------------
 * Seven clubs from each conference and the bracket the sport actually uses:
 *
 *   WILD CARD      2v7, 3v6, 4v5. The top seed has the weekend off, which is
 *                  what the whole regular season was for.
 *   DIVISIONAL     the top seed gets whoever is left with the worst seed.
 *   CONFERENCE     the two survivors, at the better seed's place.
 *   SUPER BOWL     one game, neutral, and nothing after it.
 *
 * Reseeding between rounds matters and is easy to get wrong: a fixed bracket
 * would give the number one seed a possible path through the number two seed in
 * the second round, which is not the reward the number one seed earned.
 * ------------------------------------------------------------------------- */

export const ROUND_ORDER: PlayoffRound[] = ['wildcard', 'divisional', 'conference', 'superbowl'];

export const ROUND_WEEK: Record<PlayoffRound, number> = {
  wildcard: REGULAR_SEASON_WEEKS + 1,
  divisional: REGULAR_SEASON_WEEKS + 2,
  conference: REGULAR_SEASON_WEEKS + 3,
  superbowl: REGULAR_SEASON_WEEKS + 4,
};

const fixture = (
  round: PlayoffRound, conference: Conference | 'both', i: number,
  homeId: string, awayId: string, myId: string,
): Fixture => ({
  id: `po:${round}:${conference}:${i}`,
  week: ROUND_WEEK[round],
  homeId,
  awayId,
  played: false,
  homeScore: 0,
  awayScore: 0,
  featured: homeId === myId || awayId === myId,
  division: false,
  conference: conference !== 'both',
  rivalry: false,
  round,
});

/** The first weekend, from the seeds. */
export function wildCardRound(
  seeds: Record<Conference, SeedEntry[]>, myId: string,
): Fixture[] {
  const out: Fixture[] = [];
  for (const conf of CONFERENCES) {
    const list = seeds[conf];
    const pairs: [number, number][] = [[2, 7], [3, 6], [4, 5]];
    pairs.forEach(([hi, lo], i) => {
      const home = list.find((s) => s.seed === hi);
      const away = list.find((s) => s.seed === lo);
      if (home && away) out.push(fixture('wildcard', conf, i, home.teamId, away.teamId, myId));
    });
  }
  return out;
}

const seedOf = (list: SeedEntry[], teamId: string): number =>
  list.find((s) => s.teamId === teamId)?.seed ?? 99;

const winnerOf = (f: Fixture): string => (f.homeScore >= f.awayScore ? f.homeId : f.awayId);

/**
 * THE NEXT ROUND, RESEEDED.
 *
 * Returns an empty list when the round that has just finished was the last one.
 */
export function nextRound(
  seeds: Record<Conference, SeedEntry[]>, done: Fixture[], round: PlayoffRound, myId: string,
): Fixture[] {
  const out: Fixture[] = [];
  const finished = done.filter((f) => f.round === round && f.played);

  if (round === 'wildcard') {
    for (const conf of CONFERENCES) {
      const list = seeds[conf];
      const bye = list.find((s) => s.bye);
      const winners = finished
        .filter((f) => list.some((s) => s.teamId === f.homeId))
        .map(winnerOf)
        .sort((a, b) => seedOf(list, a) - seedOf(list, b));
      if (!bye || winners.length < 3) continue;
      // The top seed takes the worst survivor; the other two play each other.
      const lowest = winners[winners.length - 1];
      const middle = winners.slice(0, winners.length - 1);
      out.push(fixture('divisional', conf, 0, bye.teamId, lowest, myId));
      if (middle.length === 2) {
        out.push(fixture('divisional', conf, 1, middle[0], middle[1], myId));
      }
    }
    return out;
  }

  if (round === 'divisional') {
    for (const conf of CONFERENCES) {
      const list = seeds[conf];
      const winners = finished
        .filter((f) => list.some((s) => s.teamId === f.homeId))
        .map(winnerOf)
        .sort((a, b) => seedOf(list, a) - seedOf(list, b));
      if (winners.length === 2) {
        out.push(fixture('conference', conf, 0, winners[0], winners[1], myId));
      }
    }
    return out;
  }

  if (round === 'conference') {
    const champs: Partial<Record<Conference, string>> = {};
    for (const conf of CONFERENCES) {
      const list = seeds[conf];
      const game = finished.find((f) => list.some((s) => s.teamId === f.homeId));
      if (game) champs[conf] = winnerOf(game);
    }
    if (champs.AFC && champs.NFC) {
      /* THE SUPER BOWL IS AT A NEUTRAL SITE, so "home" here is a coin the
       * league tossed years ago: the conferences alternate. The engine still
       * needs one of them nominated, and the home edge is taken off it. */
      out.push(fixture('superbowl', 'both', 0, champs.AFC, champs.NFC, myId));
    }
    return out;
  }
  return out;
}

export const roundOf = (games: Fixture[]): PlayoffRound | null => {
  for (let i = ROUND_ORDER.length - 1; i >= 0; i--) {
    if (games.some((f) => f.round === ROUND_ORDER[i])) return ROUND_ORDER[i];
  }
  return null;
};

/** How far a club got, in words, for the history page. */
export function exitLabel(games: Fixture[], teamId: string, champion: boolean): string {
  if (champion) return 'Won the Super Bowl';
  const mine = games.filter((f) => f.played && (f.homeId === teamId || f.awayId === teamId));
  if (!mine.length) return 'Missed the playoffs';
  const last = mine[mine.length - 1];
  if (!last.round) return 'Missed the playoffs';
  if (last.round === 'superbowl') return 'Lost the Super Bowl';
  if (last.round === 'conference') return 'Lost the Conference Championship';
  if (last.round === 'divisional') return 'Lost in the Divisional round';
  return 'Lost in the Wild Card round';
}

/** How many rounds a club played, which is what January is worth at the gate. */
export const roundsPlayed = (games: Fixture[], teamId: string): number =>
  games.filter((f) => f.played && (f.homeId === teamId || f.awayId === teamId)).length;

/** The name a scoreboard puts on a playoff game. */
export function playoffLabel(f: Fixture): string {
  if (!f.round) return `Week ${f.week}`;
  if (f.round === 'superbowl') return ROUND_LABEL.superbowl;
  const conf = teamOr(f.homeId).conference;
  return `${conf} ${ROUND_LABEL[f.round]}`;
}
