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
import {
  careerHeadline, loadHoopsCareer,
} from '../../../sports/basketball/career/save';
import { ChallengeStartScreen, DynastyStartScreen } from './career/CareerStart';
import { HoopsCareerHub } from './career/CareerHub';

/* ---------------------------------------------------------------------------
 * HARDWOOD — the front screen
 * ---------------------------------------------------------------------------
 * Basketball's own menu, reached from the hub. Four ways in, in the order a
 * player meets them: a game tonight, a season, a programme you build for twenty
 * years, and a coaching life that starts in a school gym and finishes — if you
 * are good enough and last long enough — in the professional league.
 *
 * DYNASTY AND CHALLENGE SAVE SEPARATELY FROM EACH OTHER AND FROM LACROSSE.
 * Basketball's careers live under `lsl.hoops.career.*`; lacrosse's have always
 * lived under `lsl.career.*`. Nothing either sport does can reach the other's.
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
    const dynasty = loadHoopsCareer('dynasty');
    const challenge = loadHoopsCareer('challenge');

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
        label: 'Dynasty',
        desc: dynasty
          ? careerHeadline(dynasty)
          : 'Take a programme anywhere in the sport and build it for as long as you like.',
        note: dynasty ? 'CONTINUE' : 'NEW',
        go: (a) => (dynasty
          ? a.push((b) => new HoopsCareerHub(b, dynasty))
          : a.push((b) => new DynastyStartScreen(b))),
      },
      {
        label: 'Challenge',
        desc: challenge
          ? careerHeadline(challenge)
          : 'Start in a school gym with nothing. Nine levels above you, and only a '
            + 'championship moves you up one.',
        note: challenge ? 'CONTINUE' : 'THE CLIMB',
        go: (a) => (challenge
          ? a.push((b) => new HoopsCareerHub(b, challenge))
          : a.push((b) => new ChallengeStartScreen(b))),
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
