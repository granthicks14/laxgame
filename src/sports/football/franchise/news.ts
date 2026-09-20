import { teamOr } from '../nfl';
import type { Franchise, Fixture, NewsItem, NewsKind } from './types';

/* ---------------------------------------------------------------------------
 * THE WIRE
 * ---------------------------------------------------------------------------
 * A short, honest feed of things that actually happened, kept to the last few
 * dozen so a twenty-season save does not carry a novel around with it.
 *
 * Nothing in here is invented flavour dressed up as fact: every line is written
 * at the moment the thing it describes happens, from the numbers it happened
 * with. A franchise feed that makes things up is a franchise feed nobody reads
 * twice.
 * ------------------------------------------------------------------------- */

const KEEP = 60;

export function push(fr: Franchise, kind: NewsKind, text: string, week = 0): void {
  fr.news.unshift({ year: fr.year, week, kind, text });
  if (fr.news.length > KEEP) fr.news.length = KEEP;
}

export const recentNews = (fr: Franchise, n = 6): NewsItem[] => fr.news.slice(0, n);

/** One sentence about a finished game of yours. */
export function recapOf(fr: Franchise, f: Fixture): { headline: string; line: string } {
  const mine = f.homeId === fr.teamId ? 'home' : 'away';
  const us = mine === 'home' ? f.homeScore : f.awayScore;
  const them = mine === 'home' ? f.awayScore : f.homeScore;
  const other = teamOr(mine === 'home' ? f.awayId : f.homeId);
  const name = other.name;
  const margin = us - them;
  const where = mine === 'home' ? 'at home' : 'on the road';

  if (margin > 0) {
    if (margin >= 21) {
      return { headline: 'Never in doubt', line: `${us}-${them} over the ${name}, and it was over by the half.` };
    }
    if (margin <= 3) {
      return { headline: 'By a field goal', line: `${us}-${them}. One score in it at the end against the ${name}.` };
    }
    return { headline: 'A win', line: `${us}-${them} over the ${name} ${where}.` };
  }
  if (margin === 0) {
    return { headline: 'Tied', line: `${us}-${them} with the ${name}. Nobody could separate them.` };
  }
  if (margin >= -3) {
    return { headline: 'One score short', line: `${them}-${us} to the ${name}. A play either way.` };
  }
  if (margin <= -21) {
    return { headline: 'Taken apart', line: `${them}-${us} to the ${name}. Nothing worked.` };
  }
  return { headline: 'Beaten', line: `${them}-${us} to the ${name} ${where}.` };
}

export const newsIcon: Record<NewsKind, string> = {
  game: 'Result',
  injury: 'Injury',
  signing: 'Signing',
  draft: 'Draft',
  staff: 'Staff',
  league: 'League',
  milestone: 'Milestone',
  trade: 'Trade',
};
