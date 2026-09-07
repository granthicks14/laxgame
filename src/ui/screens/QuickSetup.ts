import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, teamBadge, segmented, fieldRow } from '../components';
import { getTeam } from '../../data/teams';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyKey } from '../../data/difficulty';
import { GAME_LENGTHS, type GameLengthKey } from '../../data/constants';
import { quickPrefs, saveQuickPrefs } from '../../state/session';
import { TeamSelectScreen } from './TeamSelect';
import { makeMatchConfig } from '../../league/matchSetup';
import { GameScreen } from './GameScreen';
import { PostGameScreen } from './PostGame';

export class QuickSetupScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const opp = getTeam(quickPrefs.opponentId === quickPrefs.teamId
      ? (quickPrefs.teamId === 'jesuit-dallas' ? 'highland-park' : 'jesuit-dallas')
      : quickPrefs.opponentId);
    quickPrefs.opponentId = opp.id;

    const diffBlurb = h('div', { class: 'small', text: DIFFICULTIES[quickPrefs.difficulty].blurb });
    const lenBlurb = h('div', { class: 'small', text: GAME_LENGTHS[quickPrefs.gameLength].blurb });

    const teamButton = (label: string, teamId: string, onOpen: () => void) => {
      const t = getTeam(teamId);
      return h('button', { class: 'team-card', on: { click: onOpen } },
        teamBadge(t),
        h('div', null,
          h('div', { class: 'eyebrow', text: label }),
          h('div', { class: 'team-card__name', text: t.name }),
          h('div', { class: 'team-card__meta', text: `OVR ${t.overall} · ${t.mascot}` })));
    };

    this.el = screenEl(
      topbar(app, 'Play Now', 'Exhibition'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panel('Matchup',
            teamButton('Your team', quickPrefs.teamId, () => app.push((a) => new TeamSelectScreen(a, {
              title: 'Choose your team',
              currentId: quickPrefs.teamId,
              confirmLabel: 'Play as this team',
              onPick: (id) => {
                quickPrefs.teamId = id;
                if (quickPrefs.opponentId === id) {
                  quickPrefs.opponentId = id === 'jesuit-dallas' ? 'highland-park' : 'jesuit-dallas';
                }
                saveQuickPrefs();
                app.pop();
                app.pop();
              },
            }))),
            h('div', { class: 'center display', style: 'color:var(--muted);font-size:13px', text: 'versus' }),
            teamButton('Opponent', quickPrefs.opponentId, () => app.push((a) => new TeamSelectScreen(a, {
              title: 'Choose an opponent',
              excludeId: quickPrefs.teamId,
              currentId: quickPrefs.opponentId,
              confirmLabel: 'Play against this team',
              onPick: (id) => {
                quickPrefs.opponentId = id;
                saveQuickPrefs();
                app.pop();
                app.pop();
              },
            }))),
          ),

          panel('Game settings',
            fieldRow('Venue', null, segmented(
              [{ value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }],
              quickPrefs.home ? 'home' : 'away',
              (v) => { quickPrefs.home = v === 'home'; saveQuickPrefs(); },
            )),
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Difficulty' }),
              segmented<DifficultyKey>(
                DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
                quickPrefs.difficulty,
                (v) => {
                  quickPrefs.difficulty = v;
                  saveQuickPrefs();
                  diffBlurb.textContent = DIFFICULTIES[v].blurb;
                },
                true,
              ),
              diffBlurb),
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Game length' }),
              segmented<GameLengthKey>(
                (Object.keys(GAME_LENGTHS) as GameLengthKey[]).map((k) => ({ value: k, label: GAME_LENGTHS[k].label })),
                quickPrefs.gameLength,
                (v) => {
                  quickPrefs.gameLength = v;
                  saveQuickPrefs();
                  lenBlurb.textContent = GAME_LENGTHS[v].blurb;
                },
                true,
              ),
              lenBlurb),
          ),

          h('button', {
            class: 'btn btn--primary btn--block',
            style: 'min-height:58px;font-size:19px',
            text: 'Faceoff',
            on: { click: () => startQuickGame(app) },
          }),
        ),
      ),
    );
  }
}

export function startQuickGame(app: App): void {
  const you = getTeam(quickPrefs.teamId);
  const them = getTeam(quickPrefs.opponentId);
  const homeTeam = quickPrefs.home ? you : them;
  const awayTeam = quickPrefs.home ? them : you;
  const config = makeMatchConfig({
    homeTeam,
    awayTeam,
    humanSide: quickPrefs.home ? 'home' : 'away',
    difficulty: quickPrefs.difficulty,
    gameLength: quickPrefs.gameLength,
  });

  app.push((a) => new GameScreen(a, {
    config,
    onQuit: () => a.pop(),
    onComplete: (match) => {
      a.replace((b) => new PostGameScreen(b, {
        match,
        actions: [
          { label: 'Play again', primary: true, onClick: () => { b.pop(); startQuickGame(b); } },
          { label: 'Back to menu', onClick: () => { b.pop(); b.pop(); } },
        ],
      }));
    },
  }));
}
