import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { LEVELS, LEVEL_ORDER, levelAbove, type FootballLevel } from '../levels';
import { rosterFor, teamsAtLevel, worldTeam } from '../world';
import type { ChallengeState, FootballCareer } from './types';

/* ---------------------------------------------------------------------------
 * THE CLIMB
 * ---------------------------------------------------------------------------
 * Challenge mode. You start at the bottom of the sport with a programme that has
 * nothing, and the only way up is to WIN — not to accumulate, not to wait, but to
 * take a bad job and win with it until somebody better offers you theirs.
 *
 * THREE RULES, and they are the whole mode:
 *
 *   1. YOU DO NOT CHOOSE YOUR FIRST JOB. It is the worst programme at the bottom
 *      tier, because a climb that starts halfway up is not a climb.
 *   2. JOBS COME TO YOU, and only when you have earned them. A championship gets
 *      you noticed a level up; a good season gets you a sideways move; a bad run
 *      gets you the sack and a job below the one you had.
 *   3. THE BOARD IS WATCHING. Heat builds with every losing season and cools with
 *      every winning one, and at a hundred you are out.
 *
 * There is no other mode hiding behind this one. Dynasty is the sandbox where a
 * coach picks a programme and stays; Challenge is the career where he does not.
 * ------------------------------------------------------------------------- */

/** The bottom of the sport, which is where every Challenge career begins. */
export function startingJob(seed: number): { teamId: string; level: FootballLevel } {
  const level = LEVEL_ORDER[0];
  const pool = teamsAtLevel(level).sort((a, b) => a.standing - b.standing);
  const rng = new Rng(`fb:challenge:start:${seed}`);
  // The worst two, so it is not literally the same club every career.
  const pick = pool[rng.int(0, Math.min(1, pool.length - 1))];
  return { teamId: pick.id, level };
}

export function newChallenge(teamId: string, level: FootballLevel): ChallengeState {
  return {
    rungIndex: LEVEL_ORDER.indexOf(level),
    seasonsHere: 0,
    heat: 20,
    offers: [],
    jobs: [{ teamId, level, from: 1, to: null }],
  };
}

export const rungLabel = (index: number): string =>
  LEVELS[LEVEL_ORDER[clamp(index, 0, LEVEL_ORDER.length - 1)]].short;

/**
 * WHAT THE BOARD MAKES OF A SEASON.
 *
 * Heat is the mode's clock. A programme that hired you to win and has not won is
 * losing patience whatever the reasons, and the reasons are exactly why a coach
 * takes a job he can succeed at rather than the best one on the board.
 */
export function updateHeat(
  ch: ChallengeState, wins: number, losses: number, champion: boolean, expected: number,
): void {
  const games = Math.max(1, wins + losses);
  const rate = wins / games;
  /* MEASURED AGAINST WHAT THE PROGRAMME IS, not against .500. Going 5-5 at the
   * worst club in the district is a good season; going 5-5 at the best one is
   * not, and a mode that cannot tell the difference is a mode that punishes you
   * for taking the hard job. */
  const over = rate - expected;
  let heat = ch.heat - over * 90;
  if (champion) heat -= 45;
  ch.heat = clamp(Math.round(heat), 0, 100);
  ch.seasonsHere += 1;
}

/** How good a season this programme has a right to expect. */
export function expectedRate(teamId: string): number {
  const team = worldTeam(teamId);
  if (!team) return 0.5;
  return clamp(0.24 + (team.standing / 99) * 0.5, 0.2, 0.78);
}

/**
 * WHO WANTS HIM NOW.
 *
 * A championship opens the level above. A strong season opens better jobs at the
 * level he is on. Nothing else opens anything — which is what makes a title
 * mean something rather than being a line in a history table.
 */
