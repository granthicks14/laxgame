import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, segmented, fieldRow } from '../components';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyKey } from '../../data/difficulty';
import { GAME_LENGTHS, type GameLengthKey } from '../../data/constants';
import { audio } from '../../audio/Audio';
import { deleteCareer, hasCareer } from '../../state/saves';
import { storageIsPersistent } from '../../core/storage';

export class SettingsScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const s = app.settings;
    const diffBlurb = h('div', { class: 'small', text: DIFFICULTIES[s.difficulty].blurb });

    const slider = (value: number, onInput: (v: number) => void) =>
      h('input', {
        type: 'range', min: '0', max: '100', step: '5',
        value: String(Math.round(value * 100)),
        on: {
          input: (e: Event) => onInput(Number((e.target as HTMLInputElement).value) / 100),
        },
      });

    this.el = screenEl(
      topbar(app, 'Settings'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },

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
                (Object.keys(GAME_LENGTHS) as GameLengthKey[]).map((k) => ({ value: k, label: GAME_LENGTHS[k].label })),
                s.gameLength,
                (v) => app.updateSettings({ gameLength: v }), true)),
            h('div', { class: 'tiny', text: 'These are defaults for new games. A career keeps the settings it was created with.' })),

          panel('Controls',
            fieldRow('Input', 'Auto picks touch controls on phones and tablets.',
              segmented(
                [
                  { value: 'auto', label: 'Auto' },
                  { value: 'touch', label: 'Touch' },
                  { value: 'keyboard', label: 'Keys' },
                ],
                s.controls,
                (v) => app.updateSettings({ controls: v as 'auto' | 'touch' | 'keyboard' }),
              )),
            fieldRow('On-screen hints', 'Show the keyboard hint strip during a game.',
              segmented(
                [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
                s.showHints ? 'on' : 'off',
                (v) => app.updateSettings({ showHints: v === 'on' }),
              ))),

          panel('Audio',
            fieldRow('Sound effects', null, slider(s.sfxVolume, (v) => {
              app.updateSettings({ sfxVolume: v });
              audio.unlock();
              audio.play('ui');
            })),
            fieldRow('Music', null, slider(s.musicVolume, (v) => {
              app.updateSettings({ musicVolume: v });
              audio.unlock();
              if (v > 0) audio.startMusic(); else audio.stopMusic();
            }))),

          panel('Accessibility',
            fieldRow('Reduced motion', 'Removes screen transitions and UI animation.',
              segmented(
                [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
                s.reducedMotion ? 'on' : 'off',
                (v) => app.updateSettings({ reducedMotion: v === 'on' }),
              ))),

          panel('Saved data',
            h('div', {
              class: 'small',
              text: storageIsPersistent()
                ? 'Progress is saved in this browser. Clearing site data will erase it.'
                : 'This browser is blocking local storage, so progress will not survive a reload.',
            }),
            h('div', { class: 'row row--wrap' },
              h('button', {
                class: 'btn btn--sm', text: 'Delete season save',
                disabled: !hasCareer('season'),
                on: {
                  click: () => {
                    if (window.confirm('Delete the saved season?')) {
                      deleteCareer('season');
                      app.toast('Season save deleted');
                      app.replace((a) => new SettingsScreen(a));
                    }
                  },
                },
              }),
              h('button', {
                class: 'btn btn--sm', text: 'Delete dynasty save',
                disabled: !hasCareer('dynasty'),
                on: {
                  click: () => {
                    if (window.confirm('Delete the saved dynasty? Every season of history goes with it.')) {
                      deleteCareer('dynasty');
                      app.toast('Dynasty save deleted');
                      app.replace((a) => new SettingsScreen(a));
                    }
                  },
                },
              }))),

          h('div', { class: 'tiny', text: 'Lone Star Lax runs entirely in your browser. No accounts, no servers, no cost.' }),
        )),
    );
  }
}
