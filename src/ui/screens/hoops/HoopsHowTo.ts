import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, topbar, panel } from '../../components';
import { bindingText } from '../../../state/keybinds';
import { setPref } from '../../../state/sportPrefs';
import { HOOPS_SPORT } from '../../../sports/basketball/settings';
import { HoopsSetupScreen } from './HoopsSetup';

/* ---------------------------------------------------------------------------
 * HOW BASKETBALL IS PLAYED HERE
 * ---------------------------------------------------------------------------
 * Short, and about the two things that are not obvious: the release window, and
 * the fact that the same two buttons do different jobs depending on whether you
 * have the ball.
 * ------------------------------------------------------------------------- */

export class HoopsHowToScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    setPref(app, HOOPS_SPORT, 'seenHowTo', true);
    const b = app.keybinds;
    const row = (k: string, what: string): HTMLElement =>
      h('div', { class: 'kv' },
        h('div', { class: 'kv__k', text: k }),
        h('div', { class: 'kv__v', text: what }));

    this.el = screenEl(
      topbar(app, 'How to play', 'Hardwood'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('The shot is a timing shot',
            h('div', {
              class: 'small',
              text: 'Hold shoot to gather. A bar appears under your player with a green '
                + 'window on it and a needle crossing it — let go inside the window. '
                + 'Dead centre is a perfect release and it is worth a lot of percentage; '
                + 'letting go early is short, holding too long is a heave.',
            }),
            h('div', {
              class: 'small',
              text: 'The window’s WIDTH is the shooter. A career shooter gives you a '
                + 'forgiving target; a centre gives you a sliver. Its position never '
                + 'moves, so it can be learned.',
            })),

          panel('With the ball, and without it',
            h('div', {
              class: 'small',
              text: 'The same two buttons do different jobs depending on who has the ball.',
            }),
            row(bindingText(b, 'pass'), 'With the ball: pass. On defence: reach in — and a reach that misses leaves you beaten, or called.'),
            row(`${bindingText(b, 'shoot')} (hold)`, 'With the ball: gather and shoot. On defence: go up, at the ball to block it or at the rim to rebound.'),
            row(bindingText(b, 'cross'), 'Crossover: a hard change of direction that beats a man who is leaning.'),
            row(bindingText(b, 'screen'), 'Call a big man up to set a screen for you.'),
            row(bindingText(b, 'switch'), 'Switch to the defender nearest the ball.'),
            row(`${bindingText(b, 'moveUp')} ${bindingText(b, 'moveLeft')} ${bindingText(b, 'moveDown')} ${bindingText(b, 'moveRight')}`, 'Move.'),
            row(bindingText(b, 'sprint'), 'Sprint — it costs stamina, and a tired shooter is a worse shooter.')),

          panel('What wins games',
            h('div', {
              class: 'small',
              text: 'An open shot is worth about ten points of percentage over a contested '
                + 'one, so the offence is about creating two feet of space rather than '
                + 'finding a hero. Drive when the lane is open — it draws help, and the '
                + 'man they left is now open. Get to the line: two free throws are worth '
                + 'more than most jump shots on the floor.',
            }),
            h('div', {
              class: 'small',
              text: 'On defence, stay between your man and the basket, and go up only when '
                + 'he does. Reaching in is how fouls happen, and six of them and you are out.',
            })),

          h('button', {
            class: 'btn btn--primary btn--block',
            text: 'Play a game',
            on: { click: () => app.replace((a) => new HoopsSetupScreen(a)) },
          }),
        ),
      ),
    );
  }
}
