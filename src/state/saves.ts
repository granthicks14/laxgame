import { load, save, removeRaw, readRaw, writeRaw } from '../core/storage';
import { CAREER_VERSION, type Career, type CareerMode } from '../league/types';
import { tryGetTeam } from '../data/teams';
import { tryWorldTeam } from '../data/world';
import { EMPTY_STAFF } from '../league/coaching';
import { LEVELS, type Level } from '../data/levels';
import { DEFAULT_TIER } from '../challenge/difficulty';

const RETIRED_KEY = 'lsl.retiredSave';

/** Versions this build can read and upgrade in place. */
const MIGRATABLE = [4, 5, 6, 7, 8];

const key = (mode: CareerMode): string => `lsl.career.${mode}.v${CAREER_VERSION}`;

/**
 * Exported so `npm run abuse` can put a real old save through it: a migration
 * that quietly mangles a career is invisible until somebody loads a save they
 * have played for thirty seasons.
 *
 * Fills in everything a newer build expects. Version 5 added the coach's
 * office, promotion and relegation, the transfer market and the development
 * report; version 6 added the level system, so a career that predates it is a
 * high school career in its own district. All of them have sensible values, so
 * an in-progress career upgrades rather than being thrown away.
 */
export function migrateCareer(raw: unknown): unknown {
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
  if (!c.postseason) c.postseason = { clinchedSeen: false, titleSeen: false, revealed: 0 };
  // Added with the championship celebration. An older save that already won a
  // title simply sees it once, which is no worse than not seeing it at all.
  const post = c.postseason as { titleSeen?: boolean };
  if (post.titleSeen === undefined) post.titleSeen = false;

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
  // v7 -> v8: ONE RATING SCALE FOR THE WHOLE SPORT. Team ratings used to be a
  // standing within a level, so a Division III side could be rated 95 and a PLL
  // club 88. Every level now occupies a fixed slice of one universal scale
  // (levels.ts), which means every rating a save carries — the squad, the
  // players who left, the drift on other programmes — is written in units that
  // no longer exist. They are remapped here rather than thrown away, so a
  // career in progress keeps its squad, its stars and its relative strength.
  if (version <= 7) {
    const level = (typeof c.level === 'string' ? c.level : 'hs') as Level;
    rescaleSave(c, level);
  }
  // Challenge difficulty arrived with v8. Everything that came before it was
  // played on what is now the Standard tier, which is exactly what it was.
  const challenge = c.challenge as Record<string, unknown> | null | undefined;
  if (challenge && typeof challenge === 'object' && !challenge.tier) {
    challenge.tier = DEFAULT_TIER;
  }
  // v8 -> v9: the ladder went from four tiers to five and "Elite" was renamed.
  // A career played on Elite was played on what is now Hard — same modifiers,
  // same difficulty, different word — so it keeps its place rather than being
  // quietly promoted or demoted.
  if (challenge && challenge.tier === 'elite') challenge.tier = 'hard';

  c.version = CAREER_VERSION;
  return c;
}

/**
 * The player-attribute ranges each level used BEFORE the universal scale. Kept
 * here, in the migration, because this is the only place they still mean
 * anything — levels.ts must not carry two generations of numbers.
 */
const V7_BANDS: Record<Level, { lo: number; hi: number }> = {
  hs: { lo: 60, hi: 91 },
  d3: { lo: 62, hi: 93 },
  d2: { lo: 68, hi: 95 },
  d1: { lo: 74, hi: 99 },
  semipro: { lo: 78, hi: 97 },
  pll: { lo: 84, hi: 99 },
};

/**
 * Moves one rating from the old level-relative scale onto the universal one.
 *
 * Ratings outside the old band — a scrub on a bad team, a star on a good one —
 * are held to the same margins fresh generation uses rather than extrapolated
 * freely. Without that a player who was eight points below his level's floor
 * came out of the migration in the low teens, which is not a lacrosse player.
 */
function rescale(value: unknown, level: Level): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const from = V7_BANDS[level] ?? V7_BANDS.hs;
  const to = LEVELS[level]?.band ?? LEVELS.hs.band;
  const t = (value - from.lo) / Math.max(1, from.hi - from.lo);
  const mapped = to.lo + t * (to.hi - to.lo);
  return Math.max(1, Math.min(99, Math.round(
    Math.max(to.lo - 5, Math.min(to.hi + 3, mapped)),
  )));
}

const RESCALED_PLAYER_KEYS = ['overall', 'potential'];

/** Rewrites every rating a saved career carries onto the universal scale. */
function rescaleSave(c: Record<string, unknown>, level: Level): void {
  const player = (p: unknown) => {
    if (!p || typeof p !== 'object') return;
    const rec = p as Record<string, unknown>;
    for (const key of RESCALED_PLAYER_KEYS) {
      const next = rescale(rec[key], level);
      if (next !== undefined) rec[key] = next;
    }
    const attrs = rec.attrs as Record<string, unknown> | undefined;
    if (attrs && typeof attrs === 'object') {
      for (const key of Object.keys(attrs)) {
        const next = rescale(attrs[key], level);
        if (next !== undefined) attrs[key] = next;
      }
    }
    // A development history records where a rating came from and went to, and
    // both ends have to move with it or the report reads as a collapse.
    const dev = rec.dev as Record<string, unknown> | undefined;
    const history = dev?.history;
    if (Array.isArray(history)) {
      for (const entry of history) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        for (const key of ['from', 'to']) {
          const next = rescale(e[key], level);
          if (next !== undefined) e[key] = next;
        }
      }
    }
  };

  if (Array.isArray(c.roster)) c.roster.forEach(player);
  if (Array.isArray(c.market)) {
    for (const cand of c.market) {
      if (cand && typeof cand === 'object') player((cand as Record<string, unknown>).player);
    }
  }
  const recruiting = c.recruiting as Record<string, unknown> | null | undefined;
  if (recruiting && Array.isArray(recruiting.prospects)) {
    for (const p of recruiting.prospects) {
      if (!p || typeof p !== 'object') continue;
      const rec = p as Record<string, unknown>;
      player(rec.player);
      const hype = rescale(rec.hype, level);
      if (hype !== undefined) rec.hype = hype;
    }
  }

  // Drift the career has applied to other programmes' team ratings.
  const overrides = c.ratingOverrides as Record<string, Record<string, unknown>> | undefined;
  if (overrides && typeof overrides === 'object') {
    for (const row of Object.values(overrides)) {
      if (!row || typeof row !== 'object') continue;
      for (const key of Object.keys(row)) {
        // Chemistry was never on the rating scale — it is a percentage.
        if (key === 'chemistry') continue;
        const next = rescale(row[key], level);
        if (next !== undefined) row[key] = next;
      }
    }
  }
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
