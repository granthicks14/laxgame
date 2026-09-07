import { audio } from '../audio/Audio';
import { h } from './dom';
import { loadSettings, saveSettings, type Settings } from '../state/settings';

export interface Screen {
  el: HTMLElement;
  /** Called when the screen is removed. Clean up timers and listeners here. */
  destroy?(): void;
  /** Called when this screen becomes visible again after a pop. */
  resume?(): void;
}

export type ScreenFactory = (app: App) => Screen;

interface Entry {
  factory: ScreenFactory;
  screen: Screen;
}

export class App {
  readonly root: HTMLElement;
  settings: Settings;
  private stack: Entry[] = [];
  private toastTimer: number | null = null;
  /** True while a screen's constructor is running: it is not on the stack yet,
   *  but it must still see itself when it asks how deep the stack is. */
  private mounting = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = loadSettings();
    this.applySettings();
    // Any first gesture unlocks audio (browsers require this).
    const unlock = () => {
      audio.unlock();
      audio.setVolumes(this.settings.sfxVolume, this.settings.musicVolume);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  applySettings(): void {
    document.documentElement.classList.toggle('reduce-motion', this.settings.reducedMotion);
    audio.setVolumes(this.settings.sfxVolume, this.settings.musicVolume);
    audio.enabled = this.settings.sfxVolume > 0 || this.settings.musicVolume > 0;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.applySettings();
  }

  get depth(): number {
    return this.stack.length + (this.mounting ? 1 : 0);
  }

  /** Replace the whole stack. */
  reset(factory: ScreenFactory): void {
    while (this.stack.length) this.dropTop();
    this.mount(factory);
  }

  push(factory: ScreenFactory): void {
    const top = this.stack[this.stack.length - 1];
    if (top) top.screen.el.remove();
    this.mount(factory);
    audio.play('ui');
  }

  /** Swap the current screen without growing the stack. */
  replace(factory: ScreenFactory): void {
    if (this.stack.length) this.dropTop();
    this.mount(factory);
  }

  pop(): void {
    if (this.stack.length <= 1) return;
    this.dropTop();
    const entry = this.stack.pop();
    if (entry) {
      // Rebuild so the screen shows current data.
      this.mount(entry.factory);
    }
    audio.play('uiBack');
  }

  /** Pop until only the bottom screen remains, then replace it. */
  home(factory: ScreenFactory): void {
    this.reset(factory);
  }

  private mount(factory: ScreenFactory): void {
    let screen: Screen;
    this.mounting = true;
    try {
      screen = factory(this);
    } catch (err) {
      console.error('[app] screen failed to build', err);
      screen = errorScreen(err);
    } finally {
      this.mounting = false;
    }
    this.stack.push({ factory, screen });
    this.root.appendChild(screen.el);
    screen.resume?.();
  }

  private dropTop(): void {
    const entry = this.stack.pop();
    if (!entry) return;
    try {
      entry.screen.destroy?.();
    } catch (err) {
      console.error('[app] screen cleanup failed', err);
    }
    entry.screen.el.remove();
  }

  toast(message: string): void {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const el = h('div', { class: 'toast', text: message });
    document.body.appendChild(el);
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.remove(), 2200);
  }
}

function errorScreen(err: unknown): Screen {
  const el = h('div', { class: 'screen' },
    h('div', { class: 'scroll' },
      h('div', { class: 'panel error-box' },
        h('div', { class: 'panel__head', text: 'Something went wrong' }),
        h('div', { class: 'panel__body' },
          h('p', { text: 'That screen could not be opened. The rest of the game is still fine.' }),
          h('pre', { class: 'small', style: 'white-space:pre-wrap', text: String(err) }),
          h('button', {
            class: 'btn btn--primary',
            text: 'Reload',
            on: { click: () => window.location.reload() },
          }),
        ),
      ),
    ),
  );
  return { el };
}
