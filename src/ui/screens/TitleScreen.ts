import { h } from '../dom';
import type { App, Screen } from '../App';
import { audio } from '../../audio/Audio';
import { MainMenuScreen } from './MainMenu';
import { ALL_MODES, MODE_LABEL } from '../../league/modes';
import { hasCareer } from '../../state/saves';

export class TitleScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const enter = () => {
      audio.unlock();
      audio.startMusic();
      app.replace((a) => new MainMenuScreen(a));
    };

    // Every mode counts, not only the two the game shipped with.
    const continueMode = ALL_MODES.find((m) => hasCareer(m)) ?? null;

    this.el = h('div', { class: 'screen' },
      h('div', { class: 'title-screen' },
        h('div', { class: 'title-mark' },
          h('div', { class: 'title-mark__star' }),
          h('div', { class: 'title-mark__lone display', text: 'Lone Star' }),
          h('div', { class: 'title-mark__lax display', text: 'LAX' }),
          h('div', { class: 'title-mark__rule' }),
          h('div', { class: 'title-mark__sub display', text: 'THSLL North District' })),
        h('div', { class: 'title-actions' },
          h('button', {
            class: 'btn btn--primary btn--block title-start',
            style: 'min-height:56px;font-size:20px',
            text: 'Press Start',
            on: { click: enter },
          }),
          continueMode
            ? h('div', { class: 'center small', text: `${MODE_LABEL[continueMode]} save found — continue from the menu.` })
            : null),
        h('div', { class: 'title-foot' },
          h('div', { text: 'An original arcade lacrosse game. Not affiliated with or endorsed by the THSLL or any school.' })),
      ),
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); enter(); }
    };
    window.addEventListener('keydown', onKey);
    this.destroy = () => window.removeEventListener('keydown', onKey);
  }

  destroy: () => void;
}
