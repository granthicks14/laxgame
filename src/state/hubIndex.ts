import { load, save } from '../core/storage';
import type { SportId } from '../sports/registry';

/* ---------------------------------------------------------------------------
 * WHAT THE HUB KNOWS ABOUT YOUR SAVES
 * ---------------------------------------------------------------------------
 * The hub offers to carry on where you left off, and it has to do that WITHOUT
 * loading any sport. Reading lacrosse's career saves means understanding
 * lacrosse's save format, its mode list and its version migrations — twenty
 * thousand lines the hub has no business downloading to draw one line of text.
 *
 * So a sport writes its own headline as it saves: a label, a detail line, and
 * when. The hub reads only that. The sport that owns the data is the only thing
 * that ever has to understand it, and the two can never disagree, because there
 * is no second interpretation of the save — just a note the sport left.
 * ------------------------------------------------------------------------- */

export interface SportProgress {
  sport: SportId;
  /** What mode it was. "Dynasty", "Season", "Challenge". */
  label: string;
  /** One line of specifics. "Cedar Park · Year 4 · 2 titles". */
  detail: string;
  /** Epoch millis, so the hub can offer the most recent thing you played. */
  at: number;
}

const KEY = 'lsl.hub.progress.v1';

type Index = Partial<Record<SportId, SportProgress>>;

const read = (): Index => {
  const raw = load<Index | null>(KEY, null);
  return raw && typeof raw === 'object' ? raw : {};
};

/** Called by a sport when it saves. Cheap, and safe to call often. */
export function noteProgress(sport: SportId, label: string, detail: string): void {
  const index = read();
  index[sport] = { sport, label, detail, at: Date.now() };
  save(KEY, index);
}

/** Called by a sport when the thing it noted no longer exists. */
export function clearProgress(sport: SportId): void {
  const index = read();
  if (!index[sport]) return;
  delete index[sport];
  save(KEY, index);
}

export function lastProgress(sport: SportId): SportProgress | null {
  const p = read()[sport];
  return p && typeof p.label === 'string' && typeof p.detail === 'string' ? p : null;
}

/** The single most recently played thing across every sport, if any. */
export function mostRecent(): SportProgress | null {
  let best: SportProgress | null = null;
  for (const p of Object.values(read())) {
    if (!p || typeof p.at !== 'number') continue;
    if (!best || p.at > best.at) best = p;
  }
  return best;
}
