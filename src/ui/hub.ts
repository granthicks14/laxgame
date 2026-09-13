import { audio, UI_SOUNDS } from '../audio/Audio';
import { h } from './dom';
import type { App } from './App';
import {
  applySportTheme, type SportManifest, type SportModule, type SportTheme,
} from '../sports/registry';

/* ---------------------------------------------------------------------------
 * ENTERING AND LEAVING A SPORT
 * ---------------------------------------------------------------------------
 * Three things change when the player crosses from the hub into a sport, and
 * they have to change together or the seams show: the colours on screen, which
 * control scheme the input manager and the rebinding UI are talking about, and
 * which sound pack the audio engine plays from. One function does all three, so
 * no screen can half-enter a sport — and one undoes them, so leaving cannot
 * leave basketball's orange on the hub.
 * ------------------------------------------------------------------------- */

/** Hub colours: the shared identity, before any sport has claimed the screen. */
export const HUB_THEME: SportTheme = {
  accent: '#ffc53d',
  accentInk: '#1a1200',
  surface: '#2f7d42',
  surfaceLine: '#68b183',
  backdrop: '#090d12',
};

export function enterSportChrome(app: App, sport: SportManifest, mod: SportModule): void {
  applySportTheme(sport.theme, sport.id);
  app.setScheme(mod.controls);
  audio.usePack(mod.sounds);
}

/** Back to the hub: drop the sport's colours and its sounds. */
export function leaveSportChrome(): void {
  applySportTheme(null, null);
  audio.usePack(UI_SOUNDS);
}

/**
 * The control every sport's front screen carries, so the way back to the hub is
 * never a question of how deep the screen stack happens to be. Lacrosse resets
 * its own stack when a season ends; without this that would strand the player
 * inside one sport.
 */
export function hubButton(onHub: () => void): HTMLElement {
  return h('button', {
    class: 'btn btn--icon btn--ghost hub-back',
    ariaLabel: 'Back to the sports hub',
    title: 'Sports hub',
    text: '⌂',
    on: { click: onHub },
  });
}
