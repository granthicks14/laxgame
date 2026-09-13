import { h } from '../dom';
import type { App, Screen } from '../App';
import { audio } from '../../audio/Audio';
import { SportSelectScreen } from './SportSelect';
import { SettingsScreen } from './Settings';
import { mostRecent } from '../../state/hubIndex';
import { playableSports, sportById } from '../../sports/registry';
import { leaveSportChrome } from '../hub';
import { enterSport } from './SportLoading';

/* ---------------------------------------------------------------------------
 * THE FRONT DOOR
 * ---------------------------------------------------------------------------
 * One screen, three ways out, in the order a returning player wants them: carry
 * on with the thing you were last playing, pick a sport, or change a setting.
 * A player who has never opened the hub sees no Continue and one obvious button.
 * ------------------------------------------------------------------------- */
export class HubTitleScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    // Arriving here from inside a sport means the sport's colours are still on
    // the document. Take them off before painting the hub.
    leaveSportChrome();

    const play = () => {
      audio.unlock();
      audio.startMusic();
      app.push((a) => new SportSelectScreen(a));
    };

    const recent = mostRecent();
    const recentSport = recent ? sportById(recent.sport) : null;
    const carryOn = recent && recentSport?.load ? { recent, sport: recentSport } : null;

    const count = playableSports().length;

    this.el = h('div', { class: 'screen' },
      h('div', { class: 'hub-title' },
        h('div', { class: 'hub-mark' },
          h('div', { class: 'hub-mark__star' }),
          h('div', { class: 'hub-mark__lone display', text: 'Lone Star' }),
          h('div', { class: 'hub-mark__sports display', text: 'SPORTS' }),
          h('div', { class: 'hub-mark__rule' }),
          h('div', {
            class: 'hub-mark__sub display',
            text: count === 1 ? 'One game, built properly' : `${count} games, built properly`,
          })),
        h('div', { class: 'hub-title__actions' },
          h('button', {
            class: 'btn btn--primary btn--block hub-play',
            text: 'Play Now',
            on: { click: play },
          }),
          carryOn
            ? h('button', {
              class: 'btn btn--block hub-continue',
              on: {
                click: () => {
                  audio.unlock();
                  audio.startMusic();
                  enterSport(app, carryOn.sport);
                },
              },
            },
              h('span', { class: 'hub-continue__label', text: `Continue ${carryOn.sport.name}` }),
              h('span', {
                class: 'hub-continue__detail',
                text: `${carryOn.recent.label} · ${carryOn.recent.detail}`,
              }))
            : null,
          h('button', {
            class: 'btn btn--block btn--ghost',
            text: 'Settings',
            on: { click: () => app.push((a) => new SettingsScreen(a)) },
          })),
        h('div', { class: 'hub-title__foot' },
          h('div', {
            text: 'Original games. Team and school names are used for flavour; players, '
              + 'ratings and results are fictional gameplay data.',
          })),
      ),
    );

    // Enter or Space starts, but ONLY while this screen is the one on screen.
    // A pushed-over screen keeps its listeners alive, and this one used to
    // follow the player into a live game: Space, bound here to Play Now and in
    // lacrosse to the faceoff clamp, threw them out of the match.
    this.onKey = (e: KeyboardEvent) => {
      if (!this.el.isConnected) return;
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      e.preventDefault();
      play();
    };
    this.listen();
  }

  private onKey: (e: KeyboardEvent) => void;
  private listening = false;

  private listen(): void {
    if (this.listening) return;
    window.addEventListener('keydown', this.onKey);
    this.listening = true;
  }

  suspend(): void {
    window.removeEventListener('keydown', this.onKey);
    this.listening = false;
  }

  destroy(): void {
    this.suspend();
  }

  resume(): void {
    leaveSportChrome();
    this.listen();
  }
}
