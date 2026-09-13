import { h } from '../../dom';
import type { App, Screen } from '../../App';
import { screenEl } from '../../components';
import { hubButton } from '../../hub';
import { HubTitleScreen } from '../HubTitle';
import { SettingsScreen } from '../Settings';
import { hoopsSettings } from '../../../sports/basketball/settings';
import { TEAMS, teamLabel } from '../../../sports/basketball/data';
import { loadSeason, seasonRecord } from '../../../sports/basketball/season';
import { HoopsSetupScreen } from './HoopsSetup';
import { HoopsSeasonScreen } from './HoopsSeason';
import { HoopsTeamsScreen } from './HoopsTeams';
import { HoopsHowToScreen } from './HoopsHowTo';
import { getPref } from '../../../state/sportPrefs';

/* ---------------------------------------------------------------------------
 * HARDWOOD — the front screen
 * ---------------------------------------------------------------------------
 * Basketball's own menu, reached from the hub. It offers what basketball has and
 * nothing it does not: there is no Dynasty here and no Challenge ladder, because
 * those are lacrosse's and inventing empty copies of them would be a worse answer
 * than leaving them out.
 * ------------------------------------------------------------------------- */

interface Item {
  label: string;
  desc: string;
  note?: string;
  muted?: boolean;
  go: (app: App) => void;
}

export class HoopsMenuScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const season = loadSeason();
    const seasonTeam = season ? TEAMS.find((t) => t.id === season.teamId) : null;
    const rec = season ? seasonRecord(season) : null;

    const firstTime = !getPref(app, 'basketball', 'seenHowTo', false);

    const items: Item[] = [
      {
        label: 'Play Now',
        desc: 'Pick two clubs and tip off.',
        go: (a) => a.push((b) => new HoopsSetupScreen(b)),
      },
      ...(firstTime ? [{
        label: 'How to Play',
        desc: 'The release window, the crossover, and what the buttons do on defence.',
        note: 'START HERE',
        go: (a: App) => a.push((b) => new HoopsHowToScreen(b)),
      } as Item] : []),
      {
        label: 'Season',
        desc: season && seasonTeam && rec
          ? `${seasonTeam.abbr} · ${rec.wins}-${rec.losses}`
            + `${season.stage === 'playoffs' ? ' · in the playoffs' : ''}`
            + `${season.stage === 'done' ? ' · finished' : ''}`
            + ` · year ${season.year}`
          : 'Twenty-two games, a table, and a bracket at the end of it.',
        note: season ? 'CONTINUE' : 'NEW',
        go: (a) => a.push((b) => new HoopsSeasonScreen(b)),
      },
      {
        label: 'Clubs',
        desc: 'Every roster in the league, and what each one is good at.',
        muted: true,
        go: (a) => a.push((b) => new HoopsTeamsScreen(b)),
      },
      ...(firstTime ? [] : [{
        label: 'How to Play',
        desc: 'Controls, the release window, and reading a shot.',
        muted: true,
        go: (a: App) => a.push((b) => new HoopsHowToScreen(b)),
      } as Item]),
      {
        label: 'Settings',
        desc: 'Difficulty, game length, controls, audio and accessibility.',
        muted: true,
        go: (a) => a.push((b) => new SettingsScreen(b, hoopsSettings, 'Basketball settings')),
      },
    ];

    this.el = screenEl(
      h('div', { class: 'topbar' },
        hubButton(() => app.reset((a) => new HubTitleScreen(a))),
        h('div', { class: 'topbar__title display', text: 'Hardwood' }),
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
            text: 'An original basketball game. Every club, player and result in it is '
              + 'invented for this game.',
          }),
        ),
      ),
    );
  }
}

export const clubName = teamLabel;
