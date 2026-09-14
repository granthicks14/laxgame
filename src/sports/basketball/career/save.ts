import { load, removeRaw, save } from '../../../core/storage';
import { clearProgress, noteProgress } from '../../../state/hubIndex';
import { LEVELS } from '../levels';
import { worldTeam } from '../world';
import { rungLabel, rungOf } from './ladder';
import { HOOPS_CAREER_VERSION, type HoopsCareer, type HoopsCareerMode } from './types';

/* ---------------------------------------------------------------------------
 * SAVING A BASKETBALL CAREER
 * ---------------------------------------------------------------------------
 * Two slots, one per mode, and they live in a namespace of their own:
 *
 *   lsl.hoops.career.dynasty.v1
 *   lsl.hoops.career.challenge.v1
 *
 * THIS IS THE POINT OF THE FILE. Lacrosse's careers are at `lsl.career.<mode>.v9`
 * and have been since long before basketball existed. Two sports sharing one key
 * would mean starting a basketball dynasty silently destroys a thirty-season
 * lacrosse career, and no amount of care elsewhere would get it back. The two
 * sports share the storage helpers, the hub's progress index and nothing else.
 *
 * What is stored is what the career engine needs and not one byte more: the
 * coach's own roster, his results, his tree. Every other squad in the world is
 * derived from the club, the seed and the year (see league.ts), so a twenty-year
 * career weighs a few dozen kilobytes rather than a few megabytes.
 * ------------------------------------------------------------------------- */

const key = (mode: HoopsCareerMode): string =>
  `lsl.hoops.career.${mode}.v${HOOPS_CAREER_VERSION}`;

/** Everything a save has to have before this build will touch it. */
function looksLikeCareer(raw: unknown): raw is HoopsCareer {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Partial<HoopsCareer>;
  return typeof c.seed === 'number'
    && typeof c.teamId === 'string'
    && typeof c.level === 'string'
    && Array.isArray(c.roster)
    && Array.isArray(c.schedule)
    && !!c.coach
    && !!LEVELS[c.level as keyof typeof LEVELS];
}

export function loadHoopsCareer(mode: HoopsCareerMode): HoopsCareer | null {
  const raw = load<unknown>(key(mode), null);
  if (!looksLikeCareer(raw)) return null;
  // A club that no longer exists means the world changed under the save. Refusing
  // it is better than loading a career that cannot draw its own header.
  try {
    worldTeam(raw.teamId);
  } catch {
    return null;
  }
  return raw;
}

export const hasHoopsCareer = (mode: HoopsCareerMode): boolean =>
  loadHoopsCareer(mode) !== null;

/** One line for the menu and for the hub's "carry on" button. */
export function careerHeadline(career: HoopsCareer): string {
  const team = worldTeam(career.teamId);
  const bits = [team.abbr, `Year ${career.year}`];
  if (career.mode === 'challenge' && career.challenge) {
    bits.push(rungLabel(career.challenge.rungIndex));
  } else {
    bits.push(LEVELS[career.level].short);
  }
  if (career.championships > 0) {
    bits.push(`${career.championships} title${career.championships === 1 ? '' : 's'}`);
  }
  return bits.join(' · ');
}

export function saveHoopsCareer(career: HoopsCareer): boolean {
  const ok = save(key(career.mode), career);
  if (ok) {
    noteProgress(
      'basketball',
      career.mode === 'challenge' ? 'Challenge' : 'Dynasty',
      careerHeadline(career),
    );
  }
  return ok;
}

export function deleteHoopsCareer(mode: HoopsCareerMode): void {
  removeRaw(key(mode));
  if (!hasHoopsCareer('dynasty') && !hasHoopsCareer('challenge')) {
    clearProgress('basketball');
  }
}

/** Where a career sits on the ladder, for the menu line. */
export const careerRung = (career: HoopsCareer): number =>
  career.challenge?.rungIndex ?? rungOf(career.level);
