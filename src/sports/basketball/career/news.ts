import { LEVELS } from '../levels';
import { worldTeam } from '../world';
import { averages, type HoopsCareer, type HoopsFixture } from './types';
import { levelTable, rivalOf, rowFor } from './schedule';
import { classGrade, committedTo } from './recruit';
import { coachLevel } from './coach';
import { SITUATIONS } from './challenge';
import { standingOf } from './league';
import { PRACTICE_INFO } from './practice';

/* ---------------------------------------------------------------------------
 * WHAT PEOPLE ARE SAYING
 * ---------------------------------------------------------------------------
 * A basketball programme in a town that cares, reported back to the coach.
 *
 * THE RULE, and it is the whole file: EVERY LINE POINTS AT A RECORD. A headline
 * about a nine-point win exists because there is a fixture in the schedule with
 * a nine-point margin in it. A headline about a breakout exists because
 * development wrote one. Nothing here is invented to fill the panel, and nothing
 * here is STORED — the feed is computed from the save every time it is asked
 * for, so it can never contradict the save, and a career that has been sitting in
 * a browser for a year cannot carry a stale headline into a new build.
 *
 * If a generator below cannot point at the record that produced its line, the
 * line does not get written.
 * ------------------------------------------------------------------------- */

export type NewsKind =
  | 'result' | 'streak' | 'player' | 'recruiting' | 'coach' | 'league' | 'practice';

export interface NewsItem {
  kind: NewsKind;
  headline: string;
  body: string;
  /** Higher sorts first. */
  weight: number;
}

const KIND_LABEL: Record<NewsKind, string> = {
  result: 'Result',
  streak: 'Form',
  player: 'Squad',
  recruiting: 'Recruiting',
  coach: 'The job',
  league: 'The league',
  practice: 'Practice',
};

export const newsKindLabel = (k: NewsKind): string => KIND_LABEL[k];

