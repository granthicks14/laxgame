import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { panel, screenEl, topbar } from '../../../components';
import { teamOr } from '../../../../sports/football/nfl';
import {
  FACILITIES, expensesFor, facilityCost, facilityUpkeep, fanMood,
  revenueFor, upgradeFacility,
} from '../../../../sports/football/franchise/club';
import {
  FACILITY_KEYS, FACILITY_MAX, type FacilityKey, type Franchise,
} from '../../../../sports/football/franchise/types';
import { push } from '../../../../sports/football/franchise/news';
import { kv, money, tile, tileGrid } from './parts';

/* ---------------------------------------------------------------------------
 * THE BUILDINGS AND THE BOOKS
 * ---------------------------------------------------------------------------
 * FIVE BUILDINGS, NOT THIRTY. Each one changes something a coach can feel in a
 * season — how fast his young players improve, how long his hurt ones are out,
 * how much the gate is worth, how good his draft reports are, how clean his
 * football looks — and each one says what it is currently doing rather than
 * making somebody guess from a level number.
 *
 * The books are three lines. Nobody came to a football game to do accounting,
 * and a finances page with a ledger on it is a page players skip past on their
 * way to the part with football in it.
 * ------------------------------------------------------------------------- */

export class FacilitiesScreen implements Screen {
  el: HTMLElement;
  private fr: Franchise;
  private onChange: () => void;
  private body = h('div', { class: 'wrapper stack' });

  constructor(app: App, fr: Franchise, onChange: () => void) {
    this.fr = fr;
    this.onChange = onChange;
    this.el = screenEl(
      topbar(app, 'Facilities', `${money(fr.funds)} available`),
      h('div', { class: 'scroll' }, this.body),
    );
    this.paint();
  }

  private paint(): void {
    const fr = this.fr;
    const team = teamOr(fr.teamId);
    const projected = revenueFor(fr, 0, false);

    this.body.replaceChildren(
      tileGrid(
        tile('Funds', money(fr.funds), 'To spend'),
        tile('Support', String(fr.fanSupport), fanMood(fr.fanSupport)),
        /* A PROJECTION IS LABELLED AS ONE. In a franchise's first year there
         * is no last year, and a number that says "last year" when it means
         * "probably" is a number nobody can trust afterwards. */
        tile(fr.lastRevenue ? 'Last year in' : 'Income (projected)',
          money(fr.lastRevenue || projected), 'Gate, TV, shirts'),
        tile(fr.lastExpenses ? 'Last year out' : 'Costs (projected)',
          money(fr.lastExpenses || expensesFor(fr)), 'Staff and upkeep')),

      panel('The books',
        kv('Market', `${team.city} — ${['tiny', 'small', 'fair', 'good', 'big'][team.market - 1]}`),
        kv('Projected income', `${money(projected)} a season at this level of support`),
        kv('Staff wages', money(fr.staff.HC.salary + fr.staff.OC.salary + fr.staff.DC.salary)),
        kv('Upkeep', money(facilityUpkeep(fr))),
        h('div', {
          class: 'tiny',
          text: 'Player salaries come out of the cap, not out of this. This is what '
            + 'the club has to spend on itself.',
        })),

      ...FACILITY_KEYS.map((k) => this.building(k)),
    );
  }

  private building(key: FacilityKey): HTMLElement {
    const fr = this.fr;
    const info = FACILITIES[key];
    const level = fr.facilities[key];
    const cost = facilityCost(fr, key);
    const afford = cost !== null && fr.funds >= cost;

    return h('div', { class: 'upgrade' },
      h('div', { class: 'upgrade__body' },
        h('div', { class: 'upgrade__name', text: `${info.label} — level ${level} of ${FACILITY_MAX}` }),
        h('div', { class: 'upgrade__blurb tiny', text: info.blurb }),
        h('div', { class: 'tiny good', text: `Now: ${info.effect(level)}` }),
        cost !== null
          ? h('div', { class: 'tiny', text: `Next: ${info.effect(level + 1)}` })
          : h('div', { class: 'tiny', text: 'Nothing left to build here.' }),
        h('div', { class: 'meter__track', style: 'margin-top:6px' },
          h('div', { class: 'meter__fill', style: `width:${(level / FACILITY_MAX) * 100}%` }))),
      cost === null
        ? h('div', { class: 'upgrade__cost num', text: 'MAX' })
        : h('button', {
          class: 'btn btn--sm',
          text: `Build — ${money(cost)}`,
          disabled: !afford,
          on: {
            click: () => {
              if (!upgradeFacility(fr, key)) return;
              push(fr, 'league', `${info.label} upgraded to level ${fr.facilities[key]}.`);
              this.onChange();
              this.paint();
            },
          },
        }));
  }
}
