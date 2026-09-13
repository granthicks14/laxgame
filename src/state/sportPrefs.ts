import type { App } from '../ui/App';

/* ---------------------------------------------------------------------------
 * A SPORT'S OWN PREFERENCES
 * ---------------------------------------------------------------------------
 * Basketball's difficulty ladder is not lacrosse's, its quarter lengths are not
 * lacrosse's, and neither of them should have to pretend otherwise to share one
 * settings object. Each sport reads and writes its own bag, typed at the call
 * site by the fallback it passes in.
 * ------------------------------------------------------------------------- */

export function getPref<T extends string | number | boolean>(
  app: App, sport: string, key: string, fallback: T,
): T {
  const bag = app.settings.sports?.[sport];
  const value = bag?.[key];
  return (typeof value === typeof fallback ? value as T : fallback);
}

export function setPref(
  app: App, sport: string, key: string, value: string | number | boolean,
): void {
  const sports = { ...(app.settings.sports ?? {}) };
  sports[sport] = { ...(sports[sport] ?? {}), [key]: value };
  app.updateSettings({ sports });
}
