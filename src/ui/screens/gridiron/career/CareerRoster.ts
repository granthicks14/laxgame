import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, segmented } from '../../../components';
import {
  ATTR_LABEL, POSITIONS, POSITION_LABEL, depthAt, teamRatings, type Player, type Position,
} from '../../../../sports/football/data';
import { shapeFor, MINIMUM_SHAPE } from '../../../../sports/football/levels';
import {
  UPGRADES, buyUpgrade, canBuy, costOf, perksOf, rankOf,
} from '../../../../sports/football/career/coach';
import type { FootballCareer } from '../../../../sports/football/career/types';

/* ---------------------------------------------------------------------------
 * THE ROSTER, AND THE MAN COACHING IT
 * ---------------------------------------------------------------------------
 * Two things a coach does between games, on one screen because they are the same
 * decision seen from two ends: who he has, and what he is doing about it.
 *
 * THE DEPTH CHART IS THE SCREEN. Football is the sport where a roster is read by
 * position and nothing else — nobody wants an alphabetical list of thirty-five
 * men — so it is grouped, best first, with the NEED at each position said out
 * loud. A coach who cannot see that he is one linebacker from a problem will
 * find out about it in January.
 * ------------------------------------------------------------------------- */

type Tab = 'squad' | 'coach';

export class CareerRosterScreen implements Screen {
  el: HTMLElement;
  private tab: Tab = 'squad';
  private body = h('div', { class: 'stack' });

  constructor(app: App, private career: FootballCareer, private onChange: () => void) {
    this.paint();
    this.el = screenEl(
      topbar(app, 'The programme', `${career.roster.length} players`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          segmented<Tab>(
            [{ value: 'squad', label: 'Depth chart' }, { value: 'coach', label: 'Coaching' }],
            this.tab,
            (v) => { this.tab = v; this.paint(); }, true),
          this.body)),
    );
  }

  private paint(): void {
    this.body.replaceChildren(...(this.tab === 'squad' ? this.squad() : this.coaching()));
  }

  private squad(): HTMLElement[] {
    const c = this.career;
    const shape = shapeFor(c.level);
    const r = teamRatings(c.roster);

    const out: HTMLElement[] = [
      panel('The team',
        h('div', { class: 'meter' },
          h('div', { class: 'meter__label tiny', text: 'Passing' }),
          h('div', { class: 'meter__track' }, h('div', { class: 'meter__fill', style: `width:${r.passing}%` })),
          h('div', { class: 'meter__num num', text: String(r.passing) })),
        h('div', { class: 'meter' },
          h('div', { class: 'meter__label tiny', text: 'Rushing' }),
          h('div', { class: 'meter__track' }, h('div', { class: 'meter__fill', style: `width:${r.rushing}%` })),
          h('div', { class: 'meter__num num', text: String(r.rushing) })),
        h('div', { class: 'meter' },
          h('div', { class: 'meter__label tiny', text: 'Pass defence' }),
          h('div', { class: 'meter__track' }, h('div', { class: 'meter__fill', style: `width:${r.passDefense}%` })),
          h('div', { class: 'meter__num num', text: String(r.passDefense) })),
        h('div', { class: 'meter' },
          h('div', { class: 'meter__label tiny', text: 'Run defence' }),
          h('div', { class: 'meter__track' }, h('div', { class: 'meter__fill', style: `width:${r.runDefense}%` })),
          h('div', { class: 'meter__num num', text: String(r.runDefense) }))),
    ];

    for (const pos of POSITIONS) {
      const men = depthAt(c.roster, pos);
      const want = shape[pos];
      const floor = MINIMUM_SHAPE[pos];
      /* WHAT "SHORT" MEANS, said in words rather than as a colour a player has
       * to learn. Below the floor is a squad that cannot line up; below the
       * shape is a squad with no cover. */
      const need = men.length < floor ? 'CANNOT FIELD ONE'
        : men.length < want ? 'thin'
          : men.length > want + 2 ? 'deep' : '';
      out.push(panel(`${POSITION_LABEL[pos]} — ${men.length}/${want}${need ? ` · ${need}` : ''}`,
        ...(men.length
          ? men.map((p, i) => this.playerRow(p, i === 0))
          : [h('div', { class: 'small', text: 'Nobody.' })])));
    }
    return out;
  }

  private playerRow(p: Player, starter: boolean): HTMLElement {
    const c = this.career;
    const line = c.season[p.id];
    const bits: string[] = [`${p.years}${['st', 'nd', 'rd', 'th'][Math.min(3, p.years - 1)]} year`];
    if (p.potential > p.overall + 3) bits.push(`ceiling ${p.potential}`);
    if (line) {
      if (line.passYards) bits.push(`${line.passYards} pass yds`);
      else if (line.rushYards) bits.push(`${line.rushYards} rush yds`);
      else if (line.recYards) bits.push(`${line.recYards} rec yds`);
      else if (line.tackles) bits.push(`${line.tackles} tackles`);
    }
    const top = (Object.keys(p.attrs) as (keyof typeof p.attrs)[])
      .sort((a, b) => p.attrs[b] - p.attrs[a])[0];
    return h('div', { class: `roster-row${starter ? ' is-starter' : ''}` },
      h('span', { class: 'roster-row__num num', text: `#${p.number}` }),
      h('div', { class: 'roster-row__body' },
        h('div', { class: 'roster-row__name', text: `${p.first} ${p.last}` }),
        h('div', { class: 'roster-row__note tiny', text: `${bits.join(' · ')} · best: ${ATTR_LABEL[top]}` })),
      h('span', { class: 'roster-row__ovr num', text: String(p.overall) }));
  }

  private coaching(): HTMLElement[] {
    const c = this.career;
    const perks = perksOf(c.coach);
    const groups: { key: 'offence' | 'defence' | 'programme'; label: string }[] = [
      { key: 'offence', label: 'Offence' },
      { key: 'defence', label: 'Defence' },
      { key: 'programme', label: 'The programme' },
    ];

    const out: HTMLElement[] = [
      panel('Coach Points',
        h('div', { class: 'career-head__rec num', text: String(c.coach.points) }),
        h('div', { class: 'tiny' },
          'Earned by winning, and by winning more than the programme had any right to. '
          + 'Every rank costs more than the last, so there is always something left to buy.'),
        h('div', { class: 'small' },
          `Development ×${perks.development.toFixed(2)} · `
          + `${perks.visits} extra visits · ${perks.offers} extra offers`)),
    ];

    for (const g of groups) {
      out.push(panel(g.label, ...UPGRADES.filter((u) => u.group === g.key).map((u) => {
        const rank = rankOf(c.coach, u.id);
        const cost = costOf(c.coach, u.id);
        const afford = canBuy(c.coach, u.id);
        return h('button', {
          class: `upgrade${afford ? '' : ' is-off'}`,
          on: {
            click: () => {
              if (!buyUpgrade(c.coach, u.id)) return;
              this.onChange();
              this.paint();
            },
          },
        },
        h('div', { class: 'upgrade__body' },
          h('div', { class: 'upgrade__name', text: `${u.name}${rank ? ` — rank ${rank}` : ''}` }),
          h('div', { class: 'upgrade__blurb tiny', text: u.blurb })),
        h('div', { class: 'upgrade__cost num', text: String(cost) }));
      })));
    }
    return out;
  }
}

export const positionsInOrder: Position[] = POSITIONS;
