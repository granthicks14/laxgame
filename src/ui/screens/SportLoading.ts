import { h } from '../dom';
import type { App, Screen } from '../App';
import { audio } from '../../audio/Audio';
import { applySportTheme, type SportManifest, type SportModule } from '../../sports/registry';
import { enterSportChrome } from '../hub';

/* ---------------------------------------------------------------------------
 * CROSSING INTO A SPORT
 * ---------------------------------------------------------------------------
 * This screen exists because the handover has to feel deliberate. A sport is a
 * separate download — the whole game, fetched on demand — so there is a real
 * wait to fill, and filling it with the sport's own identity is the difference
 * between launching a game and changing a dropdown.
 *
 * What it shows is driven entirely by the manifest: the sport's title, its
 * tagline, its colours, and its surface painted large. A new sport gets its own
 * loading screen by existing.
 *
 * Two things it must never do: strand the player if the download fails, and land
 * them in a sport whose colours, controls or sounds have not been switched over.
 * ------------------------------------------------------------------------- */

/** Sports whose one-time init has already run this session. */
const started = new Set<string>();

/** The one way into a sport. Applies the theme up front, then loads. */
export function enterSport(app: App, sport: SportManifest): void {
  audio.play('launch');
  app.push((a) => new SportLoadingScreen(a, sport));
}

export class SportLoadingScreen implements Screen {
  el: HTMLElement;
  private cancelled = false;
  private timer: number | null = null;

  constructor(app: App, sport: SportManifest) {
    // The colours change the moment the player commits, so the wait already
    // belongs to the sport they chose.
    applySportTheme(sport.theme, sport.id);

    const bar = h('div', { class: 'sport-load__fill' });
    const status = h('div', { class: 'sport-load__status', text: 'Loading' });
    const art = h('canvas', { class: 'sport-load__art', ariaHidden: true });
    paintWide(art, sport);

    this.el = h('div', { class: 'screen' },
      h('div', { class: 'sport-load' },
        art,
        h('div', { class: 'sport-load__plate' },
          h('div', { class: 'sport-load__sport display', text: sport.name }),
          h('div', { class: 'sport-load__title display', text: sport.title }),
          h('div', { class: 'sport-load__rule' }),
          h('div', { class: 'sport-load__tag', text: sport.tagline })),
        h('div', { class: 'sport-load__meter' }, bar),
        status),
    );

    // A determinate-looking bar for an indeterminate wait would be a lie, so it
    // creeps toward 90% and only completes when the module has actually landed.
    let pct = 6;
    this.timer = window.setInterval(() => {
      pct = Math.min(90, pct + (90 - pct) * 0.18 + 1.5);
      bar.style.width = `${pct}%`;
    }, 90);

    const finish = (mod: SportModule): void => {
      if (this.cancelled) return;
      this.stopTimer();
      if (!started.has(sport.id)) {
        started.add(sport.id);
        try {
          mod.init?.();
        } catch (err) {
          // A sport's own data check must never be the reason it will not open.
          console.warn(`[hub] ${sport.id} init reported a problem`, err);
        }
      }
      bar.style.width = '100%';
      status.textContent = 'Ready';
      enterSportChrome(app, sport, mod);
      // Replace rather than push: the loading screen is a doorway, and backing
      // out of a sport should reach the sport list, not the door.
      app.replace(mod.menu);
    };

    const fail = (err: unknown): void => {
      if (this.cancelled) return;
      this.stopTimer();
      console.error(`[hub] ${sport.id} failed to load`, err);
      bar.style.width = '100%';
      bar.style.background = 'var(--red)';
      status.textContent = '';
      this.el.querySelector('.sport-load')?.appendChild(h('div', { class: 'sport-load__error stack' },
        h('div', { class: 'small', text: `${sport.title} could not be loaded. This is usually a dropped connection.` }),
        h('button', {
          class: 'btn btn--primary',
          text: 'Try again',
          on: { click: () => app.replace((a) => new SportLoadingScreen(a, sport)) },
        }),
        h('button', {
          class: 'btn',
          text: 'Back to the sports',
          on: { click: () => app.pop() },
        })));
    };

    const loader = sport.load;
    if (!loader) {
      fail(new Error('no loader'));
      return;
    }
    loader().then(finish).catch(fail);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    this.cancelled = true;
    this.stopTimer();
  }
}

/** The sport's surface, painted wide behind the title plate. */
function paintWide(canvas: HTMLCanvasElement, sport: SportManifest): void {
  const w = 240;
  const h2 = 135;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h2 * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;
  sport.preview(ctx, w, h2, sport.theme);
}
