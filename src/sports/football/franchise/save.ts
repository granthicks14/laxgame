import { teamOr } from '../nfl';
import { FRANCHISE_VERSION, type Franchise, type FranchiseMode } from './types';

/* ---------------------------------------------------------------------------
 * SAVING A FRANCHISE
 * ---------------------------------------------------------------------------
 * One slot per mode, in localStorage, and a version on the front of it.
 *
 * A save that cannot be read is DELETED rather than repaired. A franchise is
 * thirty seasons of somebody's time and a half-migrated one is worse than a
 * clean start: it fails later, somewhere stranger, and takes the thirty seasons
 * with it. So the rule is the same as the other two sports keep — read it,
 * check it, and if anything about it is wrong, say so and start again.
 * ------------------------------------------------------------------------- */

const KEY: Record<FranchiseMode, string> = {
  dynasty: 'lsl.gridiron.nfl.dynasty.v1',
  challenge: 'lsl.gridiron.nfl.challenge.v1',
};

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveFranchise(fr: Franchise): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY[fr.mode], JSON.stringify(fr));
  } catch (err) {
    console.warn('[gridiron] the franchise could not be saved', err);
  }
}

export function loadFranchise(mode: FranchiseMode): Franchise | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(KEY[mode]);
  if (!raw) return null;
  try {
    const fr = JSON.parse(raw) as Franchise;
    if (!looksRight(fr, mode)) {
      store.removeItem(KEY[mode]);
      return null;
    }
    return fr;
  } catch {
    store.removeItem(KEY[mode]);
    return null;
  }
}

/** The checks worth making: a wrong version, a missing club, an empty squad. */
function looksRight(fr: Franchise, mode: FranchiseMode): boolean {
  if (!fr || typeof fr !== 'object') return false;
  if (fr.version !== FRANCHISE_VERSION) return false;
  if (fr.mode !== mode) return false;
  if (!teamOr(fr.teamId)) return false;
  if (!Array.isArray(fr.roster) || fr.roster.length < 11) return false;
  if (!Array.isArray(fr.schedule)) return false;
  if (!fr.staff || !fr.staff.HC || !fr.staff.OC || !fr.staff.DC) return false;
  if (!fr.facilities) return false;
  return true;
}

export function deleteFranchise(mode: FranchiseMode): void {
  const store = storage();
  if (!store) return;
  store.removeItem(KEY[mode]);
}

export const hasFranchise = (mode: FranchiseMode): boolean => {
  const store = storage();
  return !!store && store.getItem(KEY[mode]) !== null;
};

/** The line the front menu shows on the Continue button. */
export function franchiseHeadline(fr: Franchise): string {
  const team = teamOr(fr.teamId);
  const s = fr.standings[fr.teamId];
  const record = s ? `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}` : '0-0';
  const rings = fr.championships
    ? ` · ${fr.championships} ${fr.championships === 1 ? 'title' : 'titles'}`
    : '';
  const where = fr.stage === 'offseason' ? 'offseason'
    : fr.stage === 'playoffs' ? 'playoffs'
      : `week ${Math.min(18, Math.max(1, (s?.wins ?? 0) + (s?.losses ?? 0) + (s?.ties ?? 0) + 1))}`;
  return `${team.city} ${team.name} · year ${fr.year}, ${where} · ${record}${rings}`;
}
