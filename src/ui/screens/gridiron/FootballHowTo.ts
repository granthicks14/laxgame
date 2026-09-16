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
 * screen exists to answer the four things that are genuinely not guessable: that
 * you are never steering eleven people, what the number on a play call means,
 * how to throw, and what the two coloured lines on the grass are.
 * ------------------------------------------------------------------------- */

export class FootballHowToScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    setPref(app, FOOTBALL_SPORT, 'seenHowTo', true);

    const step = (n: string, title: string, ...body: (HTMLElement | string)[]) =>
      panel(`${n} — ${title}`, ...body.map((b) => (typeof b === 'string'
        ? h('div', { class: 'small', text: b }) : b)));

    this.el = screenEl(
      topbar(app, 'How to play', 'Four things, and then you know the game'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          step('1', 'You call the play',
            'Between downs the game stops and asks what you are running. Every play '
            + 'says what it trades: a run is safe and slow, a deep shot wins the game '
            + 'and gets you sacked.',
            'The number on the right is how many SECONDS the play needs before it is '
            + 'there. Your line holds a rush for about two. A play that needs three is '
            + 'a play you are betting on.'),
          step('2', 'You are never eleven people',
            'On offence you are the quarterback, and then whoever has the ball. On '
            + 'defence you are one man — switch to whoever is nearest the play.',
            'Routes, blocks and coverage run themselves. The decisions are yours.'),
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
          h('button', {
            class: 'btn btn--primary',
            text: 'Got it',
            on: { click: () => app.pop() },
          }),
        )),
    );
  }
}
