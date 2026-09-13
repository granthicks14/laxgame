import type { SportModule } from '../registry';
import { HoopsMenuScreen } from '../../ui/screens/hoops/HoopsMenu';
import { BASKETBALL_CONTROLS } from './input';
import { BASKETBALL_SOUNDS } from './sounds';
import { loadSeason } from './season';

/**
 * HARDWOOD — basketball's entry point into the hub.
 *
 * Loaded on demand, like every sport: none of the engine, the AI, the league or
 * the renderer is downloaded by a player who came to the hub for lacrosse.
 */
export const BASKETBALL: SportModule = {
  menu: (app) => new HoopsMenuScreen(app),
  controls: BASKETBALL_CONTROLS,
  sounds: BASKETBALL_SOUNDS,
  init: () => {
    // Touch the season save once on the way in: a save this build cannot read is
    // discarded here, with a warning, rather than half-applied to a screen.
    try {
      loadSeason();
    } catch (err) {
      console.warn('[hoops] season save could not be read', err);
    }
  },
};
