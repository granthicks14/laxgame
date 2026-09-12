import { h } from '../dom';
import type { App, Screen } from '../App';
import type { CareerMode } from '../../league/types';
import { MODE_SUBTITLE } from '../../league/modes';
import { screenEl, topbar, panel, teamBadge, segmented, fieldRow } from '../components';
import { getTeam } from '../../data/teams';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyKey } from '../../data/difficulty';
import { GAME_LENGTHS, type GameLengthKey } from '../../data/constants';
import { loadCareer, saveCareer, deleteCareer } from '../../state/saves';
import { createCareer, seasonRecordText, userTeam } from '../../league/career';
import { TeamSelectScreen } from './TeamSelect';
import { SeasonHubScreen } from './SeasonHub';

const MODE_COPY: Record<CareerMode, { title: string; blurb: string }> = {
  season: {
    title: 'Season',
    blurb: 'One district campaign: a full round-robin schedule, then the playoff bracket.',
  },
  dynasty: {
    title: 'Dynasty',
    blurb: 'Season after season. Players develop and graduate, recruits arrive, and your '
      + 'program reputation decides who shows up.',
  },
  challenge: {
    title: 'Challenge',
    blurb: 'A coaching career that starts at the bottom of high school lacrosse and only '
      + 'moves up when you win a championship.',
  },
  superchallenge: {
    title: 'Super Challenge',
    blurb: 'The same climb, the same ladder and the same coach — but one thing to prove: '
      + 'three championships inside any ten seasons.',
  },
};

export class CareerEntryScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, mode: CareerMode) {
    const existing = loadCareer(mode);
    const copy = MODE_COPY[mode];

    const draft = {
      teamId: existing?.teamId ?? 'highland-park',
      difficulty: (existing?.difficulty ?? app.settings.difficulty) as DifficultyKey,
      gameLength: (existing?.gameLength ?? app.settings.gameLength) as GameLengthKey,
    };
    const newDraft = { ...draft, teamId: newCareerTeamId };

    const teamRow = h('div');
    const renderTeamRow = () => {
      const t = getTeam(newDraft.teamId);
      teamRow.replaceChildren(h('button', {
        class: 'team-card',
        on: {
          click: () => app.push((a) => new TeamSelectScreen(a, {
            title: 'Choose your program',
            currentId: newDraft.teamId,
            confirmLabel: 'Take this job',
            onPick: (id) => {
              newCareerTeamId = id;
              newDraft.teamId = id;
              a.pop();
              a.pop();
            },
          })),
        },
      },
        teamBadge(t),
        h('div', null,
          h('div', { class: 'eyebrow', text: 'Your program' }),
          h('div', { class: 'team-card__name', text: t.name }),
          h('div', { class: 'team-card__meta', text: `OVR ${t.overall} · ${t.mascot}` }))));
    };
    renderTeamRow();

    const start = () => {
      const career = createCareer({
        mode,
        teamId: newDraft.teamId,
        difficulty: newDraft.difficulty,
        gameLength: newDraft.gameLength,
      });
      saveCareer(career);
      app.replace((a) => new SeasonHubScreen(a, mode));
    };

    const confirmNew = () => {
      if (!existing) { start(); return; }
      const ok = window.confirm(
        `Starting a new ${copy.title.toLowerCase()} will erase your current save with `
        + `${getTeam(existing.teamId).short}. Continue?`,
      );
      if (ok) { deleteCareer(mode); start(); }
    };

    this.el = screenEl(
      topbar(app, copy.title, MODE_SUBTITLE[mode]),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'small', text: copy.blurb }),

          existing ? panel('Continue',
            h('div', { class: 'row', style: 'gap:12px' },
              teamBadge(userTeam(existing)),
              h('div', { class: 'stack', style: 'gap:2px;flex:1 1 auto' },
                h('div', { class: 'display', style: 'font-size:18px', text: getTeam(existing.teamId).name }),
                h('div', {
                  class: 'small',
                  text: `Year ${existing.year} · ${seasonRecordText(existing)} · `
                    + `${DIFFICULTIES[existing.difficulty].label}`
                    + (existing.championships ? ` · ${existing.championships} title${existing.championships === 1 ? '' : 's'}` : ''),
                }))),
            h('button', {
              class: 'btn btn--primary btn--block',
              text: 'Continue',
              on: { click: () => app.replace((a) => new SeasonHubScreen(a, mode)) },
            })) : null,

          panel(existing ? 'Start over' : 'New career',
            teamRow,
            h('div', { class: 'stack', style: 'gap:6px' },
              h('div', { class: 'field-row__label', text: 'Difficulty' }),
              segmented<DifficultyKey>(
                DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
                newDraft.difficulty,
                (v) => { newDraft.difficulty = v; },
                true,
              )),
            fieldRow('Game length', GAME_LENGTHS[newDraft.gameLength].blurb, segmented<GameLengthKey>(
              (Object.keys(GAME_LENGTHS) as GameLengthKey[]).map((k) => ({ value: k, label: GAME_LENGTHS[k].label })),
              newDraft.gameLength,
              (v) => { newDraft.gameLength = v; },
            )),
            h('button', {
              class: `btn btn--block${existing ? '' : ' btn--primary'}`,
              text: existing ? 'Start a new career' : `Start ${copy.title.toLowerCase()}`,
              on: { click: confirmNew },
            })),
        ),
      ),
    );
  }
}

/** Remembered between pushes so picking a team returns to the same draft. */
let newCareerTeamId = 'highland-park';
