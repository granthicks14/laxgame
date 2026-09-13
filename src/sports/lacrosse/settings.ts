import { h } from '../../ui/dom';
import type { App } from '../../ui/App';
import { panel, segmented, fieldRow } from '../../ui/components';
import { keybindEditor } from '../../ui/keybindEditor';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyKey } from '../../data/difficulty';
import { GAME_LENGTHS, type GameLengthKey } from '../../data/constants';
import { CAREER_MODES, MODE_LABEL } from '../../league/modes';
import { deleteCareer, hasCareer } from '../../state/saves';
import type { SettingsSections } from '../../ui/screens/Settings';

/* ---------------------------------------------------------------------------
 * LACROSSE'S OWN SETTINGS
 * ---------------------------------------------------------------------------
 * Quarter length, the difficulty ladder, goal replays, the key bindings for a
 * stick game, and the careers in progress. None of it means anything in another
 * sport, so none of it lives in the shared settings screen — it is handed over
 * as sections when lacrosse opens that screen.
 * ------------------------------------------------------------------------- */
export const lacrosseSettings: SettingsSections = (app: App, rebuild: () => void) => {
  const s = app.settings;
  const diffBlurb = h('div', { class: 'small', text: DIFFICULTIES[s.difficulty].blurb });

  return [
    panel('Gameplay defaults',
      h('div', { class: 'stack', style: 'gap:6px' },
        h('div', { class: 'field-row__label', text: 'Difficulty' }),
        segmented<DifficultyKey>(
          DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
          s.difficulty,
          (v) => {
            app.updateSettings({ difficulty: v });
            diffBlurb.textContent = DIFFICULTIES[v].blurb;
          }, true),
        diffBlurb),
      h('div', { class: 'stack', style: 'gap:6px' },
        h('div', { class: 'field-row__label', text: 'Game length' }),
        segmented<GameLengthKey>(
          (Object.keys(GAME_LENGTHS) as GameLengthKey[])
            .map((k) => ({ value: k, label: GAME_LENGTHS[k].label })),
          s.gameLength,
          (v) => app.updateSettings({ gameLength: v }), true)),
      fieldRow('Goal replays', 'Play a short highlight after each goal.',
        segmented(
          [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
          s.goalReplays ? 'on' : 'off',
          (v) => app.updateSettings({ goalReplays: v === 'on' }),
        )),
      fieldRow('Simulation details',
        'Show how a simulated result was reached: possessions, shots, saves and faceoffs.',
        segmented(
          [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
          s.simDetails ? 'on' : 'off',
          (v) => app.updateSettings({ simDetails: v === 'on' }),
        )),
      h('div', {
        class: 'tiny',
        text: 'These are defaults for new games. A career keeps the settings it was created with.',
      })),

    panel('Keyboard',
      h('div', {
        class: 'small',
        text: 'Movement sits under the left hand, actions under the right. Change any of it — '
          + 'the game and the pause menu both follow whatever you set. These keys are '
          + 'lacrosse’s alone; every sport keeps its own.',
      }),
      keybindEditor(app)),

    panel('Saved careers',
      h('div', { class: 'row row--wrap' },
        h('button', {
          class: 'btn btn--sm', text: 'Delete season save',
          disabled: !hasCareer('season'),
          on: {
            click: () => {
              if (!window.confirm('Delete the saved season?')) return;
              deleteCareer('season');
              app.toast('Season save deleted');
              rebuild();
            },
          },
        }),
        ...CAREER_MODES.map((m) => h('button', {
          class: 'btn btn--sm', text: `Delete ${MODE_LABEL[m].toLowerCase()} save`,
          disabled: !hasCareer(m),
          on: {
            click: () => {
              if (!window.confirm(
                `Delete the saved ${MODE_LABEL[m].toLowerCase()}? Every season of history goes with it.`,
              )) return;
              deleteCareer(m);
              app.toast(`${MODE_LABEL[m]} save deleted`);
              rebuild();
            },
          },
        })))),
  ];
};
