/**
 * The roster-needs panel.
 *
 * One component, used wherever a coach makes a squad decision — the offseason,
 * the recruiting board and the transfer window — so the needs he reads are
 * always the needs the recruits are reading. It renders `rosterNeeds()` and
 * nothing else: there is no second copy of the arithmetic here.
 */
import { h } from './dom';
import { panelFlush } from './components';
import { rosterNeeds, needSummary, type NeedLevel, type PositionNeed } from '../league/rosterNeeds';
import type { Career } from '../league/types';

/** Five marks, warm for urgent and quiet for full. */
const NEED_COLOUR: Record<NeedLevel, string> = {
  0: 'var(--muted)',
  1: 'var(--text-2)',
  2: 'var(--blue)',
  3: 'var(--orange)',
  4: 'var(--red)',
};

function needMark(n: PositionNeed): HTMLElement {
  if (n.need === 0) {
    return h('span', { class: 'need__mark need__mark--full', text: '— FULL —' });
  }
  return h('span', { class: 'need__mark', style: `color:${NEED_COLOUR[n.need]}` },
    h('span', { class: 'need__stars', text: '★'.repeat(n.need) + '☆'.repeat(4 - n.need) }),
    h('span', { text: n.needLabel.toUpperCase() }));
}

function row(n: PositionNeed): HTMLElement {
  return h('div', { class: `need need--${n.need}` },
    h('div', { class: 'need__head' },
      h('span', { class: 'need__pos display', text: n.label }),
      needMark(n)),
    h('div', { class: 'need__grid' },
      cell('On roster', String(n.have)),
      cell('Returning', String(n.returning)),
      cell('Incoming', String(n.incoming)),
      cell('Projected', `${n.projected}/${n.slots}`),
      cell('Open', String(n.open)),
      cell('Avg OVR', n.avgOverall ? String(n.avgOverall) : '—')),
    h('div', { class: 'need__note tiny', text: needSummary(n) }));
}

function cell(label: string, value: string): HTMLElement {
  return h('div', { class: 'need__cell' },
    h('div', { class: 'need__label', text: label }),
    h('div', { class: 'need__value num', text: value }));
}

/**
 * `title` is passed by screens that want their own heading; the default says
 * what the panel is for on a screen that has not introduced it.
 */
export function rosterNeedsPanel(career: Career, title = 'Roster needs'): HTMLElement {
  const needs = rosterNeeds(career);
  const ordered = [...needs.list].sort((a, b) => b.need - a.need || b.open - a.open);
  return panelFlush(title,
    h('div', { class: 'need__top' },
      h('div', { class: 'small', text: `${needs.openSpots} open roster spot${needs.openSpots === 1 ? '' : 's'}` }),
      h('div', {
        class: 'tiny',
        text: `Squad ${needs.size} now · ${needs.projectedSize} of ${needs.cap} projected`
          + (needs.incoming ? ` · ${needs.incoming} committed` : ''),
      })),
    h('div', { class: 'need__list' }, ...ordered.map(row)));
}

/** A single line for a screen with no room for the full panel. */
export function needsLine(career: Career): string {
  const needs = rosterNeeds(career);
  const worst = [...needs.list].sort((a, b) => b.need - a.need)[0];
  if (!worst || worst.need === 0) return 'Squad is full at every position.';
  return `${needs.openSpots} open · biggest need: ${worst.label.toLowerCase()} (${worst.needLabel.toLowerCase()})`;
}
