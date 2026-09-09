/* ---------------------------------------------------------------------------
 * CHOOSING HOW HARD THE CLIMB IS
 * ---------------------------------------------------------------------------
 * Four tiers, chosen once, before the first job. Two screens:
 *
 *   ChallengeDifficultyScreen  the four cards. Tapping one opens its detail,
 *                              which for every tier above Standard answers one
 *                              question: what makes this harder than the tier
 *                              below it?
 *   DifficultyCompareScreen    all four side by side, every modifier, no
 *                              omissions.
 *
 * Nothing on either screen is written by hand. Every number, label and arrow is
 * generated from the modifier table in challenge/difficulty.ts — the same table
 * the simulation reads — so the game cannot tell the player one thing and do
 * another.
 * ------------------------------------------------------------------------- */

import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel } from '../components';
import {
  MODIFIER_SPECS, TIERS, TIER_ORDER, differencesFrom, tierBelow,
  type ChallengeTier, type ModifierSpec,
} from '../../challenge/difficulty';
import { loadHall } from '../../state/hall';
import { stageAt } from '../../challenge/ladder';

/* ------------------------------------------------------------ the picker */

export class ChallengeDifficultyScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, chosen: ChallengeTier, onChoose: (tier: ChallengeTier) => void) {
    // The selection lives in settings, not in this screen. Opening the
    // comparison and coming back re-creates the screen from its factory (see
    // App.pop), so a local variable would silently lose the player's choice —
    // and it would be lost at exactly the moment they had just finished
    // deciding. It doubles as remembering the tier for next time.
    const current = (): ChallengeTier =>
      (TIER_ORDER.includes(app.settings.challengeTier as ChallengeTier)
        ? app.settings.challengeTier as ChallengeTier
        : chosen);
    let open: ChallengeTier | null = current();
    const body = h('div', { class: 'wrapper stack' });

    const render = () => {
      clear(body);
      body.appendChild(h('div', { class: 'chapter' },
        h('div', { class: 'chapter__title display', text: 'How hard do you want this?' }),
        h('div', {
          class: 'chapter__body',
          text: 'Every tier plays the same sport against the same teams. What changes is how '
            + 'much the game gives you and how well everybody else uses what they have — never '
            + 'the ratings of the opposition.',
        })));

      for (const tier of TIER_ORDER) {
        body.appendChild(this.card(tier, tier === current(), tier === open, () => {
          open = open === tier ? null : tier;
          app.updateSettings({ challengeTier: tier });
          render();
        }));
      }

      body.appendChild(h('button', {
        class: 'btn btn--block',
        text: 'Compare all four side by side',
        on: { click: () => app.push((a) => new DifficultyCompareScreen(a)) },
      }));

      body.appendChild(h('button', {
        class: 'btn btn--primary btn--block',
        style: 'min-height:54px;font-size:18px',
        text: `Start on ${TIERS[current()].name}`,
        on: { click: () => onChoose(current()) },
      }));

      body.appendChild(h('div', {
        class: 'tiny',
        text: 'Your difficulty is fixed for the life of the career. It is shown on your record '
          + 'and it multiplies your legacy score.',
      }));
    };
    render();

