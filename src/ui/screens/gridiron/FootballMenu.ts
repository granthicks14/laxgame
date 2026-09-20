import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl } from '../../components';
import { hubButton } from '../../hub';
import { HubTitleScreen } from '../HubTitle';
import { SettingsScreen } from '../Settings';
import { footballSettings, FOOTBALL_SPORT } from '../../../sports/football/settings';
import { allTeams } from '../../../sports/football/world';
import { getPref } from '../../../state/sportPrefs';
import { FootballSetupScreen } from './FootballSetup';
import { careerHeadline, loadFootballCareer } from '../../../sports/football/career/save';
import { ChallengeStartScreen, DynastyStartScreen } from './career/CareerStart';
import { FootballCareerHub } from './career/CareerHub';
import { FootballTeamsScreen } from './FootballTeams';
import { FootballHowToScreen } from './FootballHowTo';

/* ---------------------------------------------------------------------------
 * GRIDIRON — the front screen
 * ---------------------------------------------------------------------------
 * Football's own menu, reached from the hub.
 *
 * EVERY ITEM ON IT GOES SOMEWHERE THAT WORKS. A menu with a greyed-out Dynasty
 * button on it is a menu that has told the player a lie about what the game is,
 * and the moment there is a career to open, the button for it appears here —
 * not before.
 * ------------------------------------------------------------------------- */

interface Item {
  label: string;
  desc: string;
  note?: string;
  muted?: boolean;
  go: (app: App) => void;
}

export class FootballMenuScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const firstTime = !getPref(app, FOOTBALL_SPORT, 'seenHowTo', false);
    const dynasty = loadFootballCareer('dynasty');
    const challenge = loadFootballCareer('challenge');

    const items: Item[] = [
      {
        label: 'Play Now',
        desc: 'Pick two clubs and kick off.',
        go: (a) => a.push((b) => new FootballSetupScreen(b)),
      },
      ...(firstTime ? [{
        label: 'How to Play',
        desc: 'Calling a play, throwing the ball, and the two lines on the grass.',
        note: 'START HERE',
        go: (a: App) => a.push((b) => new FootballHowToScreen(b)),
      } as Item] : []),
      {
        label: 'Dynasty',
        desc: dynasty
          ? careerHeadline(dynasty)
          : 'Take a programme anywhere in the sport and build it for as long as you like.',
        note: dynasty ? 'CONTINUE' : 'NEW',
        go: (a) => (dynasty
          ? a.push((b) => new FootballCareerHub(b, dynasty))
          : a.push((b) => new DynastyStartScreen(b))),
      },
      {
        label: 'Challenge',
        desc: challenge
          ? careerHeadline(challenge)
          : 'Start at the bottom of the sport with nothing. Only a championship '
            + 'moves you up, and only for as long as they keep you.',
        note: challenge ? 'CONTINUE' : 'THE CLIMB',
        go: (a) => (challenge
          ? a.push((b) => new FootballCareerHub(b, challenge))
          : a.push((b) => new ChallengeStartScreen(b))),
      },
      {
        label: 'Clubs',
        desc: 'Seven tiers of football, and what every roster in them is made of.',
        muted: true,
        go: (a) => a.push((b) => new FootballTeamsScreen(b)),
      },
      ...(firstTime ? [] : [{
        label: 'How to Play',
        desc: 'Controls, the play call, and reading a defence.',
        muted: true,
        go: (a: App) => a.push((b) => new FootballHowToScreen(b)),
      } as Item]),
      {
        label: 'Settings',
        desc: 'Difficulty, game length, controls, audio and accessibility.',
        muted: true,
        go: (a) => a.push((b) => new SettingsScreen(b, footballSettings, 'Football settings')),
      },
    ];

    this.el = screenEl(
      h('div', { class: 'topbar' },
        hubButton(() => app.reset((a) => new HubTitleScreen(a))),
        h('div', { class: 'topbar__title display', text: 'Gridiron' }),
        h('div', { class: 'topbar__sub', text: `${allTeams().length} clubs` })),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          ...items.map((it) => h('button', {
            class: `menu-btn${it.muted ? ' menu-btn--muted' : ''}`,
            on: { click: () => it.go(app) },
          },
          h('span', { class: 'bar' }),
          h('span', { class: 'menu-btn__text' },
            h('span', { class: 'menu-btn__label', text: it.label }),
            h('span', { class: 'menu-btn__desc', text: it.desc })),
          it.note ? h('span', { class: 'menu-btn__note', text: it.note }) : h('span'))),
          h('div', {
            class: 'tiny center',
            style: 'margin-top:10px',
            text: 'An original football game. Every club, player and result in it is '
              + 'invented for this game.',
          }),
        )),
    );
  }
}
