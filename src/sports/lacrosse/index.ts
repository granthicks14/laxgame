import type { SportModule } from '../registry';
import { MainMenuScreen } from '../../ui/screens/MainMenu';
import { validateLeague } from '../../data/teams';
import { retireOldSaves } from '../../state/saves';
import { LACROSSE_CONTROLS } from './controls';
import { LACROSSE_SOUNDS } from './sounds';

/**
 * LACROSSE — the hub's reference game, and its entry point.
 *
 * Importing this file pulls in the whole lacrosse game: the match engine, the
 * career, recruiting, the transfer portal, the challenge ladder. That is exactly
 * why the registry reaches it through a dynamic import — nothing here is
 * downloaded until a player chooses lacrosse.
 */
export const LACROSSE: SportModule = {
  menu: (app) => new MainMenuScreen(app),
  controls: LACROSSE_CONTROLS,
  sounds: LACROSSE_SOUNDS,
  init: () => {
    // Old-format saves cannot be migrated across the league restructure; retire
    // them explicitly so the menu can say what happened.
    try {
      retireOldSaves();
    } catch (err) {
      console.warn('[saves] could not retire old saves', err);
    }
    // Surface league data problems (duplicate ids, dangling rivals, thin
    // classes) in the console rather than letting them turn into odd behaviour
    // later. Both of these used to run at boot, which meant every player who
    // opened the hub downloaded the entire lacrosse league to check it.
    try {
      const problems = validateLeague();
      if (problems.length) console.warn('[league] data problems:\n - ' + problems.join('\n - '));
    } catch (err) {
      console.warn('[league] validation failed', err);
    }
  },
};
