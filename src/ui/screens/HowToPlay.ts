import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel } from '../components';
import { getTeam } from '../../data/teams';
import { quickPrefs } from '../../state/session';
import { makeMatchConfig } from '../../league/matchSetup';
import { GameScreen } from './GameScreen';

const KEYS: [string, string][] = [
  ['W A S D / Arrows', 'Move the player you control'],
  ['SHIFT', 'Sprint (burns stamina)'],
  ['SPACE', 'Pass with the ball · Check without it · Clamp at the faceoff'],
  ['F (hold)', 'Charge a shot, release to fire. Your movement direction picks the corner'],
  ['E', 'Dodge — a short burst that beats your defender'],
  ['TAB', 'Switch to another defender'],
  ['ESC / P', 'Pause'],
];

const TOUCH: [string, string][] = [
  ['Left half drag', 'Move. Push to the outer edge to sprint'],
  ['PASS', 'Pass with the ball, check without it, clamp at the faceoff'],
  ['SHOOT', 'Hold to charge, release to fire'],
  ['DODGE', 'Burst past your man'],
  ['SWITCH', 'Take control of a different defender'],
];

const RULES: [string, string][] = [
  ['Faceoffs', 'Every quarter and every goal restarts at X. Clamp inside the green window to win possession.'],
  ['Offsides', 'Attackmen stay in the attacking half, close defenders stay home. You will feel a wall if you drift.'],
  ['The crease', 'Nobody but the keeper stands in the circle. Shots have to come from outside it.'],
  ['Shot clock', 'Fifty seconds to get a shot off. Let it run out and you lose the ball.'],
  ['Backing up shots', 'A missed shot that goes over the end line belongs to whoever is closest to it.'],
];

export class HowToPlayScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const rows = (pairs: [string, string][]) =>
      h('div', { class: 'stack', style: 'gap:8px' },
        ...pairs.map(([k, v]) => h('div', { class: 'row', style: 'align-items:flex-start;gap:10px' },
          h('span', { class: 'key', style: 'flex:0 0 auto;min-width:96px', text: k }),
          h('span', { class: 'small', style: 'flex:1 1 auto', text: v }))));

    this.el = screenEl(
      topbar(app, 'How to Play'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('button', {
            class: 'btn btn--primary btn--block',
            style: 'min-height:54px;font-size:18px',
            text: 'Start the walkthrough',
            on: { click: () => startTutorial(app) },
          }),
          h('div', { class: 'small', text: 'A live scrimmage that walks you through movement, passing, dodging, shooting and checking.' }),
          panel('Keyboard', rows(KEYS)),
          panel('Touch', rows(TOUCH)),
          panel('Rules that matter', rows(RULES)),
          panel('How to actually win',
            h('div', { class: 'stack', style: 'gap:8px' },
              h('div', { class: 'small', text: 'Shot quality beats shot volume. A shot from twelve yards with a pole in your chest is a save every time.' }),
              h('div', { class: 'small', text: 'Dodging draws a slide. The moment a second defender commits, the man he left is open — pass there.' }),
              h('div', { class: 'small', text: 'On defence, stay between your man and the cage. Checks that miss put you out of the play.' }),
              h('div', { class: 'small', text: 'Faceoffs are possessions, and possessions are goals. A FOGO team can win a game it has no business winning.' }))),
        )),
    );
  }
}

function startTutorial(app: App): void {
  const you = getTeam(quickPrefs.teamId);
  const them = getTeam(quickPrefs.teamId === 'jesuit-dallas' ? 'highland-park' : 'jesuit-dallas');
  const config = makeMatchConfig({
    homeTeam: you,
    awayTeam: them,
    humanSide: 'home',
    difficulty: 'rookie',
    gameLength: 'long',
    practice: { kind: 'free', seconds: 420, title: 'WALKTHROUGH', goal: 'Learn the controls' },
  });
  config.quarterSeconds = 420;

  app.push((a) => new GameScreen(a, {
    config,
    tutorial: true,
    onQuit: () => a.pop(),
    onComplete: () => a.pop(),
  }));
  app.updateSettings({ seenTutorial: true });
}
