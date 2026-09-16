import { load, removeRaw, save } from '../../../core/storage';
import { clearProgress, noteProgress } from '../../../state/hubIndex';
import { LEVELS } from '../levels';
import { worldTeam } from '../world';
import { FOOTBALL_CAREER_VERSION, type FootballCareer, type FootballCareerMode } from './types';

/* ---------------------------------------------------------------------------
 * SAVING A FOOTBALL CAREER
 * ---------------------------------------------------------------------------
 * Two slots, one per mode, in a namespace of football's own:
 *
 *   lsl.gridiron.career.dynasty.v1
 *   lsl.gridiron.career.challenge.v1
 *
 * THAT IS THE POINT OF THE FILE. Lacrosse's careers live at `lsl.career.<mode>`
 * and basketball's at `lsl.hoops.career.<mode>`, and they have since long before
 * football existed. Three sports sharing one key would mean starting a football
 * dynasty silently destroys a thirty-season lacrosse career, and no amount of
 * care anywhere else would get it back. The three sports share the storage
 * helpers and the hub's progress index, and nothing else.
 * ------------------------------------------------------------------------- */

const key = (mode: FootballCareerMode): string =>
  `lsl.gridiron.career.${mode}.v${FOOTBALL_CAREER_VERSION}`;

/** Everything a save must have before this build will touch it. */
function looksLikeCareer(raw: unknown): raw is FootballCareer {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Partial<FootballCareer>;
  return typeof c.seed === 'number'
    && typeof c.teamId === 'string'
    && typeof c.level === 'string'
    && Array.isArray(c.roster)
    && Array.isArray(c.schedule)
    && !!c.coach
    && !!LEVELS[c.level as keyof typeof LEVELS];
}

export function loadFootballCareer(mode: FootballCareerMode): FootballCareer | null {
  const raw = load<unknown>(key(mode), null);
  if (!looksLikeCareer(raw)) return null;
  // A club that no longer exists means the world changed under the save.
  if (!worldTeam(raw.teamId)) return null;

  /* Fields added after a save was written. There is one version so far and no
   * migration to speak of, but a career that has been sitting in a browser since
   * before a field existed must not arrive with it undefined — that is the kind
   * of hole that shows up as a blank screen three taps later. */
  const c = raw as FootballCareer & Record<string, unknown>;
  if (!Array.isArray(c.history)) c.history = [];
  if (!Array.isArray(c.alumni)) c.alumni = [];
  if (!Array.isArray(c.recruits)) c.recruits = [];
  if (!Array.isArray(c.market)) c.market = [];
  if (!Array.isArray(c.lastDepartures)) c.lastDepartures = [];
  if (!Array.isArray(c.lastDevelopment)) c.lastDevelopment = [];
  if (!Array.isArray(c.postseason)) c.postseason = [];
  if (!c.careerStats) c.careerStats = {};
  if (!c.season) c.season = {};
  if (!c.standingDrift) c.standingDrift = {};
  if (c.gameLength === undefined) c.gameLength = null;
  return c;
}

export const hasFootballCareer = (mode: FootballCareerMode): boolean =>
  loadFootballCareer(mode) !== null;

/** One line for the menu and for the hub's "carry on" button. */
export function careerHeadline(career: FootballCareer): string {
  const team = worldTeam(career.teamId);
  const bits = [team?.abbr ?? '??', `Year ${career.year}`, LEVELS[career.level].short];
  if (career.championships > 0) {
    bits.push(`${career.championships} title${career.championships === 1 ? '' : 's'}`);
  }
  return bits.join(' · ');
}

export function saveFootballCareer(career: FootballCareer): boolean {
  const ok = save(key(career.mode), career);
  if (ok) {
    noteProgress(
      'football',
      career.mode === 'challenge' ? 'Challenge' : 'Dynasty',
      careerHeadline(career),
    );
  }
  return ok;
}

export function deleteFootballCareer(mode: FootballCareerMode): void {
  removeRaw(key(mode));
  if (!hasFootballCareer('dynasty') && !hasFootballCareer('challenge')) {
    clearProgress('football');
  }
}
