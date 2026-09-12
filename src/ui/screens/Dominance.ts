/* ---------------------------------------------------------------------------
 * THE DOMINANCE TRACKER
 * ---------------------------------------------------------------------------
 * Super Challenge asks for three championships inside any ten consecutive
 * seasons, and the one thing a rolling window must never be is mysterious. The
 * coach has to be able to see, at a glance:
 *
 *   which ten seasons he is being judged on right now,
 *   how many titles are inside them,
 *   how long before the oldest one rolls out,
 *   the best stretch he has ever put together,
 *   and that falling short of it is not a failure.
 *
 * Every number here is read straight off the record book by `dominance()`,
 * so the tracker cannot disagree with the seasons it is counting.
 * ------------------------------------------------------------------------- */

import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, emptyPanel } from '../components';
import { loadCareer } from '../../state/saves';
import { dominance, dominanceLine, type Dominance } from '../../challenge/dominance';
import { tierInfo } from '../../challenge/difficulty';
import { trophyIcon } from '../icons';
import { stageAt } from '../../challenge/ladder';

/** The headline row: three slots, filled as the titles land. */
function pips(d: Dominance): HTMLElement {
  const row = h('div', { class: 'row', style: 'gap:6px' });
  for (let i = 0; i < d.need; i++) {
    const got = i < d.current.titles;
    row.appendChild(h('div', {
      class: 'dom-pip',
      style: got ? 'background:var(--accent);border-color:var(--accent)' : '',
    }, got ? trophyIcon(18) : null));
  }
  return row;
}

function stat(label: string, value: string, tone = ''): HTMLElement {
  return h('div', { class: 'dom-stat' },
    h('div', { class: 'dom-stat__value display', style: tone, text: value }),
    h('div', { class: 'dom-stat__label', text: label }));
}

/**
 * The compact panel for the season hub. Big enough to read in one glance and
 * small enough to live above the next fixture.
 */
export function dominancePanel(app: App, d: Dominance, onOpen: () => void): HTMLElement {
  const done = d.achieved;
  return h('div', { class: `panel dom${done ? ' dom--done' : ''}` },
    h('div', { class: 'panel__head row', style: 'justify-content:space-between;align-items:baseline' },
      h('span', { text: done ? 'Dominance proved' : 'Dominance tracker' }),
      h('span', {
        class: 'tiny',
        text: done ? '' : `Seasons ${d.current.from}–${d.current.to}`,
      })),
    h('div', { class: 'panel__body stack', style: 'gap:10px' },
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;gap:12px' },
        h('div', { class: 'stack', style: 'gap:3px;min-width:0' },
          h('div', {
            class: 'display',
            style: `font-size:26px;line-height:1;color:${done ? 'var(--green)' : 'var(--text)'}`,
            text: `${d.current.titles} / ${d.need}`,
          }),
          h('div', { class: 'tiny', text: 'championships in this window' })),
        pips(d)),
      h('div', { class: 'small', text: dominanceLine(d) }),
      h('button', {
        class: 'btn btn--block btn--sm',
        text: 'Open the dominance tracker',
        on: { click: onOpen },
      })),
  );
  void app;
}

/* ------------------------------------------------------------- the screen */

export class DominanceScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const career = loadCareer('superchallenge');
    if (!career || !career.challenge) {
      this.el = screenEl(
        topbar(app, 'Dominance'),
        h('div', { class: 'scroll' }, h('div', { class: 'wrapper' }, emptyPanel(
          'No Super Challenge career',
          'Start one and this becomes the record of it: every ten-season stretch, every '
          + 'championship, and exactly how close you are.',
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ))),
      );
      return;
    }

    const state = career.challenge;
    const d = dominance(state);
    const info = tierInfo(state.tier);

    // A row per season, so the window is something you can actually look at
    // rather than a number you have to trust.
    const timeline = h('div', { class: 'dom-timeline' });
    for (let y = 1; y <= Math.max(d.seasons, 1); y++) {
      const step = state.steps.find((s) => s.year === y);
      const inWindow = y >= d.current.from && y <= d.current.to;
      const won = !!step?.champion;
      timeline.appendChild(h('div', {
        class: `dom-year${inWindow ? ' is-window' : ''}${won ? ' is-title' : ''}`,
        title: step
          ? `Season ${y} · ${step.teamShort} ${step.wins}-${step.losses}${won ? ' · CHAMPIONS' : ''}`
          : `Season ${y} · out of the game`,
        text: won ? '★' : `${y}`,
      }));
    }

    this.el = screenEl(
      topbar(app, 'Dominance', `${info.name} · season ${d.seasons}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          d.achieved
            ? h('div', { class: 'trophy' },
              h('div', { class: 'trophy__icon' }, trophyIcon(48)),
              h('div', { class: 'trophy__title', text: 'Super Challenge complete' }),
              h('div', {
                class: 'small',
                style: 'margin-top:6px',
                text: `Three championships in seasons ${d.achievedIn!.from}–${d.achievedIn!.to}.`,
              }))
            : panel('The requirement',
              h('div', { class: 'display', style: 'font-size:20px', text: '3 championships in 10 seasons' }),
              h('div', {
                class: 'small',
                text: 'Any ten consecutive seasons. There is no deadline and no way to fail it — '
                  + 'a window that closes short simply rolls forward and you keep coaching.',
              })),

          panel(`Current window · seasons ${d.current.from}–${d.current.to}`,
            h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;gap:12px' },
              h('div', {
                class: 'display',
                style: `font-size:34px;line-height:1;color:${d.achieved ? 'var(--green)' : 'var(--text)'}`,
                text: `${d.current.titles} / ${d.need}`,
              }),
              pips(d)),
            h('div', { class: 'small', text: dominanceLine(d) })),

          panel('The career',
            h('div', { class: 'dom-stats' },
              stat('Best ten-year run', `${d.best.titles}`,
                d.best.titles >= d.need ? 'color:var(--green)' : ''),
              stat('Career championships', `${d.careerTitles}`),
              stat('Seasons coached', `${d.seasons}`),
              stat('Level reached', stageAt(state.stageIndex).short))),

          panel('Every season',
            timeline,
            h('div', {
              class: 'tiny',
              text: 'Highlighted seasons are the ten you are judged on right now. A star is a '
                + 'championship. A season spent out of work still counts against the window.',
            })),

          d.titleYears.length
            ? panel('Championships',
              ...d.titleYears.map((y) => {
                const step = state.steps.find((s) => s.year === y);
                const inWindow = y >= d.current.from && y <= d.current.to;
                return h('div', { class: 'row', style: 'justify-content:space-between;gap:10px' },
                  h('span', {
                    class: 'small',
                    style: inWindow ? 'color:var(--accent)' : '',
                    text: `Season ${y} · ${step?.teamShort ?? ''}`,
                  }),
                  h('span', {
                    class: 'tiny',
                    text: inWindow ? 'in this window' : 'rolled out',
                  }));
              }))
            : null,
        )),
    );
  }
}
