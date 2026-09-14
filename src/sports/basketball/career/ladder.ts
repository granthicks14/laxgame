import { LEVELS, LEVEL_ORDER, type HoopsLevel } from '../levels';
import { teamsAtLevel } from '../world';

/* ---------------------------------------------------------------------------
 * THE CLIMB
 * ---------------------------------------------------------------------------
 * Challenge Mode is one coaching career that starts in a school gym with twelve
 * boys and finishes, if you are good enough and last long enough, in the
 * professional league.
 *
 * NINE RUNGS. You do not move up by finishing well, by accumulating points or by
 * waiting: you move up by WINNING THE CHAMPIONSHIP at your level, and even then
 * nothing is automatic. Winning gets you interviews. Which jobs you are offered
 * depends on the reputation you have built, and taking one is a decision — the
 * best programme that will have you is usually the one in the deepest trouble.
 *
 * Every rung is genuinely harder than the last because the PLAYERS are: see
 * levels.ts, where each tier maps onto a higher band of real attributes, and
 * `npm run hoops-world`, which fails the build if that hierarchy ever bends.
 * ------------------------------------------------------------------------- */

export interface Rung {
  key: string;
  level: HoopsLevel;
  name: string;
  short: string;
  /** What this job actually feels like. */
  blurb: string;
  /** What you have to win to be considered for the next rung. */
  requirement: string;
  /** Roughly what a competent coach needs, for the expectations system. */
  parWinPct: number;
}

/**
 * What a competent coach wins at each rung.
 *
 * It climbs, because the competition does: a .500 season in a high school
 * district is a bad year and a .500 season in the professional league is a
 * playoff team. This is the mode's main PACE lever — see `npm run hoops-career`,
 * which reports how long a whole climb actually takes.
 */
const PAR: Record<HoopsLevel, number> = {
  'hs-small': 0.42,
  'hs-big': 0.46,
  juco: 0.48,
  d3: 0.5,
  d2: 0.5,
  'd1-mid': 0.52,
  'd1-high': 0.55,
  dev: 0.5,
  pro: 0.5,
};

export const RUNGS: Rung[] = LEVEL_ORDER.map((level) => {
  const info = LEVELS[level];
  return {
    key: level,
    level,
    name: info.name,
    short: info.short,
    blurb: info.blurb,
    requirement: `Win the ${info.trophy}`,
    parWinPct: PAR[level],
  };
});

function parFor(level: HoopsLevel): number {
  return PAR[level];
}

export const FINAL_RUNG = RUNGS.length - 1;

export const rungAt = (i: number): Rung =>
  RUNGS[Math.max(0, Math.min(FINAL_RUNG, i))];

export const rungOf = (level: HoopsLevel): number => LEVEL_ORDER.indexOf(level);

/** "Rung 3 of 9 — JUCO". */
export const rungLabel = (i: number): string =>
  `${i + 1}/${RUNGS.length} · ${rungAt(i).short}`;

/** Programmes hiring at a rung. */
export function programmesAt(i: number): {
  id: string; name: string; short: string; standing: number;
}[] {
  return teamsAtLevel(rungAt(i).level).map((t) => ({
    id: t.id,
    name: `${t.city} ${t.name}`,
    short: t.abbr,
    standing: t.standing,
  }));
}

export { parFor };

/* --------------------------------------------------------------- chapters */

/**
 * Nine rungs but three CHAPTERS, and crossing between them is the moment the
 * career changes shape: schoolboys become recruited students, and students
 * become professionals who are paid to be there.
 *
 * Winning the last rung of a chapter completes that chapter. It does NOT end the
 * career. There is exactly one ending, and it is the professional league.
 */
export type Chapter = 'school' | 'college' | 'professional';

export interface ChapterInfo {
  key: Chapter;
  name: string;
  /** Rung indices, inclusive. */
  from: number;
  to: number;
  headline: string;
  blurb: string;
  /** What the next chapter is called on the job screen. */
  nextName: string;
}

export const CHAPTERS: ChapterInfo[] = [
  {
    key: 'school',
    name: 'School',
    from: 0,
    to: 1,
    headline: 'School basketball is behind you',
    blurb: 'You have won everything a high school gym has to offer. '
      + 'The college game is a different job.',
    nextName: 'College basketball',
  },
  {
    key: 'college',
    name: 'College',
    from: 2,
    to: 6,
    headline: 'College chapter complete',
    blurb: 'You have won at every level of the college game. '
      + 'What is left is professional basketball.',
    nextName: 'The professional game',
  },
  {
    key: 'professional',
    name: 'Professional',
    from: 7,
    to: 8,
    headline: 'The climb is over',
    blurb: 'There is nothing above this.',
    nextName: '',
  },
];

export const chapterOf = (i: number): ChapterInfo =>
  CHAPTERS.find((c) => i >= c.from && i <= c.to) ?? CHAPTERS[0];

/** True when winning at this rung finishes a chapter and opens the next. */
export function completesChapter(i: number): boolean {
  const c = chapterOf(i);
  return i === c.to && c.key !== 'professional';
}
