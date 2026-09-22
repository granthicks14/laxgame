import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl } from '../../components';
import { hubButton } from '../../hub';
import { HubTitleScreen } from '../HubTitle';
import { SettingsScreen } from '../Settings';
import { footballSettings, FOOTBALL_SPORT } from '../../../sports/football/settings';
import { TEAMS } from '../../../sports/football/nfl';
import { getPref } from '../../../state/sportPrefs';
import { FootballSetupScreen } from './FootballSetup';
import { franchiseHeadline, loadFranchise } from '../../../sports/football/franchise/save';
import { ChallengeStartScreen, DynastyStartScreen } from './nfl/FranchiseStart';
import { FranchiseHub } from './nfl/FranchiseHub';
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
    const dynasty = loadFranchise('dynasty');
    const challenge = loadFranchise('challenge');

    const items: Item[] = [
      {
        label: 'Play Now',
        desc: 'Any two clubs in the league, one game, no consequences.',
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
          ? franchiseHeadline(dynasty)
          : 'Take a club and build it: the draft, the cap, free agency, a staff '
            + 'and as many seasons as you like.',
        note: dynasty ? 'CONTINUE' : 'NEW',
        go: (a) => (dynasty
          ? a.push((b) => new FranchiseHub(b, dynasty))
          : a.push((b) => DynastyStartScreen(b))),
      },
      {
        label: 'Challenge',
        desc: challenge
          ? franchiseHeadline(challenge)
          : 'The hot seat. The owner has a number in his head before the season '
            + 'starts, and missing it for long enough ends the job.',
        note: challenge ? 'CONTINUE' : 'THE HOT SEAT',
        go: (a) => (challenge
          ? a.push((b) => new FranchiseHub(b, challenge))
          : a.push((b) => ChallengeStartScreen(b))),
      },
      {
        label: 'Clubs',
        desc: 'All thirty-two, and what every roster in them is made of.',
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
        h('div', { class: 'topbar__sub', text: `${TEAMS.length} clubs` })),
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
            text: 'The clubs are the ones you know. Every player, name, rating and '
              + 'result in the game is generated and belongs to nobody.',
          }),
        )),
    );
  }
}
