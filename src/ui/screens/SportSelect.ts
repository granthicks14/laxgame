import { h } from '../dom';
import type { App, Screen } from '../App';
import { topbar } from '../components';
import {
  playableSports, plannedSports, type SportManifest,
} from '../../sports/registry';
import { lastProgress } from '../../state/hubIndex';
import { leaveSportChrome } from '../hub';
import { enterSport } from './SportLoading';

/* ---------------------------------------------------------------------------
 * CHOOSING A SPORT
 * ---------------------------------------------------------------------------
 * Every playable sport gets a real card: its own painted surface, its own title,
 * what it actually is, the modes it actually has, and a Continue line if there
 * is something to carry on with.
 *
 * The card art is drawn here, in code, on a small canvas — the same approach as
 * the player portraits and the team emblems elsewhere in the hub. No images to
 * load, nothing to license, nothing that can 404, and a new sport's card exists
 * the moment its manifest does.
 *
 * Sports still being built are shown too, in a separate strip that says so and
 * cannot be clicked. A roadmap is worth showing; a button that does nothing is
 * not, so these are not buttons.
 * ------------------------------------------------------------------------- */

/** Draws a manifest's preview at device resolution. */
function previewCanvas(sport: SportManifest, cw: number, ch: number): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = h('canvas', { class: 'sport-card__art' });
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = '100%';
  canvas.style.aspectRatio = `${cw} / ${ch}`;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    // Crisp edges: this is pixel art drawn at 1x, then scaled by the device.
    ctx.imageSmoothingEnabled = false;
    sport.preview(ctx, cw, ch, sport.theme);
  }
  return canvas;
}

function card(app: App, sport: SportManifest): HTMLElement {
  const progress = lastProgress(sport.id);
  return h('button', {
    class: 'sport-card',
    style: `--card-accent:${sport.theme.accent};--card-ink:${sport.theme.accentInk}`,
    on: { click: () => enterSport(app, sport) },
  },
    h('div', { class: 'sport-card__frame' }, previewCanvas(sport, 132, 74)),
    h('div', { class: 'sport-card__body' },
      h('div', { class: 'sport-card__head' },
        h('div', { class: 'sport-card__name display', text: sport.name }),
        progress ? h('span', { class: 'sport-card__badge', text: 'CONTINUE' }) : null),
      h('div', { class: 'sport-card__title', text: sport.title }),
      h('div', { class: 'sport-card__blurb', text: sport.blurb }),
      h('div', { class: 'sport-card__modes' },
        ...sport.modes.map((m) => h('span', { class: 'sport-card__mode', text: m }))),
      progress
        ? h('div', { class: 'sport-card__resume', text: `${progress.label} · ${progress.detail}` })
        : h('div', { class: 'sport-card__resume sport-card__resume--new', text: sport.tagline })),
  );
}

function plannedCard(sport: SportManifest): HTMLElement {
  return h('div', { class: 'sport-soon' },
    h('div', { class: 'sport-soon__frame' }, previewCanvas(sport, 84, 48)),
    h('div', { class: 'sport-soon__body' },
      h('div', { class: 'sport-soon__name display', text: sport.name }),
      h('div', { class: 'sport-soon__note', text: sport.plannedNote ?? 'In development.' })),
  );
}

export class SportSelectScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    // Reached by backing out of a sport as well as forwards from the title, so
    // the hub's own colours are re-asserted on every mount.
    leaveSportChrome();

    const playable = playableSports();
    const planned = plannedSports();

    this.el = h('div', { class: 'screen' },
      topbar(app, 'Play Now', 'Choose your sport'),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          h('div', { class: 'sport-grid' }, ...playable.map((s) => card(app, s))),
          planned.length
            ? h('div', { class: 'panel' },
              h('div', { class: 'panel__head', text: 'Coming to the hub' }),
              h('div', { class: 'panel__body stack' },
                h('div', {
                  class: 'small',
                  text: 'Each of these is a full game to build, not a reskin of one that '
                    + 'exists. They arrive finished or not at all.',
                }),
                h('div', { class: 'sport-soon-grid' }, ...planned.map(plannedCard))))
            : null,
        ),
      ),
    );
  }

  resume(): void {
    leaveSportChrome();
  }
}
