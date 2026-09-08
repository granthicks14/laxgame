/**
 * The range of team ratings that exists at each level.
 *
 * This lives apart from both levels.ts (a table of constants) and world.ts (the
 * team registry) so that player generation can map a rating onto its level's
 * band without importing the whole world — and so the world can measure itself
 * and publish the answer here at startup.
 */
import type { Level } from './levels';

const spans = new Map<Level, { min: number; max: number }>();

export function setLevelSpan(level: Level, span: { min: number; max: number }): void {
  spans.set(level, span);
}

export function levelSpanOf(level: Level): { min: number; max: number } {
  return spans.get(level) ?? { min: 40, max: 95 };
}
