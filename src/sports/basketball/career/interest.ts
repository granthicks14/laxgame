import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/math';
import { LEVELS, LEVEL_ORDER, type HoopsLevel } from '../levels';
import { teamsAtLevel, worldTeam } from '../world';
import { coachLevel } from './coach';
import { standingOf } from './league';
import type { HoopsCareer } from './types';

/* ---------------------------------------------------------------------------
 * SOMEBODY ELSE WANTS YOU
 * ---------------------------------------------------------------------------
 * The one thing a Dynasty was missing, and it is the thing that makes a twenty
 * year career a career rather than twenty seasons.
 *
 * WHY THIS AND NOT PROMOTION. The lacrosse dynasty moves the TEAM: a district
 * has classes, a class has a bottom, and the bottom is relegated. Basketball's
 * pyramid is not a set of divisions, it is a set of TIERS OF THE SPORT — a high
 * school does not get promoted into Division I however many games it wins, and
 * pretending it could would be the exact "renamed lacrosse" the brief rules out.
 * What actually happens in basketball is that the coach moves: win at a small
 * school and a big one calls; win there and a college calls. So the ladder is the
 * same ladder, and the thing that climbs it is the coach's name.
 *
 * NOTHING IS STORED. An approach is derived from the résumé and the year, so the
 * same career offers the same jobs every time it is asked, a save written before
 * this existed grows the feature the moment it is loaded, and there is no state
 * that can rot. Accepting one is the only thing that writes anything down.
 *
 * WHAT MOVES WITH HIM is the coach: the tree, the points, the record, the wall of
 * alumni, every statistic he has ever accumulated. What does not is the club. That
 * division is the whole point — a coach's fourth job should feel like a promotion
 * and an empty locker room at the same time.
 * ------------------------------------------------------------------------- */

export interface Approach {
  teamId: string;
  /** How it reads on the screen. */
  club: string;
  abbr: string;
  level: HoopsLevel;
  levelName: string;
  /** Where the club sits in the world today. */
  standing: number;
  /** Why they are calling. */
  pitch: string;
  /** True when it is a step up the pyramid rather than sideways. */
  stepUp: boolean;
}

/**
 * How strong the coach's name is, 0..100.
 *
 * Built from what he has actually done, in the order a search committee would
 * weigh it: trophies first, then whether he wins more than he loses, then how
 * long he has been doing it, then the standing of the programme he did it at —
 * because winning eighty per cent at a blue blood is not the same achievement as
 * winning sixty at a school nobody has heard of.
 */
export function resume(career: HoopsCareer): number {
  const c = career.coach;
  const games = c.careerWins + c.careerLosses;
  const pct = games > 0 ? c.careerWins / games : 0;

  const trophies = Math.min(40, c.championships * 13);
  const winning = clamp((pct - 0.5) * 120, -25, 30);
  const longevity = Math.min(14, c.seasons * 1.4);
  const grade = Math.min(10, coachLevel(c) * 0.9);
  /* Doing it from below counts for MORE, not less: a run at a bottom-half
   * programme is the résumé line that gets a coach a bigger job. */
  const here = standingOf(career, career.teamId);
  const degree = clamp((60 - here) / 6, -4, 8);

  return clamp(trophies + winning + longevity + grade + degree, 0, 100);
}

/** The résumé in words, for the screen. */
export function resumeLabel(score: number): string {
  if (score >= 82) return 'Every job in the sport is open to him';
  if (score >= 66) return 'A name programmes chase';
  if (score >= 50) return 'A coach on the way up';
  if (score >= 34) return 'Known in his own league';
  if (score >= 18) return 'Building a record';
  return 'Nobody outside the building has heard of him';
}

/** The level above, or null at the top of the sport. */
function levelAbove(level: HoopsLevel): HoopsLevel | null {
  const i = LEVEL_ORDER.indexOf(level);
  return i >= 0 && i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i + 1] : null;
}

/**
 * Who is calling this offseason.
 *
 * THE BAR RISES WITH THE PRIZE. A club only calls a coach whose name clears its
 * own standing, so the first approach a young coach gets is from somewhere barely
 * better than where he is, and the top of the sport does not call until he has won
 * something. A step up the pyramid costs more still — the résumé has to clear the
 * new level's own par as well as the club's standing, which is why nobody goes
 * from a small high school to a professional bench in three years.
 */
export function approachesFor(career: HoopsCareer, limit = 3): Approach[] {
  // Challenge has its own job market, with its own rules and its own stakes.
  if (career.mode !== 'dynasty') return [];
  const score = resume(career);
  if (score < 26) return [];

  const rng = new Rng(`hoops:interest:${career.seed}:${career.year}`);
  const mine = standingOf(career, career.teamId);
  const up = levelAbove(career.level);
  const out: Approach[] = [];

  const consider = (level: HoopsLevel, stepUp: boolean): void => {
    const info = LEVELS[level];
    /* A HIGHER TIER IS A HIGHER BAR, and it is the tier's own talent band that
     * sets it: stepping into Division I is a different ask from stepping into
     * a bigger high school, and the pyramid should be felt rather than stated. */
    const tierBar = stepUp ? (info.par - 40) * 1.5 : 0;
    for (const t of teamsAtLevel(level)) {
      if (t.id === career.teamId) continue;
      const theirs = standingOf(career, t.id);
      // Sideways moves only ever go UP in standing; there is no reason to take
      // a job at a worse programme in the same league.
      if (!stepUp && theirs <= mine + 6) continue;
      if (score < theirs * 0.72 + tierBar) continue;
      /* NOT EVERY QUALIFYING JOB IS OPEN. A club with a coach in it is not
       * looking, and which clubs are looking is a fact about the year. */
      if (!rng.bool(0.16)) continue;
      out.push({
        teamId: t.id,
        club: `${t.city} ${t.name}`,
        abbr: t.abbr,
        level,
        levelName: info.name,
        standing: Math.round(theirs),
        pitch: pitchFor(theirs, stepUp, career),
        stepUp,
      });
    }
  };

  consider(career.level, false);
  if (up) consider(up, true);

  /* Best first, and a step up outranks a sideways move of the same standing —
   * the pyramid is the progression. */
  return out
    .sort((a, b) => (Number(b.stepUp) - Number(a.stepUp)) || (b.standing - a.standing))
    .slice(0, limit);
}

function pitchFor(standing: number, stepUp: boolean, career: HoopsCareer): string {
  const titles = career.championships;
  if (stepUp && standing >= 78) {
    return 'They have the budget, the building and no patience whatsoever.';
  }
  if (stepUp) {
    return 'A step up the sport. Nobody here will know who you are on day one.';
  }
  if (standing >= 80) {
    return titles > 0
      ? 'They want the man who won it, and they expect him to win it again.'
      : 'A blue blood with an opening. They will not wait long for results.';
  }
  if (standing >= 62) return 'A serious programme that thinks it should be better.';
  return 'More resources than you have, and a board that has seen your record.';
}

/** What the coach would be walking into, in words, for the screen. */
export function approachSummary(a: Approach): string {
  const t = worldTeam(a.teamId);
  const bits = [
    `${a.levelName}`,
    `standing ${a.standing}`,
    `coaching ${t.coaching}`,
  ];
  return bits.join(' · ');
}
