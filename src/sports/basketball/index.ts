import type { SportModule } from '../registry';
import { HoopsMenuScreen } from '../../ui/screens/hoops/HoopsMenu';
import { BASKETBALL_CONTROLS } from './input';
import { BASKETBALL_SOUNDS } from './sounds';
import { loadSeason } from './season';
import { loadHoopsCareer } from './career/save';

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
    /* Touch every save once on the way in: a save this build cannot read is
     * discarded here, with a warning, rather than half-applied to a screen three
     * taps later. Basketball has three of them now — a season and two careers —
     * and all of them are basketball's own keys. Nothing here can see, let alone
     * write, anything of lacrosse's. */
    try {
      loadSeason();
      loadHoopsCareer('dynasty');
      loadHoopsCareer('challenge');
    } catch (err) {
      console.warn('[hoops] a save could not be read', err);
    }
  },
};
