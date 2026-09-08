/**
 * The range of team ratings that exists at each level.
 *
 * This lives apart from both levels.ts (a table of constants) and world.ts (the
 * team registry) so that player generation can map a rating onto its level's
 * band without importing the whole world — and so the world can measure itself
 * and publish the answer here at startup.
 */
import type { Level } from './levels';

export interface LevelSpan {
  min: number;
  max: number;
  /** The AVERAGE team rating at this level, which is not the midpoint: most
   *  levels carry more good programmes than bad ones. Anything that asks "is
   *  this team better than its peers?" has to measure against the mean. */
  mean: number;
}

const spans = new Map<Level, LevelSpan>();

export function setLevelSpan(level: Level, span: LevelSpan): void {
  spans.set(level, span);
}

export function levelSpanOf(level: Level): LevelSpan {
  return spans.get(level) ?? { min: 40, max: 95, mean: 68 };
}