export function jobOffers(career: FootballCareer, champion: boolean): string[] {
  const ch = career.challenge;
  if (!ch) return [];
  const rng = new Rng(`fb:offers:${career.seed}:${career.year}`);
  const rep = career.coach.reputation;
  const out: string[] = [];

  const here = worldTeam(career.teamId);
  const up = levelAbove(career.level);

  if (champion && up) {
    /* A LEVEL UP, and it is the BOTTOM of that level: nobody hands a coach who
     * has just won a district title the best programme in the state. */
    const pool = teamsAtLevel(up)
      .filter((t) => t.standing < 42 + rep * 0.3)
      .sort((a, b) => a.standing - b.standing);
    const n = Math.min(2, pool.length);
    for (let i = 0; i < n; i++) out.push(pool[rng.int(0, Math.min(3, pool.length - 1))].id);
  }

  /* BETTER JOBS AT THE SAME LEVEL, and they are rare on purpose.
   *
   * A board that phones every year turns the climb into a shuffle: measured, a
   * coach who always took the best offer changed programme seventeen times in
   * twenty-four seasons, which is not a career, it is a commute. He has to have
   * been somewhere long enough to have done something, and even then it is not
   * every year. */
  if (rep > 66 && here && ch.seasonsHere >= 2 && rng.next() < 0.45) {
    const pool = teamsAtLevel(career.level)
      .filter((t) => t.id !== career.teamId && t.standing > here.standing + 10
        && t.standing < here.standing + 30 + rep * 0.2);
    if (pool.length) out.push(pool[rng.int(0, pool.length - 1)].id);
  }

  return [...new Set(out)];
}

/**
 * THE SACK, and where he lands after it.
 *
 * Not the end of the career — a coach who is let go takes a job somewhere worse
 * and starts again, which is what happens and is also far more interesting than
 * a game-over screen. He only runs out of road at the very bottom.
 */
export function sackedTo(career: FootballCareer): { teamId: string; level: FootballLevel } | null {
  const idx = LEVEL_ORDER.indexOf(career.level);
  const down = LEVEL_ORDER[Math.max(0, idx - 1)];
  const rng = new Rng(`fb:sacked:${career.seed}:${career.year}`);
  const pool = teamsAtLevel(down)
    .filter((t) => t.id !== career.teamId)
    .sort((a, b) => a.standing - b.standing)
    .slice(0, 4);
  if (!pool.length) return null;
  return { teamId: pool[rng.int(0, pool.length - 1)].id, level: down };
}

/**
 * TAKE A JOB.
 *
 * Everything about the programme changes and everything about the COACH stays:
 * his tree, his points, his record, his reputation and every season he has ever
 * coached come with him. That is the difference between a career and a save
 * file, and it is why the history screen is worth reading.
 */
export function takeJob(career: FootballCareer, teamId: string): boolean {
  const team = worldTeam(teamId);
  if (!team || !career.challenge) return false;

  const ch = career.challenge;
  const last = ch.jobs[ch.jobs.length - 1];
  if (last && last.to === null) last.to = career.year - 1;

  career.teamId = team.id;
  career.level = team.level;
  career.conferenceId = team.conferenceId;
  career.roster = rosterFor(team, career.year);
  career.season = {};
  ch.rungIndex = LEVEL_ORDER.indexOf(team.level);
  ch.seasonsHere = 0;
  ch.heat = 25;
  ch.offers = [];
  ch.jobs.push({ teamId: team.id, level: team.level, from: career.year, to: null });
  return true;
}

/** What the coach is being asked, at the end of a Challenge season. */
export interface ChallengeVerdict {
  kind: 'stay' | 'offers' | 'sacked' | 'finished';
  headline: string;
  line: string;
  offers: string[];
  /** Where he lands if he was let go. */
  fallback?: { teamId: string; level: FootballLevel };
}

export function verdictFor(career: FootballCareer, champion: boolean): ChallengeVerdict {
  const ch = career.challenge;
  if (!ch) return { kind: 'stay', headline: '', line: '', offers: [] };

  if (ch.heat >= 100) {
    const fallback = sackedTo(career);
    if (!fallback) {
      return {
        kind: 'finished',
        headline: 'The end of the road',
        line: 'Nobody below this is hiring. That is the whole climb, and it stopped here.',
        offers: [],
      };
    }
    const club = worldTeam(fallback.teamId);
    return {
      kind: 'sacked',
      headline: 'Let go',
      line: `The board has seen enough. ${club ? `${club.city} ${club.name}` : 'Somebody'} `
        + 'will take you, and it is a step back down.',
      offers: [],
      fallback,
    };
  }

  const offers = jobOffers(career, champion);
  if (offers.length) {
    return {
      kind: 'offers',
      headline: champion ? 'They noticed' : 'Somebody called',
      line: champion
        ? 'A title gets a coach looked at by people a level above him.'
        : 'A season like that gets a coach a better job than the one he has.',
      offers,
    };
  }
  return {
    kind: 'stay',
    headline: 'Another year',
    line: ch.heat > 65
      ? 'Nobody is calling, and the board is running out of patience.'
      : 'Nobody is calling. Win, and they will.',
    offers: [],
  };
}
