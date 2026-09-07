import { Rng } from '../core/rng';
import { areRivals, teamsInDivision, type DivisionKey } from '../data/teams';
import type { ScheduledGame } from './types';

/** Circle-method round robin: every team plays every other team once. */
export function buildSchedule(division: DivisionKey, humanTeamId: string, seed: number): ScheduledGame[] {
  const rng = new Rng(seed);
  const ids = rng.shuffle(teamsInDivision(division).map((t) => t.id));
  const n = ids.length;
  const list = [...ids];
  if (n % 2 === 1) list.push('__BYE__');
  const rounds = list.length - 1;
  const half = list.length / 2;

  const games: ScheduledGame[] = [];
  const homeCount: Record<string, number> = {};
  for (const id of ids) homeCount[id] = 0;

  const rotating = list.slice(1);
  for (let r = 0; r < rounds; r++) {
    const week = r + 1;
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