    this.el = screenEl(
      topbar(app, 'Difficulty', 'Chosen once, for the career'),
      h('div', { class: 'scroll' }, body),
    );
  }

  /** One tier: always its identity, and when open, exactly what it changes. */
  private card(
    tier: ChallengeTier, selected: boolean, open: boolean, onTap: () => void,
  ): HTMLElement {
    const info = TIERS[tier];
    const below = tierBelow(tier);
    const diffs = differencesFrom(tier);
    const record = loadHall()[tier];

    const head = h('button', {
      class: 'btn btn--block',
      style: `justify-content:flex-start;text-align:left;padding:12px;min-height:auto;`
        + `border-color:${selected ? info.colour : 'var(--line)'};`
        + `${selected ? `box-shadow:inset 0 0 0 1px ${info.colour}` : ''}`,
      on: { click: onTap },
    },
      h('span', { class: 'stack', style: 'gap:3px;min-width:0;flex:1 1 auto' },
        h('span', { class: 'row', style: 'gap:8px;align-items:baseline' },
          h('span', {
            class: 'display',
            style: `font-size:17px;color:${info.colour}`,
            text: info.name,
          }),
          selected ? h('span', { class: 'pill pill--green', text: 'SELECTED' }) : null),
        h('span', { class: 'tiny', style: 'text-transform:none;letter-spacing:0', text: info.tagline }),
        // What you have already done here, so the choice is a decision about
        // your own record rather than an abstract one about numbers.
        record
          ? h('span', {
            class: 'tiny',
            style: 'text-transform:none;letter-spacing:0;color:var(--accent)',
            text: record.fastestFinish !== null
              ? `Conquered in ${record.fastestFinish} seasons · best legacy ${record.bestLegacy}`
              : `${record.careers} career${record.careers === 1 ? '' : 's'} · furthest `
                + `${stageAt(record.bestRung).short} · best legacy ${record.bestLegacy}`,
          })
          : null));

    if (!open) return head;

    const detail = h('div', { class: 'stack', style: 'gap:8px;padding:2px 2px 4px' },
      h('div', { class: 'small', text: info.blurb }),
      h('div', { class: 'tiny', text: info.expectation }));

    if (!below) {
      // Standard is the thing everything else is measured against, so it lists
      // what it IS rather than what it changes.
      detail.appendChild(h('div', { class: 'eyebrow', text: 'Baseline experience' }));
      for (const spec of MODIFIER_SPECS) {
        detail.appendChild(h('div', { class: 'row', style: 'gap:8px;align-items:baseline' },
          h('span', { style: 'color:var(--green)', text: '✓' }),
          h('span', {
            class: 'tiny',
            style: 'text-transform:none;letter-spacing:0;flex:1 1 auto',
            text: spec.baseline,
          })));
      }
    } else {
      detail.appendChild(h('div', {
        class: 'eyebrow',
        text: `What makes this harder than ${TIERS[below].name}?`,
      }));
      for (const d of diffs) {
        detail.appendChild(h('div', { class: 'row', style: 'gap:8px;align-items:baseline' },
          h('span', {
            style: `color:${d.harder ? 'var(--red)' : 'var(--green)'};width:12px`,
            text: d.spec.higherIsHarder === d.harder ? '⬆' : '⬇',
          }),
          h('span', {
            class: 'tiny',
            style: 'text-transform:none;letter-spacing:0;flex:1 1 auto;color:var(--text-2)',
            text: d.text,
          })));
      }
      detail.appendChild(h('div', {
        class: 'tiny',
        style: 'margin-top:2px',
        text: `Legacy score ×${TIERS[tier].mods.legacy} — and every rival programme still plays `
          + 'by exactly the rules you do.',
      }));
    }

    return h('div', { class: 'panel' },
      h('div', { class: 'panel__body stack', style: 'gap:8px' }, head, detail));
  }
}

/* --------------------------------------------------------- the comparison */

export class DifficultyCompareScreen implements Screen {
  el: HTMLElement;

  constructor(app: App) {
    const groups = [...new Set(MODIFIER_SPECS.map((s) => s.group))];
    const body = h('div', { class: 'wrapper stack' });

    body.appendChild(h('div', {
      class: 'small',
      text: 'Every modifier, on every tier. Percentages are relative to Standard, which is the '
        + 'baseline by definition. On a narrow screen the tables scroll sideways to reach '
        + 'Impossible and Final.',
    }));

    for (const group of groups) {
      body.appendChild(panel(group, this.table(MODIFIER_SPECS.filter((s) => s.group === group))));
    }

    body.appendChild(panel('Legacy', this.table([{
      label: 'Legacy multiplier',
      group: 'Coach progression',
      field: 'legacy',
      higherIsHarder: false,
      format: (v: number) => `${v}x`,
      delta: () => '',
      baseline: 'Standard legacy scoring',
    }])));

    body.appendChild(h('div', {
      class: 'tiny',
      text: 'What is NOT on this table: opponent ratings. No tier gives a rival programme a '
        + 'player, a point of rating or a resource you do not have. The whole difference is '
        + 'what you are given and how well everybody else uses what they have.',
    }));

    this.el = screenEl(
      topbar(app, 'Compared', 'All four tiers'),
      h('div', { class: 'scroll' }, body),
    );
  }

  private table(specs: ModifierSpec[]): HTMLElement {
    const head = h('tr', null,
      h('th', { style: 'text-align:left;white-space:nowrap', text: 'Feature' }),
      ...TIER_ORDER.map((t) => h('th', {
        style: `color:${TIERS[t].colour};font-size:11px;white-space:nowrap`,
        text: TIERS[t].mark,
      })));
    const rows = specs.map((spec) => h('tr', null,
      h('td', { style: 'text-align:left;white-space:nowrap', text: spec.label }),
      ...TIER_ORDER.map((t) => {
        const value = TIERS[t].mods[spec.field];
        const base = TIERS.standard.mods[spec.field];
        const harder = spec.higherIsHarder ? value > base : value < base;
        return h('td', {
          class: 'num',
          style: `white-space:nowrap${harder ? ';color:var(--red)' : ''}`,
          text: spec.format(value),
        });
      })));
    return h('div', { class: 'table-wrap' },
      h('table', { class: 'table table--compact' },
        h('thead', null, head),
        h('tbody', null, ...rows)));
  }
}
