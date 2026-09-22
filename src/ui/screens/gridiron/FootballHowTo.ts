import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl, topbar, panel } from '../../components';
import { setPref } from '../../../state/sportPrefs';
import { FOOTBALL_SPORT } from '../../../sports/football/settings';

/* ---------------------------------------------------------------------------
 * HOW TO PLAY
 * ---------------------------------------------------------------------------
 * Football asks more of a first-time player than the other two sports do,
 * because it asks a question — what are we running — before anything moves. This
 * screen exists to answer the five things that are genuinely not guessable:
 * that you play offence and COACH defence, what the number on a play call
 * means, how to throw, what the two coloured lines on the grass are, and what
 * the franchise underneath all of it is.
 * ------------------------------------------------------------------------- */

export class FootballHowToScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    setPref(app, FOOTBALL_SPORT, 'seenHowTo', true);

    const step = (n: string, title: string, ...body: (HTMLElement | string)[]) =>
      panel(`${n} — ${title}`, ...body.map((b) => (typeof b === 'string'
        ? h('div', { class: 'small', text: b }) : b)));

    this.el = screenEl(
      topbar(app, 'How to play', 'Five things, and then you know the game'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          step('1', 'You play offence. You coach defence.',
            'When your side has the ball you call the play and you play it. When '
            + 'they have it, your eleven play it out on their own ratings, your '
            + 'coordinator\u2019s coaching and the plan you set — press and blitz, '
            + 'sit back, or somewhere between. You are never asked to steer a safety.',
            'A defensive series runs on fast-forward, and there is a button to skip '
            + 'straight to the end of it. What happens in it is real football, played '
            + 'by your actual defence.'),
          step('2', 'Calling a play',
            'Between downs the game stops and asks what you are running. Every play '
            + 'says what it trades: a run is safe and slow, a deep shot wins the game '
            + 'and gets you sacked.',
            'The number on the right is how many SECONDS the play needs before it is '
            + 'there. Your line holds a rush for about two. A play that needs three is '
            + 'a play you are betting on.'),
          step('3', 'Throwing',
            'On a phone: tap the receiver you want. The rings on the field are the '
            + 'buttons.',
            'On a keyboard: aim with the arrow keys and throw. A yellow line shows who '
            + 'the ball would go to before you commit.',
            'A high-rated quarterback puts it closer to where he aimed and sees more of '
            + 'the field. He will not read the defence for you.'),
          step('4', 'The two lines on the grass',
            'The blue line is where the ball is. The yellow line is where it has to get '
            + 'to for a first down. Four tries to reach it, or you give the ball back.'),
          step('5', 'And then the franchise',
            'Dynasty is one club for as long as you like: the cap, the draft, free '
            + 'agency, a coaching staff and five buildings worth investing in. '
            + 'Challenge is the same game with an owner who has a number in his head.',
            'The clubs are the ones you know. Every player in them is invented for '
            + 'this game.'),
          h('button', {
            class: 'btn btn--primary',
            text: 'Got it',
            on: { click: () => app.pop() },
          }),
        )),
    );
  }
}
