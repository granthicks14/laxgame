import './style.css';
import { App } from './ui/App';
import { TitleScreen } from './ui/screens/TitleScreen';
import { h } from './ui/dom';
import { validateLeague } from './data/teams';

function fatal(message: string, detail?: unknown): void {
  const root = document.getElementById('app');
  if (!root) return;
  root.replaceChildren(h('div', { class: 'screen' },
    h('div', { class: 'scroll' },
      h('div', { class: 'panel error-box' },
        h('div', { class: 'panel__head', text: 'Lone Star Lax could not start' }),
        h('div', { class: 'panel__body stack' },
          h('p', { style: 'margin:0', text: message }),
          detail ? h('pre', { class: 'tiny', style: 'white-space:pre-wrap;overflow:auto', text: String(detail) }) : null,
          h('button', {
            class: 'btn btn--primary',
            text: 'Reload',
            on: { click: () => window.location.reload() },
          }))))));
}

function boot(): void {
  // Surface league data problems (duplicate ids, dangling rivals, thin classes)
  // in the console rather than letting them turn into odd behaviour later.
  try {
    const problems = validateLeague();
    if (problems.length) console.warn('[league] data problems:\n - ' + problems.join('\n - '));
  } catch (err) {
    console.warn('[league] validation failed', err);
  }

  const root = document.getElementById('app');
  if (!root) {
    document.body.textContent = 'Missing #app container.';
    return;
  }
  try {
    const app = new App(root);
    app.reset((a) => new TitleScreen(a));
  } catch (err) {
    console.error(err);
    fatal('Something went wrong while starting the game.', err);
  }
}

// Never let an unhandled error leave a blank screen.
window.addEventListener('error', (e) => {
  console.error('[fatal]', e.error ?? e.message);
  if (!document.querySelector('.screen')) fatal('An unexpected error occurred.', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[fatal] unhandled rejection', e.reason);
});

// iOS Safari fires resize on URL-bar show/hide; keep the layout viewport honest.
const setVh = () => {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
};
setVh();
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', setVh);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