/** The feed, most interesting first. */
export function newsFeed(career: HoopsCareer, limit = 6): NewsItem[] {
  return [
    ...resultStories(career),
    ...playerStories(career),
    ...recruitingStories(career),
    ...coachStories(career),
    ...leagueStories(career),
    ...practiceStories(career),
  ].sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/* ---------------------------------------------------------------- the games */

const myGames = (career: HoopsCareer): HoopsFixture[] =>
  [...career.schedule, ...career.postseason].filter((f) => f.featured && f.played);

function marginOf(career: HoopsCareer, f: HoopsFixture): number {
  const home = f.homeId === career.teamId;
  return home ? f.homeScore - f.awayScore : f.awayScore - f.homeScore;
}

const opponentOf = (career: HoopsCareer, f: HoopsFixture): string =>
  (f.homeId === career.teamId ? f.awayId : f.homeId);

function resultStories(career: HoopsCareer): NewsItem[] {
  const games = myGames(career);
  const last = games[games.length - 1];
  if (!last) return [];
  const out: NewsItem[] = [];
  const me = worldTeam(career.teamId);
  const them = worldTeam(opponentOf(career, last));
  const margin = marginOf(career, last);
  const won = margin > 0;
  const score = `${Math.max(last.homeScore, last.awayScore)}-${Math.min(last.homeScore, last.awayScore)}`;

  /* The margin IS the story. A basketball crowd does not talk about a win, it
   * talks about a thirty-point win or a one-point win, and those are different
   * nights. */
  if (Math.abs(margin) <= 2) {
    out.push({
      kind: 'result',
      headline: won
        ? `${me.abbr} survive ${them.abbr} by ${Math.abs(margin)}`
        : `${them.abbr} edge ${me.abbr} by ${Math.abs(margin)}`,
      body: `${score}. A possession either way and it is the other result. `
        + `${won ? 'They will take it.' : 'Nobody in the building thinks it was deserved.'}`,
      weight: 9,
    });
  } else if (Math.abs(margin) >= 22) {
    out.push({
      kind: 'result',
      headline: won
        ? `${me.abbr} run ${them.abbr} off the floor`
        : `${them.abbr} humble ${me.abbr}`,
      body: `${score}. ${Math.abs(margin)} points, and it was over before the fourth. `
        + `${won ? 'The bench got a quarter.' : 'The coach has questions to answer.'}`,
      weight: 8,
    });
  } else {
    out.push({
      kind: 'result',
      headline: `${me.abbr} ${won ? 'beat' : 'lose to'} ${them.abbr} ${score}`,
      body: won
        ? 'A professional night. Nothing to fix that was not already broken.'
        : 'Not their night. There is film to watch.',
      weight: 5,
    });
  }

  // The one fixture the town actually cares about.
  if (last.rivalry) {
    out.push({
      kind: 'result',
      headline: won ? `The rivalry stays home` : `${them.abbr} take the rivalry`,
      body: `${me.name} and ${them.name} have played this game a long time. `
        + `This year it went ${score}${won ? '' : ' the wrong way'}.`,
      weight: 10,
    });
  }

  // A run, either direction, from the standings rather than a recount.
  const row = rowFor(career.standings, career.teamId);
  if (Math.abs(row.streak) >= 3) {
    const n = Math.abs(row.streak);
    out.push({
      kind: 'streak',
      headline: row.streak > 0 ? `${n} straight` : `${n} in a row lost`,
      body: row.streak > 0
        ? `Nobody at the level has looked better for a fortnight.`
        : `The schedule does not get easier, and the room knows it.`,
      weight: 6 + Math.min(3, n - 3),
    });
  }
  return out;
}

/* ---------------------------------------------------------------- the squad */

function playerStories(career: HoopsCareer): NewsItem[] {
  const out: NewsItem[] = [];

  /* Whoever is actually carrying the scoring. Read off the season lines, so it
   * changes when the minutes change. */
  let best: { name: string; ppg: number; games: number } | null = null;
  for (const p of career.roster) {
    const a = averages(career.season[p.id]);
    if (a.games < 3) continue;
    if (!best || a.ppg > best.ppg) {
      best = { name: `${p.first} ${p.last}`, ppg: a.ppg, games: a.games };
    }
  }
  if (best && best.ppg >= 14) {
    out.push({
      kind: 'player',
      headline: `${best.name} is scoring ${best.ppg.toFixed(1)} a night`,
      body: `${best.games} games in, and the offence goes through him whether the `
        + `sets say so or not.`,
      weight: 4 + Math.min(4, (best.ppg - 14) / 4),
    });
  }

  // A breakout, if development wrote one. Straight off the last report.
  const jump = career.lastDevelopment.find((d) => d.outcome === 'breakout');
  if (jump) {
    out.push({
      kind: 'player',
      headline: `${jump.name} came back different`,
      body: `${jump.from} to ${jump.to} over the summer. ${jump.label}`,
      weight: 7,
    });
  }

  // Somebody leaving is news, and it is the reason that makes it news.
  const gone = career.lastDepartures.find((d) => d.overall >= 72);
  if (gone) {
    out.push({
      kind: 'player',
      headline: `${gone.name} is gone`,
      body: `${gone.pos}, ${gone.overall} overall. ${gone.reason}`,
      weight: 6,
    });
  }

  // The wall, once there is one worth pointing at.
  const wall = [...career.alumni].sort((a, b) => b.line.points - a.line.points)[0];
  if (wall && wall.line.points >= 900) {
    out.push({
      kind: 'player',
      headline: `${wall.name} still leads the programme`,
      body: `${wall.line.points} points across ${wall.seasons} season`
        + `${wall.seasons === 1 ? '' : 's'}, and nobody here has passed him yet.`,
      weight: 3,
    });
  }
  return out;
}

/* ------------------------------------------------------------- recruiting */

function recruitingStories(career: HoopsCareer): NewsItem[] {
  const state = career.recruiting;
  if (!state) return [];
  const mine = committedTo(state, career.teamId);
  if (!mine.length) return [];
  const grade = classGrade(state, career.teamId);
  const headline = mine.length === 1
    ? `${mine[0].player.first} ${mine[0].player.last} commits`
    : `${mine.length} signed, class graded ${grade.grade}`;
  const top = [...mine].sort((a, b) => b.stars - a.stars)[0];
  return [{
    kind: 'recruiting',
    headline,
    body: `Best of the group: ${top.player.first} ${top.player.last}, `
      + `${top.stars}-star ${top.player.pos}. Class grade ${grade.grade}.`,
    weight: grade.score >= 70 ? 7 : 4,
  }];
}

/* ------------------------------------------------------------------ the job */

function coachStories(career: HoopsCareer): NewsItem[] {
  const out: NewsItem[] = [];
  const level = coachLevel(career.coach);

  if (career.championships > 0 && career.titleSeen) {
    out.push({
      kind: 'coach',
      headline: career.championships === 1
        ? 'A championship on the wall'
        : `${career.championships} titles and counting`,
      body: `${career.coach.careerWins}-${career.coach.careerLosses} across `
        + `${career.coach.seasons} season${career.coach.seasons === 1 ? '' : 's'}. `
        + `Level ${level} coach.`,
      weight: 5,
    });
  }

  /* CHALLENGE ONLY: the board's expectation, which is the thing a coach on a
   * ladder is actually being judged against. It is stored, so it is quotable. */
  const ch = career.challenge;
  if (ch) {
    const sit = SITUATIONS[ch.situation];
    if (sit) {
      out.push({
        kind: 'coach',
        headline: sit.label,
        body: sit.blurb,
        weight: 6,
      });
    }
    const last = ch.steps[ch.steps.length - 1];
    if (last && last.outcome === 'fired') {
      out.push({
        kind: 'coach',
        headline: 'Out of a job',
        body: `${last.wins}-${last.losses} was not enough at ${last.teamShort}. `
          + `The phone will ring, or it will not.`,
        weight: 11,
      });
    }
  }
  return out;
}

/* --------------------------------------------------------------- the league */

function leagueStories(career: HoopsCareer): NewsItem[] {
  const table = levelTable(career.standings, career.level);
  const played = table.reduce((n, r) => n + r.wins + r.losses, 0);
  if (played < 4) return [];
  const out: NewsItem[] = [];
  const top = table[0];
  const info = LEVELS[career.level];

  if (top && top.teamId !== career.teamId) {
    out.push({
      kind: 'league',
      headline: `${top.team.abbr} lead ${info.short} at ${top.wins}-${top.losses}`,
      body: `${(top.pointDiff >= 0 ? '+' : '')}${top.pointDiff} on the season. `
        + `${career.teamId in career.standings
          ? `${worldTeam(career.teamId).abbr} are ${
            table.findIndex((r) => r.teamId === career.teamId) + 1}${
            ordinal(table.findIndex((r) => r.teamId === career.teamId) + 1)}.`
          : ''}`,
      weight: 3,
    });
  }

  /* A programme that has genuinely moved in the world, which only happens after
   * years of results and is therefore worth saying out loud. */
  const rivalId = rivalOf(worldTeam(career.teamId));
  if (rivalId) {
    const drift = career.standingDrift[rivalId] ?? 0;
    if (Math.abs(drift) >= 6) {
      const rival = worldTeam(rivalId);
      out.push({
        kind: 'league',
        headline: drift > 0
          ? `${rival.name} are a real programme now`
          : `${rival.name} have fallen away`,
        body: `Their standing has moved to ${Math.round(standingOf(career, rivalId))}. `
          + `${drift > 0 ? 'Recruiting against them is harder than it was.'
            : 'The recruits they used to take are available.'}`,
        weight: 4,
      });
    }
  }
  return out;
}

function practiceStories(career: HoopsCareer): NewsItem[] {
  if (!career.practice) return [];
  const info = PRACTICE_INFO[career.practice];
  return [{
    kind: 'practice',
    headline: `The week is about ${info.label.toLowerCase()}`,
    body: info.blurb,
    weight: 2,
  }];
}

function ordinal(n: number): string {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
