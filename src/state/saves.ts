import { load, save, removeRaw } from '../core/storage';
import { CAREER_VERSION, type Career } from '../league/types';
import { tryGetTeam } from '../data/teams';

const key = (mode: 'season' | 'dynasty'): string => `lsl.career.${mode}.v${CAREER_VERSION}`;

/** Basic structural validation so a corrupt or outdated save never white-screens. */
function isValidCareer(c: unknown): c is Career {
  if (!c || typeof c !== 'object') return false;
  const x = c as Partial<Career>;
  return (
    x.version === CAREER_VERSION &&
    typeof x.teamId === 'string' &&
    !!tryGetTeam(x.teamId) &&
    Array.isArray(x.schedule) &&
    Array.isArray(x.roster) &&
    x.roster.length > 0 &&
    !!x.standings
  );
}

export function loadCareer(mode: 'season' | 'dynasty'): Career | null {
  const raw = load<unknown>(key(mode), null);
  if (!raw) return null;
  if (!isValidCareer(raw)) {
    console.warn(`[saves] discarding incompatible ${mode} save`);
    removeRaw(key(mode));
    return null;
  }
  return raw;
}

export function saveCareer(career: Career): boolean {
  return save(key(career.mode), career);
}

export function deleteCareer(mode: 'season' | 'dynasty'): void {
  removeRaw(key(mode));
}

export function hasCareer(mode: 'season' | 'dynasty'): boolean {
  return loadCareer(mode) !== null;
}
