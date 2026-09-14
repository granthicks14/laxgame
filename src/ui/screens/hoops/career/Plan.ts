import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, panelFlush } from '../../../components';
import { starters, teamRatings } from '../../../../sports/basketball/data';
import {
  DEFENSES, DEFENSE_ORDER, OFFENSES, OFFENSE_ORDER, fitLabel, rankedSchemesFor,
  schemeLeansOn, type DefenseScheme, type OffenseScheme,
} from '../../../../sports/basketball/schemes';
import { parOf } from '../../../../sports/basketball/career/league';
import { saveHoopsCareer } from '../../../../sports/basketball/career/save';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { pill } from './bits';

/* ---------------------------------------------------------------------------
 * THE PLAN
 * ---------------------------------------------------------------------------
 * Seven offences and five defences, and none of them is a label on a settings
 * screen: every one resolves into the knobs both engines read, so picking
 * five-out really does put five men behind the arc and picking a press really
 * does force turnovers and concede fouls.
 *
 * WHAT MAKES IT A DECISION rather than a lookup is FIT. A scheme run by the
 * wrong personnel is faded toward doing nothing and then taxed, so there is no
 * best system — only the best system for these players, and it changes when they
 * graduate. That is why the fit is the biggest thing on every row.
 * ------------------------------------------------------------------------- */

export class PlanScreen implements Screen {
  el: HTMLElement;
  private body!: HTMLElement;

  constructor(app: App, private career: HoopsCareer) {
    this.el = screenEl(
      topbar(app, 'The plan', 'What your team runs'),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private choose(offense?: OffenseScheme, defense?: DefenseScheme): void {
    if (offense) this.career.offense = offense;
    if (defense) this.career.defense = defense;
    saveHoopsCareer(this.career);
    this.paint();
  }

  private paint(): void {
    const c = this.career;
    const par = parOf(c, c.teamId);
    const ranked = rankedSchemesFor(c.roster, par);
    const five = starters(c.roster);
    const r = teamRatings(five);

    const tone = (fit: number): 'good' | 'warn' | 'bad' =>
      (fit >= 0.66 ? 'good' : fit >= 0.4 ? 'warn' : 'bad');

    this.body.replaceChildren(
      panel('Your five',
        h('div', { class: 'small', text: five.map((p) => `${p.pos} ${p.last}`).join(' · ') }),
        h('div', { class: 'tiny',
          text: `Shooting ${r.shooting} · inside ${r.inside} · rebounding ${r.rebounding}`
            + ` · defence ${r.defense}. A system asks for some of these and not others.` })),

      panelFlush('Offence',
        ...OFFENSE_ORDER.map((key) => {
          const info = OFFENSES[key];
          const fit = ranked.offense.find((x) => x.key === key)?.fit ?? 0;
          const on = c.offense === key;
          return h('button', {
            class: `roster-row${on ? ' roster-row--on' : ''}`,
            on: { click: () => this.choose(key) },
          },
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: info.label }),
            h('div', { class: 'roster-row__note tiny', text: info.effect }),
            h('div', { class: 'tiny', text: `Wants: ${info.needsText} Leans on ${schemeLeansOn(key)}.` })),
          pill(fitLabel(fit), tone(fit)));
        })),

      panelFlush('Defence',
        ...DEFENSE_ORDER.map((key) => {
          const info = DEFENSES[key];
          const fit = ranked.defense.find((x) => x.key === key)?.fit ?? 0;
          const on = c.defense === key;
          return h('button', {
            class: `roster-row${on ? ' roster-row--on' : ''}`,
            on: { click: () => this.choose(undefined, key) },
          },
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: info.label }),
            h('div', { class: 'roster-row__note tiny', text: info.effect }),
            h('div', { class: 'tiny', text: `Wants: ${info.needsText}` })),
          pill(fitLabel(fit), tone(fit)));
        })),

      h('div', { class: 'tiny',
        text: 'A poor fit is not forbidden — it is expensive. The system does less of '
          + 'what it is supposed to do, and the team gives a little away at both ends.' }),
    );
  }
}
