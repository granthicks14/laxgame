import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, teamBadge } from '../components';
import { getTeam } from '../../data/teams';
import { quickPrefs } from '../../state/session';
import { makeMatchConfig } from '../../league/matchSetup';
import type { PracticeConfig } from '../../match/types';
import { GameScreen } from './GameScreen';
import { TeamSelectScreen } from './TeamSelect';
import type { Match } from '../../match/Match';
import { sticksIcon, clipboardIcon } from '../icons';

interface Drill {
  key: string;
  title: string;
  goal: string;
  desc: string;
  build: () => PracticeConfig;
  difficulty: 'rookie' | 'varsity' | 'allstate';
}

const DRILLS: Drill[] = [
  {
    key: 'shoot',
    title: 'Shooting Gallery',
    goal: 'Score on as many reps as you can',
    desc: 'Ten possessions from midfield. Beat the keeper. Lose the ball and the rep is over.',
    build: () => ({ kind: 'shoot', reps: 10, title: 'SHOOTING GALLERY', goal: 'Score on as many reps as you can' }),
    difficulty: 'varsity',
  },
  {
    key: 'faceoff',
    title: 'Faceoff Reps',
    goal: 'Win the clamp ten times',
    desc: 'Ten straight draws against a real FOGO. Read the whistle, clamp inside the window.',
    build: () => ({ kind: 'faceoff', reps: 10, title: 'FACEOFF REPS', goal: 'Win the clamp ten times' }),
    difficulty: 'varsity',
  },
  {
    key: 'clear',
    title: 'Clearing & Passing',
    goal: 'Clear the ball ten times',
    desc: 'Start behind your own cage with a ride on. Pass, dodge and carry it over midfield.',
    build: () => ({ kind: 'clear', reps: 10, title: 'CLEARING DRILL', goal: 'Clear the ball ten times' }),
    difficulty: 'varsity',
  },
  {
    key: 'defend',
    title: 'Defensive Stand',
    goal: 'Get ten stops',
    desc: 'The other team starts with the ball every rep. Force a turnover, a check or a save.',
    build: () => ({ kind: 'defend', reps: 10, title: 'DEFENSIVE STAND', goal: 'Get ten stops' }),
    difficulty: 'varsity',
  },
  {
    key: 'free',
    title: 'Free Play',
    goal: 'Open scrimmage, no clock pressure',
    desc: 'A full-field scrimmage with a long clock. Work on passing, dodging and clearing.',
    build: () => ({ kind: 'free', seconds: 240, title: 'FREE PLAY', goal: 'Open scrimmage' }),
    difficulty: 'rookie',
  },
];

export class PracticeScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const you = getTeam(quickPrefs.teamId);
    const them = getTeam(quickPrefs.opponentId === quickPrefs.teamId ? 'dallas-jesuit' : quickPrefs.opponentId);

    this.el = screenEl(
      topbar(app, 'Practice', you.abbr),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('Squad',
            h('button', {
              class: 'team-card',
              on: {
                click: () => app.push((a) => new TeamSelectScreen(a, {
                  title: 'Practice with',
                  currentId: quickPrefs.teamId,
                  confirmLabel: 'Use this team',
                  onPick: (id) => { quickPrefs.teamId = id; a.pop(); a.pop(); },
                })),
              },
            },
              teamBadge(you),
              h('div', null,
                h('div', { class: 'eyebrow', text: 'Practising with' }),
                h('div', { class: 'team-card__name', text: you.name }),
                h('div', { class: 'team-card__meta', text: `Opponent: ${them.short}` })))),

          h('div', { class: 'drill-grid' },
            ...DRILLS.map((d) => h('button', {
              class: 'team-card',
              style: 'grid-template-columns:1fr',
              on: { click: () => runDrill(app, d) },
            },
              h('div', null,
                h('div', { class: 'team-card__name', text: d.title }),
                h('div', { class: 'team-card__meta', text: d.desc }),
                h('div', { class: 'row', style: 'margin-top:8px' },
                  h('span', { class: 'pill pill--accent', text: d.goal }))))),
          ),
        )),
    );
  }
}

function runDrill(app: App, drill: Drill): void {
  const you = getTeam(quickPrefs.teamId);
  const them = getTeam(quickPrefs.opponentId === quickPrefs.teamId ? 'dallas-jesuit' : quickPrefs.opponentId);
  const practice = drill.build();
  const config = makeMatchConfig({
    homeTeam: you,
    awayTeam: them,
    humanSide: 'home',
    difficulty: drill.difficulty,
    gameLength: 'long',
    practice,
  });
  if (practice.seconds) config.quarterSeconds = practice.seconds;

  app.push((a) => new GameScreen(a, {
    config,
    onQuit: () => a.pop(),
    onComplete: (match) => a.replace((b) => new DrillResultScreen(b, drill, match)),
  }));
}

class DrillResultScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, drill: Drill, match: Match) {
    const reps = match.practice.reps;
    const hits = match.practice.success;
    const pct = reps > 0 ? Math.round((hits / reps) * 100) : 0;
    const isTimed = !!drill.build().seconds;

    this.el = screenEl(
      topbar(app, drill.title, 'Drill complete'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'trophy' },
            h('div', { class: 'trophy__icon' }, pct >= 70 ? sticksIcon(52) : clipboardIcon(48)),
            h('div', { class: 'trophy__title', text: isTimed ? 'Session done' : `${hits} / ${reps}` }),
            h('div', { class: 'small', text: isTimed ? drill.goal : `${pct}% success rate` })),
          panel('Session totals',
            h('div', { class: 'row row--wrap', style: 'gap:16px' },
              box('GOALS', match.stats.home.goals),
              box('SHOTS', match.stats.home.shots),
              box('SAVES', match.stats.away.saves),
              box('GB', match.stats.home.groundBalls),
              box('FO WON', match.stats.home.faceoffWins),
              box('TO', match.stats.home.turnovers))),
          h('button', {
            class: 'btn btn--primary btn--block', text: 'Run it again',
            on: { click: () => { app.pop(); runDrill(app, drill); } },
          }),
          h('button', {
            class: 'btn btn--block', text: 'Back to drills',
            on: { click: () => app.pop() },
          }),
        )),
    );
  }
}

function box(label: string, value: number): HTMLElement {
  return h('div', { class: 'stack', style: 'gap:0;align-items:center;min-width:56px' },
    h('div', { class: 'display num', style: 'font-size:26px', text: String(value) }),
    h('div', { class: 'eyebrow', text: label }));
}
