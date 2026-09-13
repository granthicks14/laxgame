import { audio } from '../audio/Audio';
import { h } from './dom';
import { loadSettings, saveSettings, type Settings } from '../state/settings';
import {
  NEUTRAL_SCHEME, loadKeybinds, saveKeybinds, type ControlScheme, type Keybinds,
} from '../state/keybinds';

export interface Screen {
  el: HTMLElement;
  /** Called when the screen is removed. Clean up timers and listeners here. */
  destroy?(): void;
  /**
   * Called when another screen is pushed on top of this one. A pushed-over
   * screen is NOT destroyed — it stays on the stack so a pop can return to it —
   * so anything it bound to the window is still live and still listening.
   *
   * That is a real bug, not a theoretical one: the hub's front door binds Enter
   * and Space to "Play Now", and without this hook that binding survived all the
   * way into a live game, where pressing Space to clamp a faceoff threw the
   * player back to the sport list. Any screen with a window listener, an
   * interval, or a timer must give it up here.
   */
  suspend?(): void;
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
  /**
   * The control scheme of the sport the player is currently in, and its
   * bindings. A sport sets this when it loads (see the sport registry), which is
   * what lets one rebinding screen serve every sport in the hub. Before any
   * sport has loaded this is the neutral shell scheme — the hub has no gameplay
   * controls of its own, and importing a sport's just to have a default would
   * put that sport in the hub's bundle.
   */
  scheme: ControlScheme = NEUTRAL_SCHEME;
  /** Key bindings for `scheme`. Screens read them; the game screen binds them. */
  keybinds: Keybinds;
  private stack: Entry[] = [];
  private toastTimer: number | null = null;
  /** True while a screen's constructor is running: it is not on the stack yet,
   *  but it must still see itself when it asks how deep the stack is. */
  private mounting = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.settings = loadSettings();
    this.keybinds = loadKeybinds(this.scheme);
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

  /**
   * Enter a sport's controls. Its stored bindings load, and anything listening
   * (a live game) is told, so switching sports can never leave a screen bound to
   * the previous sport's keys.
   */
  setScheme(scheme: ControlScheme): void {
    if (this.scheme.sport === scheme.sport) return;
    this.scheme = scheme;
    this.keybinds = loadKeybinds(scheme);
    this.onKeybindsChanged?.(this.keybinds);
  }

  /** Persists a new binding set and tells anything listening (a live game). */
  setKeybinds(binds: Keybinds): void {
    this.keybinds = binds;
    saveKeybinds(this.scheme, binds);
    this.onKeybindsChanged?.(binds);
  }

  onKeybindsChanged: ((binds: Keybinds) => void) | null = null;

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
    if (top) {
      try {
        top.screen.suspend?.();
      } catch (err) {
        console.error('[app] screen suspend failed', err);
      }
      top.screen.el.remove();
    }
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
