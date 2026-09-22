import type { SportModule } from '../registry';
import { FootballMenuScreen } from '../../ui/screens/gridiron/FootballMenu';
import { FOOTBALL_CONTROLS } from './input';
import { FOOTBALL_SOUNDS } from './sounds';
import { CONFERENCES, DIVISION_NAMES, TEAMS, divisionsIn, teamsInDivision } from './nfl';

/**
 * GRIDIRON — football's entry point into the hub.
 *
 * Loaded on demand, like every sport: none of the engine, the AI, the league or
 * the renderer is downloaded by a player who came to the hub for lacrosse.
 */
export const FOOTBALL: SportModule = {
  menu: (app) => new FootballMenuScreen(app),
  controls: FOOTBALL_CONTROLS,
  sounds: FOOTBALL_SOUNDS,
  init: () => {
    /* THE LEAGUE HAS TO BE A LEAGUE, and this is the one place that can prove
     * it before a player is standing in it. Thirty-two clubs, eight divisions
     * of four, and no two sharing an id or a set of initials — because every
     * one of those is a bug that shows up as a fixture list that will not
     * schedule or a table with two rows for the same club in it. */
    try {
      if (TEAMS.length !== 32) console.warn(`[gridiron] ${TEAMS.length} clubs, expected 32`);
      for (const conference of CONFERENCES) {
        const divisions = divisionsIn(conference);
        if (divisions.length !== DIVISION_NAMES.length) {
          console.warn(`[gridiron] ${conference} has ${divisions.length} divisions`);
        }
        for (const d of divisions) {
          const n = teamsInDivision(d).length;
          if (n !== 4) console.warn(`[gridiron] ${d} has ${n} clubs`);
        }
      }
      const ids = new Set<string>();
      const abbrs = new Set<string>();
      for (const t of TEAMS) {
        if (ids.has(t.id)) console.warn(`[gridiron] duplicate club id ${t.id}`);
        if (abbrs.has(t.abbr)) console.warn(`[gridiron] duplicate abbreviation ${t.abbr}`);
        ids.add(t.id);
        abbrs.add(t.abbr);
      }
    } catch (err) {
      console.warn('[gridiron] the league could not be checked', err);
    }
  },
};
