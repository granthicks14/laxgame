import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, panelFlush } from '../../../components';
import {
  BRANCHES, BRANCH_ORDER, UPGRADES, buyUpgrade, coachLevel, coachSummary,
  lockReason, priceOf, xpToNextLevel,
} from '../../../../sports/basketball/career/coach';
import { TIERS, modsFor } from '../../../../sports/basketball/career/difficulty';
import { saveHoopsCareer } from '../../../../sports/basketball/career/save';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { kvRow, pill } from './bits';

/* ---------------------------------------------------------------------------
 * THE COACH'S OFFICE
 * ---------------------------------------------------------------------------
 * Six branches, twenty-six upgrades, and not enough points to buy them — ever.
 * That is the design: a career is a sequence of choices about what kind of coach
 * you are, and a tree you can finish is a tree that stopped asking.
 *
 * Two gates, and they are different on purpose. LEVEL is experience, which comes
 * from seasons and wins and is the same on every difficulty. PRICE is money, and
 * the difficulty tier scales it — which is why a harder career is a career with
 * fewer of these, not a career with worse players.
 * ------------------------------------------------------------------------- */

export class OfficeScreen implements Screen {
  el: HTMLElement;
  private body!: HTMLElement;

  constructor(private app: App, private career: HoopsCareer) {
    this.el = screenEl(
      topbar(app, 'The office', coachSummary(career.coach)),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private buy(key: string): void {
    const c = this.career;
    const scale = modsFor(c.tier).upgradeCost;
    if (buyUpgrade(c.coach, key, scale)) {
      saveHoopsCareer(c);
      this.app.toast('Bought.');
      this.paint();
    } else {
      this.app.toast('You cannot buy that yet.', 'bad');
    }
  }

  private paint(): void {
    const c = this.career;
    const scale = modsFor(c.tier).upgradeCost;
    const level = coachLevel(c.coach);
    const xp = xpToNextLevel(c.coach);
    const owned = new Set(c.coach.owned);

    this.body.replaceChildren(
      panel(null,
        kvRow(
          ['Points', String(c.coach.points)],
          ['Level', String(level)],
          ['Owned', `${c.coach.owned.length}/${UPGRADES.length}`],
          ['Seasons', String(c.coach.seasons)],
        ),
        h('div', { class: 'tiny',
          text: `${xp.have} of ${xp.need} toward level ${level + 1}. `
            + `Prices here are ${TIERS[c.tier].name.toLowerCase()}: `
            + `${scale === 1 ? 'the honest ones' : `${Math.round(scale * 100)}% of the honest ones`}.` })),

      ...BRANCH_ORDER.map((branch) => panelFlush(BRANCHES[branch].label,
        h('div', { class: 'prospect__open tiny', text: BRANCHES[branch].blurb }),
        ...UPGRADES.filter((u) => u.branch === branch).map((u) => {
          const has = owned.has(u.key);
          const why = has ? null : lockReason(c.coach, u, scale);
          const price = priceOf(u, scale);
          return h(has ? 'div' : 'button', {
            class: `roster-row${has ? ' roster-row--on' : ''}`,
            ...(has ? {} : { on: { click: () => this.buy(u.key) } }),
          },
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: u.label }),
            h('div', { class: 'roster-row__note tiny', text: u.blurb }),
            why ? h('div', { class: 'tiny warn', text: why }) : null),
          has ? pill('OWNED', 'good')
            : h('span', { class: 'roster-row__ovr num', text: String(price) }));
        }))),

      h('div', { class: 'tiny',
        text: 'You will not buy all of this. A career is a decision about which coach '
          + 'you are going to be, and the tree is deliberately longer than a lifetime.' }),
    );
  }
}
