import { h } from '../../ui/dom';
import type { App } from '../../ui/App';
import { panel, segmented, fieldRow } from '../../ui/components';
import { keybindEditor } from '../../ui/keybindEditor';
import { getPref, setPref } from '../../state/sportPrefs';
import type { SettingsSections } from '../../ui/screens/Settings';
import { DIFFICULTIES, DIFFICULTY_ORDER, GAME_LENGTHS, type GameLengthKey } from './tuning';
import type { DifficultyKey } from './types';
import { deleteSeason, loadSeason } from './season';

/* ---------------------------------------------------------------------------
 * BASKETBALL'S OWN SETTINGS
 * ---------------------------------------------------------------------------
 * Its four difficulties, its quarter lengths, its keys and its saved season.
 * None of them mean anything in lacrosse, so none of them live in the shared
 * settings screen — they are handed over as sections when basketball opens it.
 * ------------------------------------------------------------------------- */

export const HOOPS_SPORT = 'basketball';

export const currentDifficulty = (app: App): DifficultyKey =>
  getPref<DifficultyKey>(app, HOOPS_SPORT, 'difficulty', 'pro');

export const currentLength = (app: App): GameLengthKey =>
  getPref<GameLengthKey>(app, HOOPS_SPORT, 'length', 'standard');

export const hoopsSettings: SettingsSections = (app: App, rebuild: () => void) => {
  const diff = currentDifficulty(app);
  const len = currentLength(app);
  const diffBlurb = h('div', { class: 'small', text: DIFFICULTIES[diff].blurb });
  const lenBlurb = h('div', { class: 'small', text: GAME_LENGTHS[len].blurb });
  const season = loadSeason();

  return [
    panel('Game defaults',
      h('div', { class: 'stack', style: 'gap:6px' },
        h('div', { class: 'field-row__label', text: 'Difficulty' }),
        segmented<DifficultyKey>(
          DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
          diff,
          (v) => {
            setPref(app, HOOPS_SPORT, 'difficulty', v);
            diffBlurb.textContent = DIFFICULTIES[v].blurb;
          }, true),
        diffBlurb),
      h('div', { class: 'stack', style: 'gap:6px' },
        h('div', { class: 'field-row__label', text: 'Game length' }),
        segmented<GameLengthKey>(
          (Object.keys(GAME_LENGTHS) as GameLengthKey[])
            .map((k) => ({ value: k, label: GAME_LENGTHS[k].label })),
          len,
          (v) => {
            setPref(app, HOOPS_SPORT, 'length', v);
            lenBlurb.textContent = GAME_LENGTHS[v].blurb;
          }, true),
        lenBlurb),
      h('div', {
        class: 'tiny',
        text: 'Difficulty changes how well the opposition DECIDES — shot selection, how '
          + 'fast help arrives, how hard it closes out. It never gives them a rating '
          + 'they do not have on the roster screen.',
      })),

    panel('Keyboard',
      h('div', {
        class: 'small',
        text: 'Left hand moves and sprints, right hand plays. The same two buttons do '
          + 'different jobs with and without the ball. These keys are basketball’s '
          + 'alone — lacrosse keeps its own.',
      }),
      keybindEditor(app)),

    panel('Saved season',
      h('div', {
        class: 'small',
        text: season
          ? `Year ${season.year}, ${season.results.length} of ${season.schedule.length} games played.`
          : 'No season in progress.',
      }),
      fieldRow('Delete the season', 'Every result and the bracket go with it.',
        h('button', {
          class: 'btn btn--sm',
          text: 'Delete',
          disabled: !season,
          on: {
            click: () => {
              if (!window.confirm('Delete the saved basketball season?')) return;
              deleteSeason();
              app.toast('Season deleted');
              rebuild();
            },
          },
        }))),
  ];
};
