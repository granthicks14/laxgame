/* ---------------------------------------------------------------------------
 * NEWS AND STORYLINES
 * ---------------------------------------------------------------------------
 * Every line here is DERIVED from what actually happened in the save: a result
 * in the schedule, a jump in a player's development history, a scout's report,
 * a coach on the hot seat. Nothing is invented to fill the panel, and nothing
 * is stored — which means a news feed can never contradict the save, and an old
 * save cannot carry stale headlines into a new build.
 *
 * The rule for every generator below: if you cannot point at the record that
 * produced the line, the line does not get written.
 * ------------------------------------------------------------------------- */

import { STAR_OVERALL, starTier, type PlayerData } from '../data/players';
import { LEVELS } from '../data/levels';
import { SITUATIONS } from '../challenge/situations';
import { stageAt } from '../challenge/ladder';
import { effectiveTeam, seasonFormat, standingsSorted, userTeam } from './career';
import { fixtureStory } from './fixture';
import type { Career, ScheduledGame } from './types';

export type NewsKind = 'result' | 'streak' | 'upset' | 'player' | 'recruiting' | 'career' | 'league';

export interface NewsItem {
  kind: NewsKind;
  headline: string;
  body: string;
  /** Higher sorts first. */
  weight: number;
}

/** The feed, most interesting first. */
export function newsFeed(career: Career, limit = 6): NewsItem[] {
  const items: NewsItem[] = [
    ...resultStories(career),
    ...playerStories(career),
    ...recruitingStories(career),
    ...careerStories(career),
    ...leagueStories(career),
  ];
  return items.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/* ------------------------------------------------------------- on the field */

function played(career: Career): ScheduledGame[] {
  return career.schedule.filter((g) => g.featured && g.played);
}

function marginOf(career: Career, g: ScheduledGame): number {
  const home = g.homeId === career.teamId;
  return home ? g.homeScore - g.awayScore : g.awayScore - g.homeScore;
}

function resultStories(career: Career): NewsItem[] {
  const games = played(career);
  if (!games.length) return [];
  const out: NewsItem[] = [];
  const team = userTeam(career);
  const last = games[games.length - 1];
  const margin = marginOf(career, last);
  const oppId = last.homeId === career.teamId ? last.awayId : last.homeId;
  const opp = effectiveTeam(career, oppId);

  // The last result, always, because it is what the coach just did.
  out.push({
    kind: 'result',
    headline: margin > 0
      ? `${team.short} beat ${opp.short} ${Math.max(last.homeScore, last.awayScore)}-${Math.min(last.homeScore, last.awayScore)}`
      : margin < 0
        ? `${opp.short} beat ${team.short} ${Math.max(last.homeScore, last.awayScore)}-${Math.min(last.homeScore, last.awayScore)}`
        : `${team.short} and ${opp.short} drew`,
    // The story of the game, straight from its box score, when the score on
    // the record is the one the simulation produced. A game the coach played
    // by hand gets the plain line instead of a story about a different game.
    body: fixtureStory(career, last)?.line
      ?? (last.playoff ? 'A playoff game.' : last.rivalry ? 'A rivalry game.' : `Week ${last.week}.`),
    weight: 40 + (last.playoff ? 25 : 0) + (last.rivalry ? 10 : 0),
  });

  // An upset: beating somebody meaningfully better than you.
  const mine = effectiveTeam(career, career.teamId).overall;
  if (margin > 0 && opp.overall - mine >= 8) {
    out.push({
      kind: 'upset',
      headline: `${team.short} take down ${opp.short}`,
      body: `${opp.short} were rated ${opp.overall - mine} points better. Nobody had this one.`,
      weight: 70,
    });
  }

  // Streaks, counted straight off the schedule.
  let streak = 0;
  let winning = false;
  for (let i = games.length - 1; i >= 0; i--) {
    const m = marginOf(career, games[i]);
    if (m === 0) break;
    if (streak === 0) { winning = m > 0; streak = 1; continue; }
    if ((m > 0) === winning) streak++;
    else break;
  }
  if (streak >= 3) {
    out.push({
      kind: 'streak',
      headline: winning ? `${streak} straight for ${team.short}` : `${streak} in a row lost`,
      body: winning
        ? 'The programme has found something.'
        : 'The season is getting away from them.',
      weight: 50 + streak * 3,
    });
  }
  return out;
}

/* ----------------------------------------------------------------- players */

function playerStories(career: Career): NewsItem[] {
  const out: NewsItem[] = [];

  // A breakout, taken from the player's own development history.
  const breakouts = career.roster
    .filter((p) => {
      const h = p.dev?.history ?? [];
      const last = h[h.length - 1];
      return !!last && last.to - last.from >= 5;
    })
    .sort((a, b) => jump(b) - jump(a));
  const best = breakouts[0];
  if (best) {
    out.push({
      kind: 'player',
      headline: `${best.first} ${best.last} has taken a jump`,
      body: `Up ${jump(best)} points over the offseason to ${best.overall}. ${LEVELS[career.level].short} coaches have noticed.`,
      weight: 60,
    });
  }

  // A player crossing into star territory.
  const stars = career.roster.filter((p) => starTier(p.overall) > 0)
    .sort((a, b) => b.overall - a.overall);
  if (stars.length) {
    const s = stars[0];
    out.push({
      kind: 'player',
      headline: `${s.first} ${s.last} is one of the best at this level`,
      body: `${s.overall} overall at ${s.pos}. Anything above ${STAR_OVERALL} is rare in ${LEVELS[career.level].short}.`,
      weight: 45,
    });
  }

  // Somebody quietly producing.
  const scorer = [...career.roster]
    .sort((a, b) => (b.season.goals * 2 + b.season.assists) - (a.season.goals * 2 + a.season.assists))[0];
  if (scorer && scorer.season.goals + scorer.season.assists >= 8) {
    out.push({
      kind: 'player',
      headline: `${scorer.last} leads the programme`,
      body: `${scorer.season.goals}g ${scorer.season.assists}a in ${Math.max(1, scorer.season.gamesPlayed)} games.`,
      weight: 35,
    });
  }
  return out;
}

const jump = (p: PlayerData): number => {
  const h = p.dev?.history ?? [];
  const last = h[h.length - 1];
  return last ? last.to - last.from : 0;
};

/* -------------------------------------------------------------- recruiting */

function recruitingStories(career: Career): NewsItem[] {
  const state = career.recruiting;
  if (!state) return [];
  return state.news.slice(-3).reverse().map((n) => ({
    kind: 'recruiting' as const,
    headline: n.kind === 'gem' ? 'Your scouts have found somebody'
      : n.kind === 'lost' ? 'You have lost a recruit'
        : n.kind === 'battle' ? 'A recruiting battle'
          : n.kind === 'signed' ? 'A commitment' : 'From the recruiting trail',
    body: n.text,
    weight: n.kind === 'gem' ? 80 : n.kind === 'lost' ? 55 : 30,
  }));
}

/* ------------------------------------------------------------ the career */

function careerStories(career: Career): NewsItem[] {
  const state = career.challenge;
  if (!state) return [];
  const stage = stageAt(state.stageIndex);
  const out: NewsItem[] = [];

  if (state.heat >= 2) {
    out.push({
      kind: 'career',
      headline: 'The job is in danger',
      body: `${stage.name}. They wanted ${Math.round(state.expectation.winPct * 100)}% and they have not had it. `
        + 'One more season like this and the programme will move on.',
      weight: 90,
    });
  } else if (state.tenure <= 1) {
    out.push({
      kind: 'career',
      headline: `A new coach at ${userTeam(career).short}`,
      body: `${SITUATIONS[state.situation].label}. ${SITUATIONS[state.situation].fix}`,
      weight: 65,
    });
  }

  const titles = Object.values(state.titles).reduce((n, v) => n + v, 0);
  if (titles >= 2 && state.reputation >= 60) {
    out.push({
      kind: 'career',
      headline: 'A name in the sport',
      body: `${titles} championships and a reputation of ${Math.round(state.reputation)}. `
        + 'Better programmes are watching.',
      weight: 42,
    });
  }
  return out;
}

/* --------------------------------------------------------------- the league */

function leagueStories(career: Career): NewsItem[] {
  const table = standingsSorted(career);
  if (!table.length) return [];
  const leader = table[0];
  const me = table.findIndex((r) => r.teamId === career.teamId);
  const out: NewsItem[] = [];
  const format = seasonFormat(career);

  if (leader.teamId !== career.teamId && leader.wins + leader.losses > 0) {
    const t = effectiveTeam(career, leader.teamId);
    out.push({
      kind: 'league',
      headline: `${t.short} lead the table`,
      body: `${leader.wins}-${leader.losses}. ${format.titleName} is theirs to lose.`,
      weight: 20,
    });
  }
  if (me === 0 && leader.wins > 0) {
    out.push({
      kind: 'league',
      headline: `${userTeam(career).short} top the table`,
      body: `${leader.wins}-${leader.losses}, and everyone else is chasing.`,
      weight: 55,
    });
  }
  return out;
}
