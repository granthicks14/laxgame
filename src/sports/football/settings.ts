import { h } from '../../ui/dom';
import type { App } from '../../ui/App';
import { panel, segmented } from '../../ui/components';
import { keybindEditor } from '../../ui/keybindEditor';
import { getPref, setPref } from '../../state/sportPrefs';
import type { SettingsSections } from '../../ui/screens/Settings';
import { DIFFICULTIES, DIFFICULTY_ORDER, GAME_LENGTHS, type GameLengthKey } from './tuning';
import type { DifficultyKey } from './types';

/* ---------------------------------------------------------------------------
 * FOOTBALL'S OWN SETTINGS
 * ---------------------------------------------------------------------------
 * Its four difficulties, its quarter lengths and its keys. None of them mean
 * anything in the other two sports, so none of them live in the shared settings
 * screen — they are handed over as sections when football opens it.
 * ------------------------------------------------------------------------- */

export const FOOTBALL_SPORT = 'football';

export const currentDifficulty = (app: App): DifficultyKey =>
  getPref<DifficultyKey>(app, FOOTBALL_SPORT, 'difficulty', 'pro');

export const currentLength = (app: App): GameLengthKey =>
  getPref<GameLengthKey>(app, FOOTBALL_SPORT, 'length', 'standard');

export const footballSettings: SettingsSections = (app: App, rebuild: () => void) => {
  void rebuild;
  const diff = currentDifficulty(app);
  const len = currentLength(app);
  const diffBlurb = h('div', { class: 'small', text: DIFFICULTIES[diff].blurb });
  const lenBlurb = h('div', { class: 'small', text: GAME_LENGTHS[len].blurb });

  return [
    panel('Game defaults',
      h('div', { class: 'stack', style: 'gap:6px' },
        h('div', { class: 'field-row__label', text: 'Difficulty' }),
        segmented<DifficultyKey>(
          DIFFICULTY_ORDER.map((k) => ({ value: k, label: DIFFICULTIES[k].label })),
          diff,
          (v) => {
            setPref(app, FOOTBALL_SPORT, 'difficulty', v);
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
            setPref(app, FOOTBALL_SPORT, 'length', v);
            lenBlurb.textContent = GAME_LENGTHS[v].blurb;
          }, true),
        lenBlurb),
      h('div', {
        class: 'tiny',
        text: 'Difficulty changes how well the opposition COACHES — how fast a '
          + 'linebacker reads a handoff, whether the secondary stays with its '
          + 'assignment, how well the coordinator guesses what you keep calling. '
          + 'It never gives them a rating they have not got.',
      })),

    panel('Controls',
      h('div', { class: 'tiny', style: 'margin-bottom:8px' },
        'Move with one hand and aim the throw with the other. On a phone, tap the '
        + 'receiver you want — the rings on the field are the buttons.'),
      keybindEditor(app)),
  ];
};
