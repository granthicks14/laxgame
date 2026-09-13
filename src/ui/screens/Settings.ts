import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, segmented, fieldRow } from '../components';
import { audio } from '../../audio/Audio';
import { storageIsPersistent } from '../../core/storage';

/* ---------------------------------------------------------------------------
 * SETTINGS
 * ---------------------------------------------------------------------------
 * The panels here are the ones that mean the same thing in every sport: how you
 * are holding the device, how loud it is, whether the interface moves, and where
 * your progress lives.
 *
 * Anything that only makes sense inside one sport — lacrosse's quarter length,
 * its difficulty ladder, its saved careers, its key bindings — is passed in by
 * that sport as extra sections. That is not tidiness for its own sake: it keeps
 * every line of lacrosse out of the hub's bundle, and it means the settings
 * screen a basketball player sees is about basketball.
 * ------------------------------------------------------------------------- */

/** Extra panels a sport contributes to its own settings screen. */
export type SettingsSections = (app: App, rebuild: () => void) => (HTMLElement | null)[];

export class SettingsScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, sections?: SettingsSections, title = 'Settings') {
    const s = app.settings;
    const rebuild = () => app.replace((a) => new SettingsScreen(a, sections, title));

    const slider = (value: number, onInput: (v: number) => void) =>
      h('input', {
        type: 'range', min: '0', max: '100', step: '5',
        value: String(Math.round(value * 100)),
        on: {
          input: (e: Event) => onInput(Number((e.target as HTMLInputElement).value) / 100),
        },
      });

    this.el = screenEl(
      topbar(app, title),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },

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

          ...(sections ? sections(app, rebuild) : []),

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
                ? 'Progress is saved in this browser. Clearing site data will erase it. '
                  + 'Each sport keeps its own saves, and deleting one leaves the others alone.'
                : 'This browser is blocking local storage, so progress will not survive a reload.',
            })),

          h('div', {
            class: 'tiny',
            text: 'Lone Star Sports runs entirely in your browser. No accounts, no servers, no cost.',
          }),
        )),
    );
  }
}
