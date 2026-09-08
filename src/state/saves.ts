import { load, save, removeRaw, readRaw, writeRaw } from '../core/storage';
import { CAREER_VERSION, type Career, type CareerMode } from '../league/types';
import { tryGetTeam } from '../data/teams';
import { tryWorldTeam } from '../data/world';
import { EMPTY_STAFF } from '../league/coaching';

const RETIRED_KEY = 'lsl.retiredSave';

/** Versions this build can read and upgrade in place. */
const MIGRATABLE = [4, 5, 6];

const key = (mode: CareerMode): string => `lsl.career.${mode}.v${CAREER_VERSION}`;

/**
 * Fills in everything a newer build expects. Version 5 added the coach's
 * office, promotion and relegation, the transfer market and the development
 * report; version 6 added the level system, so a career that predates it is a
 * high school career in its own district. All of them have sensible values, so
 * an in-progress career upgrades rather than being thrown away.
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
  if (!Array.isArray(c.portalOut)) c.portalOut = [];
  if (typeof c.pitchesLeft !== 'number') c.pitchesLeft = 0;
  if (!Array.isArray(c.lastDevelopment)) c.lastDevelopment = [];

  // v5 -> v6: the world gained five levels above high school. Every existing
  // career is a high school one, and its "conference" is its own class.
  if (typeof c.level !== 'string') c.level = 'hs';
  if (typeof c.conferenceId !== 'string') {
    const team = typeof c.teamId === 'string' ? tryGetTeam(c.teamId) : null;
    c.conferenceId = team ? team.classKey : 'a';
  }
  if (c.nationalSeeds === undefined) c.nationalSeeds = null;
  if (!Array.isArray(c.autoBids)) c.autoBids = [];
  // The recruiting class opens on the next offseason for an upgraded save.
  if (c.recruiting === undefined) c.recruiting = null;
  if (c.challenge === undefined) c.challenge = null;
  // The coach's profile is built on first use from what the career already has,
  // so an upgrade tree bought before this existed is not lost.
  if (c.coach === undefined) c.coach = null;
  if (!c.postseason) c.postseason = { clinchedSeen: false, revealed: 0 };

  // v6 -> v7: standings carry a conference split as well as the overall record.
  // A v6 save counted only conference games, so the overall record is rebuilt
  // from the schedule when the career loads — see validateRecords.
  const rows = c.standings as Record<string, Record<string, number>> | undefined;
  if (rows) {
    for (const row of Object.values(rows)) {
      if (typeof row.confWins !== 'number') row.confWins = row.wins ?? 0;
      if (typeof row.confLosses !== 'number') row.confLosses = row.losses ?? 0;
      if (typeof row.confTies !== 'number') row.confTies = row.ties ?? 0;
    }
  }
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
    // ANY team in the world, not only the forty high schools. Checking the
    // district alone destroyed every Challenge career the moment it took a
    // college job: the save failed validation on the next load and was thrown
    // away, which reads exactly like the game ending your career.
    !!(tryWorldTeam(x.teamId) ?? tryGetTeam(x.teamId)) &&
    Array.isArray(x.schedule) &&
    Array.isArray(x.roster) &&
    x.roster.length > 0 &&
    !!x.standings
  );
}

export function loadCareer(mode: CareerMode): Career | null {
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
  for (const mode of ['season', 'dynasty', 'challenge'] as const) {
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

export function deleteCareer(mode: CareerMode): void {
  removeRaw(key(mode));
}

export function hasCareer(mode: CareerMode): boolean {
  return loadCareer(mode) !== null;
}
