import { Rng } from '../core/rng';
import { areRivals, teamsInClass, type ClassKey } from '../data/teams';
import type { ScheduledGame } from './types';

/** Target regular-season length, used to decide single or double round robin. */
const TARGET_GAMES = 12;

/**
 * Circle-method round robin. Small classes play everyone twice so the season is
 * a real season rather than seven games; large classes play once.
 */
export function buildSchedule(
  classKey: ClassKey, humanTeamId: string, seed: number, memberIds?: string[],
): ScheduledGame[] {
  const rng = new Rng(seed);
  // Membership is passed in by a career, where promotion and relegation have
  // moved teams around; the data file's class is only the starting point.
  const ids = rng.shuffle(memberIds ?? teamsInClass(classKey).map((t) => t.id));
  const n = ids.length;
  const cycles = Math.max(1, Math.min(2, Math.round(TARGET_GAMES / Math.max(1, n - 1))));
  const list = [...ids];
  if (n % 2 === 1) list.push('__BYE__');
  const rounds = list.length - 1;
  const half = list.length / 2;

  const games: ScheduledGame[] = [];
  const homeCount: Record<string, number> = {};
  for (const id of ids) homeCount[id] = 0;

  const rotating = list.slice(1);
  for (let r = 0; r < rounds * cycles; r++) {
    const week = r + 1;
    const secondCycle = r >= rounds;
    const order = [list[0], ...rotating];
    for (let i = 0; i < half; i++) {
      const a = order[i];
      const b = order[order.length - 1 - i];
      if (a === '__BYE__' || b === '__BYE__') continue;
      // Alternate home/away to keep the split fair.
      let homeId = a;
      let awayId = b;
      if (homeCount[a] > homeCount[b] || (homeCount[a] === homeCount[b] && (r + i) % 2 === 1)) {
        homeId = b;
        awayId = a;
      }
      // The return fixture swaps the venue so every pairing is home and away.
      if (secondCycle) { const t = homeId; homeId = awayId; awayId = t; }
      homeCount[homeId]++;
      games.push({
        id: `w${week}-${homeId}-${awayId}`,
        week,
        homeId,
        awayId,
        played: false,
        homeScore: 0,
        awayScore: 0,
        rivalry: areRivals(homeId, awayId),
        playoff: null,
        featured: homeId === humanTeamId || awayId === humanTeamId,
      });
    }
    rotating.unshift(rotating.pop()!);
  }

  games.sort((x, y) => x.week - y.week);
  return games;
}

export const regularSeasonWeeks = (games: ScheduledGame[]): number =>
  games.reduce((m, g) => (g.playoff ? m : Math.max(m, g.week)), 0);
