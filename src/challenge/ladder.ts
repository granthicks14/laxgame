/* ---------------------------------------------------------------------------
 * THE LADDER
 * ---------------------------------------------------------------------------
 * Challenge Mode is one long coaching career that starts at the bottom of high
 * school lacrosse and finishes, if you are good enough and last long enough, in
 * the professional game.
 *
 * There are nine rungs. You do not move up by finishing well, by accumulating
 * points, or by waiting: you move up by WINNING THE CHAMPIONSHIP at your level,
 * and even then nothing is automatic. Winning gets you interviews. Which jobs
 * you are offered depends on the reputation you have built, and taking one is a
 * decision — the best programme that will have you is often the one with the
 * worst situation.
 *
 * Every rung is genuinely harder than the last, because the players are: see
 * data/levels.ts, where each tier maps its teams onto a higher band of actual
 * attributes. A coach who reaches the PLL is coaching men who are better than
 * anybody he has ever had, against seven other teams exactly like them.
 * ------------------------------------------------------------------------- */

import type { Level } from '../data/levels';
import { LEVELS } from '../data/levels';
import type { ClassKey } from '../data/teams';
import { CLASSES, TEAMS } from '../data/teams';
import { teamsAtLevel, type WorldTeam } from '../data/world';

export interface Stage {
  key: string;
  level: Level;
  /** High school rungs are classes inside the district. */
  classKey?: ClassKey;
  name: string;
  short: string;
  /** What this job actually feels like. */
  blurb: string;
  /** What you have to win to be considered for the next rung. */
  requirement: string;
  /** Roughly what a competent coach needs, for the expectations system. */
  parWinPct: number;
}

export const STAGES: Stage[] = [
  {
    key: 'hs-d',
    level: 'hs',
    classKey: 'd',
    name: 'Class D high school',
    short: 'Class D',
    blurb: 'The bottom of the district. Six players who have held a stick before and a field with no lines on it.',
    requirement: 'Win the Class D championship',
    parWinPct: 0.4,
  },
  {
    key: 'hs-c',
    level: 'hs',
    classKey: 'c-west',
    name: 'Class C high school',
    short: 'Class C',
    blurb: 'Real programmes with real problems. A win here means something to somebody.',
    requirement: 'Win a Class C championship',
    parWinPct: 0.45,
  },
  {
    key: 'hs-b',
    level: 'hs',
    classKey: 'b',
    name: 'Class B high school',
    short: 'Class B',
    blurb: 'Established schools, decent talent, and parents who have opinions.',
    requirement: 'Win the Class B championship',
    parWinPct: 0.5,
  },
  {
    key: 'hs-a',
    level: 'hs',
    classKey: 'a',
    name: 'Class A high school',
    short: 'Class A',
    blurb: 'The best high school lacrosse in Texas. College coaches are in the stands for somebody.',
    requirement: 'Win the Class A championship',
    parWinPct: 0.55,
  },
  {
    key: 'd3',
    level: 'd3',
    name: 'NCAA Division III',
    short: 'D-III',
    blurb: 'No scholarships, a hundred programmes and a bus. Everything here is coaching.',
    requirement: 'Win the D-III National Championship',
    parWinPct: 0.5,
  },
  {
    key: 'd2',
    level: 'd2',
    name: 'NCAA Division II',
    short: 'D-II',
    blurb: 'Scholarships, athletes and fewer nights off.',
    requirement: 'Win the D-II National Championship',
    parWinPct: 0.5,
  },
  {
    key: 'd1',
    level: 'd1',
    name: 'NCAA Division I',
    short: 'D-I',
    blurb: 'Full houses and national television. A winning season can still get you fired.',
    requirement: 'Win the D-I National Championship',
    parWinPct: 0.55,
  },
  {
    key: 'semipro',
    level: 'semipro',
    name: 'Continental Lacrosse League',
    short: 'CLL',
    blurb: 'Grown men with day jobs and unfinished business. Nobody here is here by accident.',
    requirement: 'Win the Continental Cup',
    parWinPct: 0.5,
  },
  {
    key: 'pll',
    level: 'pll',
    name: 'Premier Lacrosse League',
    short: 'PLL',
    blurb: 'Eight teams, the best players alive, and nowhere left to climb.',
    requirement: 'Win the PLL Championship',
    parWinPct: 0.5,
  },
];

export const FINAL_STAGE = STAGES.length - 1;

export function stageAt(index: number): Stage {
  return STAGES[Math.max(0, Math.min(FINAL_STAGE, index))];
}

export function stageByKey(key: string): Stage | null {
  return STAGES.find((s) => s.key === key) ?? null;
}

/** A short label for the tracker: "Rung 3 of 9 — Class B". */
export function stageLabel(index: number): string {
  return `${index + 1}/${STAGES.length} · ${stageAt(index).short}`;
}

/**
 * Programmes hiring at a rung. High school rungs use the district's own class
 * table; everything above uses the world registry. Class C is two divisions in
 * the real district, so the rung covers both.
 */
export function programmesAt(index: number): { id: string; name: string; short: string; prestige: number }[] {
  const stage = stageAt(index);
  if (stage.level === 'hs') {
    const keys: ClassKey[] = stage.classKey === 'c-west' ? ['c-west', 'c-east'] : [stage.classKey!];
    return TEAMS.filter((t) => keys.includes(t.classKey)).map((t) => ({
      id: t.id, name: t.name, short: t.short, prestige: t.overall,
    }));
  }
  return teamsAtLevel(stage.level).map((t: WorldTeam) => ({
    id: t.id, name: t.name, short: t.short, prestige: t.prestige,
  }));
}

/** Name of the division a high school rung plays in, for the UI. */
export function stageDivisionName(index: number): string {
  const stage = stageAt(index);
  if (stage.level !== 'hs') return LEVELS[stage.level].name;
  return stage.classKey === 'c-west' ? 'Class C' : CLASSES[stage.classKey!].name;
}
