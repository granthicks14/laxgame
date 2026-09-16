import type { SportModule } from '../registry';
import { FootballMenuScreen } from '../../ui/screens/gridiron/FootballMenu';
import { FOOTBALL_CONTROLS } from './input';
import { FOOTBALL_SOUNDS } from './sounds';
import { allTeams } from './world';
import { LEVEL_ORDER, LEVELS } from './levels';

/**
 * GRIDIRON — football's entry point into the hub.
 *
 * Loaded on demand, like every sport: none of the engine, the AI, the world or
 * the renderer is downloaded by a player who came to the hub for lacrosse.
 */
export const FOOTBALL: SportModule = {
  menu: (app) => new FootballMenuScreen(app),
  controls: FOOTBALL_CONTROLS,
  sounds: FOOTBALL_SOUNDS,
  init: () => {
    /* THE PYRAMID HAS TO CLIMB, and this is the one place that can prove it
     * before a player is standing in it. A tier whose talent band sits level
     * with or below the one beneath it makes the whole climb meaningless, and a
     * warning here is a far better outcome than a career mode that quietly does
     * not mean anything. */
    try {
      let last = -Infinity;
      for (const level of LEVEL_ORDER) {
        const info = LEVELS[level];
        const low = info.par - info.spread / 2;
        if (low <= last) {
          console.warn(`[gridiron] ${level} does not sit above the tier below it`);
        }
        last = low;
      }
      const ids = new Set<string>();
      for (const t of allTeams()) {
        if (ids.has(t.id)) console.warn(`[gridiron] duplicate club id ${t.id}`);
        ids.add(t.id);
      }
    } catch (err) {
      console.warn('[gridiron] the world could not be checked', err);
    }
  },
};
