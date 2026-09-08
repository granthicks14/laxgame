import { load, save, removeRaw, readRaw, writeRaw } from '../core/storage';
import { CAREER_VERSION, type Career } from '../league/types';
import { tryGetTeam } from '../data/teams';
import { EMPTY_STAFF } from '../league/coaching';

const RETIRED_KEY = 'lsl.retiredSave';

/** Versions this build can read and upgrade in place. */
const MIGRATABLE = [4];

const key = (mode: 'season' | 'dynasty'): string => `lsl.career.${mode}.v${CAREER_VERSION}`;

/**
 * Fills in everything a newer build expects. Version 5 added the coach's
 * office, promotion and relegation, the transfer market and the development
 * report — all of which have sensible empty values, so an in-progress career
 * upgrades rather than being thrown away.
 */
function migrateCareer(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const c = raw as Record<string, unknown>;
  const version = typeof c.version === 'number' ? c.version : 0;
  if (version === CAREER_VERSION) return c;
  if (!MIGRATABLE.includes(version)) return c;

  if (!c.staff) c.staff = { ...EMPTY_STAFF };
  if (!c.classOverrides) c.classOverrides = {};
  if (c.lastMovement === undefined) c.lastMovement = null;
  if (!Array.isArray(c.market)) c.market = [];
  if (typeof c.pitchesLeft !== 'number') c.pitchesLeft = 0;
  if (!Array.isArray(c.lastDevelopment)) c.lastDevelopment = [];
  c.version = CAREER_VERSION;
  return c;
}

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
  // Look for this version first, then anything upgradable, so a career in
  // progress is carried forward instead of being lost to a version bump.
  let raw = load<unknown>(key(mode), null);
  if (!raw) {
    for (const v of MIGRATABLE) {
      const older = load<unknown>(`lsl.career.${mode}.v${v}`, null);
      if (older) { raw = migrateCareer(older); break; }
    }
  } else {
    raw = migrateCareer(raw);
  }
  if (!raw) return null;
  if (!isValidCareer(raw)) {
    console.warn(`[saves] discarding incompatible ${mode} save`);
    removeRaw(key(mode));
    return null;
  }
  // Persist under the current version so the upgrade only happens once.
  save(key(mode), raw);
  removeRaw(`lsl.career.${mode}.v${CAREER_VERSION - 1}`);
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
      if (MIGRATABLE.includes(v)) continue; // these are upgraded, not retired
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
