/**
 * Resolves the Chromium the test scripts should drive.
 *
 * Playwright is not a dependency of this project, so the browser may come from
 * `npx playwright install` (Playwright finds it itself, hence `undefined`), from
 * CHROMIUM_PATH, or from a preinstalled build on the machine.
 */
import { existsSync } from 'node:fs';

const CANDIDATES = ['/opt/pw-browsers/chromium'];

export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return CANDIDATES.find((p) => existsSync(p)) ?? undefined;
}
