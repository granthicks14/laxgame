import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl } from '../components';
import { QuickSetupScreen } from './QuickSetup';
import { TeamSelectScreen } from './TeamSelect';
import { CareerEntryScreen } from './CareerEntry';
import { PracticeScreen } from './Practice';
import { SettingsScreen } from './Settings';
import { StatsScreen } from './Stats';
import { HowToPlayScreen } from './HowToPlay';
import { loadCareer, takeRetiredNotice } from '../../state/saves';
import { getTeam } from '../../data/teams';
import { seasonRecordText } from '../../league/career';

interface Item {
  label: string;
  desc: string;
  note?: string;
  muted?: boolean;
  go: (app: App) => void;
}

export class MainMenuScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const season = loadCareer('season');
    const dynasty = loadCareer('dynasty');

    const firstTime = !app.settings.seenTutorial;

    const items: Item[] = [
      {
        label: 'Play Now',
        desc: 'Pick two North District teams and drop the ball.',
        go: (a) => a.push((b) => new QuickSetupScreen(b)),
      },
      ...(firstTime ? [{
        label: 'How to Play',
        desc: 'Two minutes on the field: movement, passing, dodging, shooting, defence.',
        note: 'START HERE',
        go: (a: App) => a.push((b) => new HowToPlayScreen(b)),
      } as Item] : []),
      {
        label: 'Season',
        desc: season
          ? `${getTeam(season.teamId).short} · ${seasonRecordText(season)} · Year ${season.year}`
          : 'Take a program through a full district schedule and the playoffs.',
        note: season ? 'CONTINUE' : undefined,
        go: (a) => a.push((b) => new CareerEntryScreen(b, 'season')),
      },
      {
        label: 'Dynasty',
        desc: dynasty
          ? `${getTeam(dynasty.teamId).short} · Year ${dynasty.year} · ${dynasty.championships} title${dynasty.championships === 1 ? '' : 's'}`
          : 'Build a program over many seasons. Develop players, recruit, win titles.',
        note: dynasty ? 'CONTINUE' : undefined,
        go: (a) => a.push((b) => new CareerEntryScreen(b, 'dynasty')),
      },
      {
        label: 'Practice',
        desc: 'Drills for shooting, faceoffs, clearing, defence and free play.',
        go: (a) => a.push((b) => new PracticeScreen(b)),
      },
      {
        label: 'Teams',
        desc: 'Scout every program in the North District.',
        muted: true,
        go: (a) => a.push((b) => new TeamSelectScreen(b, {
          title: 'Teams',
          confirmLabel: 'Back to the list',
          onPick: () => b.pop(),
        })),
      },
      {
        label: 'Records',
        desc: 'Program history, career leaders and alumni.',
        muted: true,
        go: (a) => a.push((b) => new StatsScreen(b)),
      },
      ...(firstTime ? [] : [{
        label: 'How to Play',
        desc: 'Controls and a two-minute walkthrough on the field.',
        muted: true,
        go: (a: App) => a.push((b) => new HowToPlayScreen(b)),
      } as Item]),
      {
        label: 'Settings',
        desc: 'Difficulty, game length, audio and accessibility.',
        muted: true,
        go: (a) => a.push((b) => new SettingsScreen(b)),
      },
    ];

    const retired = takeRetiredNotice();

    this.el = screenEl(
      h('div', { class: 'topbar' },
        h('div', { class: 'topbar__title display', text: 'Lone Star Lax' }),
        h('div', { class: 'topbar__sub', text: 'North District' })),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          retired
            ? h('div', { class: 'panel', style: 'border-color:var(--accent)' },
              h('div', { class: 'panel__head', text: 'Your old save could not be carried over' }),
              h('div', { class: 'panel__body stack' },
                h('div', {
                  class: 'small',
                  text: 'The league now uses the THSLL North District\'s real class structure '
                    + '(Class A through Class D) instead of the old two-division split. Team ids '
                    + `changed with it, so the saved ${retired.join(' and ')} from the previous `
                    + 'version could not be converted. Everything else — settings and records — is intact.',
                })))
            : null,
          ...items.map((it) => h('button', {
            class: `menu-btn${it.muted ? ' menu-btn--muted' : ''}`,
            on: { click: () => it.go(app) },
          },
            h('span', { class: 'bar' }),
            h('span', { class: 'menu-btn__text' },
              h('span', { class: 'menu-btn__label', text: it.label }),
              h('span', { class: 'menu-btn__desc', text: it.desc })),
            it.note ? h('span', { class: 'menu-btn__note', text: it.note }) : h('span'),
          )),
          h('div', {
            class: 'tiny center',
            style: 'margin-top:10px',
            text: 'Original game. School names follow the THSLL North District; players, ratings and '
              + 'rivalries are fictional gameplay data.',
          }),
        ),
      ),
    );
  }
}
