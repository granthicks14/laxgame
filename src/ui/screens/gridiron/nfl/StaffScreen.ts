import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { panel, screenEl, topbar } from '../../../components';
import {
  STAFF_LABELS, STAFF_ROLES, STAFF_TITLE, STAFF_BLURB, type Staff, type StaffRole,
} from '../../../../sports/football/franchise/types';
import { coachingOf } from '../../../../sports/football/franchise/staff';
import { staffFit } from '../../../../sports/football/franchise/autogm';
import { push } from '../../../../sports/football/franchise/news';
import type { Franchise } from '../../../../sports/football/franchise/types';
import { kv, money } from './parts';

/* ---------------------------------------------------------------------------
 * THE COACHING STAFF
 * ---------------------------------------------------------------------------
 * Three men, three numbers each, and every one of those nine numbers does
 * something the franchise reads. There is no charisma rating here that nothing
 * consults and no scheme fit that resolves to a shrug — a coordinator's page
 * says exactly what he is worth, in the units the rest of the game uses.
 *
 * THEY COST MONEY, and it is the same money the buildings cost. That is the
 * whole feature: a better defensive coordinator or a medical wing, not both.
 * ------------------------------------------------------------------------- */

export class StaffScreen implements Screen {
  el: HTMLElement;
  private fr: Franchise;
  private onChange: () => void;
  private body = h('div', { class: 'wrapper stack' });

  constructor(app: App, fr: Franchise, onChange: () => void) {
    this.fr = fr;
    this.onChange = onChange;
    this.el = screenEl(
      topbar(app, 'Coaching staff', `${money(fr.funds)} in the budget`),
      h('div', { class: 'scroll' }, this.body),
    );
    this.paint();
  }

  private paint(): void {
    const fr = this.fr;
    const c = coachingOf(fr.staff);
    const parts: HTMLElement[] = [];

    for (const role of STAFF_ROLES) parts.push(this.card(fr.staff[role]));

    parts.push(panel('What they are worth',
      kv('Passing game', `+${c.passing.toFixed(1)} to your quarterback, +${c.routes.toFixed(1)} to receivers`),
      kv('Running game', `+${c.protection.toFixed(1)} to the line, +${c.carry.toFixed(1)} to the backs`),
      kv('Defence', `+${c.coverage.toFixed(1)} coverage, +${c.front.toFixed(1)} up front, +${c.takeaway.toFixed(1)} takeaways`),
      kv('Development', `×${c.development.toFixed(2)} for everybody, ×${c.qbDevelopment.toFixed(2)} at quarterback`),
      kv('The room', `${c.morale >= 0 ? '+' : ''}${c.morale.toFixed(1)} morale a week`),
      kv('Front office', `${Math.round(c.management * 100)}% better at contracts and trades`),
      h('div', {
        class: 'tiny',
        text: 'Small numbers on purpose. A great coordinator is worth a few points '
          + 'across a unit and never worth more than the players in it.',
      })));

    if (fr.staffMarket.length) {
      parts.push(panel('Available this spring',
        h('div', { class: 'tiny', text: 'Hiring one pays him out of the same budget the buildings come from.' }),
        ...fr.staffMarket.map((s) => this.candidate(s))));
    } else {
      parts.push(panel('The market',
        h('div', { class: 'small', text: 'Nobody is available until the offseason.' })));
    }

    this.body.replaceChildren(...parts);
  }

  private card(s: Staff): HTMLElement {
    const labels = STAFF_LABELS[s.role];
    const blurbs = STAFF_BLURB[s.role];
    return panel(`${STAFF_TITLE[s.role]} — ${s.name}`,
      h('div', {
        class: 'tiny',
        text: `${staffFit(s.overall)} · age ${s.age} · ${s.tenure} ${s.tenure === 1 ? 'season' : 'seasons'} here `
          + `· ${money(s.salary)} a year`,
      }),
      ...labels.map((label, i) => h('div', { class: 'meter' },
        h('div', { class: 'meter__label', text: label }),
        h('div', { class: 'meter__track' },
          h('div', {
            class: 'meter__fill',
            style: `width:${Math.max(3, Math.min(100, (s.ratings[i] - 25) / 0.74))}%`,
          })),
        h('div', { class: 'meter__num num', text: String(s.ratings[i]) }))),
      h('div', { class: 'tiny', text: blurbs.join(' · ') }));
  }

  private candidate(s: Staff): HTMLElement {
    const fr = this.fr;
    const current = fr.staff[s.role];
    const better = s.overall - current.overall;
    const afford = fr.funds >= s.salary;
    return h('div', { class: 'job' },
      h('div', { class: 'job__head' },
        h('div', { class: 'job__name', text: `${s.name} — ${STAFF_TITLE[s.role]}` }),
        h('div', { class: 'job__ask num', text: money(s.salary) })),
      h('div', {
        class: 'job__note tiny',
        text: `${staffFit(s.overall)} (${s.overall}) · age ${s.age} · `
          + STAFF_LABELS[s.role].map((l, i) => `${l} ${s.ratings[i]}`).join(', '),
      }),
      h('div', {
        class: `tiny ${better > 0 ? 'good' : 'warn'}`,
        text: better > 0
          ? `${better} better than ${current.name}.`
          : `${Math.abs(better)} worse than ${current.name}. He is not an upgrade.`,
      }),
      h('button', {
        class: 'btn btn--sm',
        text: afford ? `Hire — ${money(s.salary)}` : 'Not enough in the budget',
        disabled: !afford,
        on: {
          click: () => {
            if (fr.funds < s.salary) return;
            fr.funds = Math.round((fr.funds - s.salary) * 10) / 10;
            const old = fr.staff[s.role];
            fr.staff[s.role] = { ...s, tenure: 0 };
            fr.staffMarket = fr.staffMarket.filter((x) => x.id !== s.id);
            push(fr, 'staff', `${s.name} comes in as ${s.role}, replacing ${old.name}.`);
            this.onChange();
            this.paint();
          },
        },
      }));
  }
}

export type { StaffRole };
