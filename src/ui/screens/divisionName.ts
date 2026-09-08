import { CLASSES } from '../../data/teams';
import { LEVELS } from '../../data/levels';
import { conference } from '../../data/world';
import type { Career } from '../../league/types';

/**
 * What the coach's division is called, at any level. A high school class, a
 * college conference, or the professional league itself — one call site so no
 * screen has to know which it is.
 */
export function divisionName(career: Career): string {
  if (career.level === 'hs') return CLASSES[career.classKey].short;
  try {
    return conference(career.conferenceId).short;
  } catch {
    return LEVELS[career.level].short;
  }
}
