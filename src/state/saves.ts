import { load, save, removeRaw, readRaw, writeRaw } from '../core/storage';
import { CAREER_VERSION, type Career } from '../league/types';
import { tryGetTeam } from '../data/teams';

const RETIRED_KEY = 'lsl.retiredSave';

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

/**
 * Saves from older league structures cannot be migrated — team ids and the
 * class system both changed — but they should not vanish without explanation.
 * Called once at startup; the menu shows the notice and clears it.
 */
export function retireOldSaves(): void {
  const found: string[] = [];
  for (const mode of ['season', 'dynasty'] as const) {
    for (let v = 1; v < CAREER_VERSION; v++) {
      const oldKey = `lsl.career.${mode}.v${v}`;
      if (readRaw(oldKey) !== null) {
        removeRaw(oldKey);
        if (!found.includes(mode)) found.push(mode);
      }
    }
  }
  if (found.length) writeRaw(RETIRED_KEY, found.join(','));
}

/** Returns and clears the "your old save was retired" notice, if there is one. */
export function takeRetiredNotice(): string[] | null {
  const raw = readRaw(RETIRED_KEY);
  if (!raw) return null;
  removeRaw(RETIRED_KEY);
  return raw.split(',').filter(Boolean);
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
