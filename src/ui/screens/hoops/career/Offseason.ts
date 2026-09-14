import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, panelFlush } from '../../../components';
import { LEVELS } from '../../../../sports/basketball/levels';
import { teamRatings } from '../../../../sports/basketball/data';
import {
  awaitingDecision, needsFor, recruitingDone, startNextSeason,
} from '../../../../sports/basketball/career/season';
import { saveHoopsCareer } from '../../../../sports/basketball/career/save';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { bigButton, kvRow } from './bits';
import { BoardScreen } from './Board';
import { WindowScreen } from './Window';
import { SquadScreen } from './Squad';
import { JobsScreen } from './Jobs';

/* ---------------------------------------------------------------------------
 * THE OFFSEASON
 * ---------------------------------------------------------------------------
 * Everything that happens between March and October, IN THE ORDER IT HAPPENS:
 *
 *   the record → who left → who got better → the portal → recruiting → next year
 *
 * The order is not decoration. Seniors graduate before the squad develops,
 * because a man who has gone does not get better. Development happens before the
 * markets, because a coach decides who to replace after he knows what he has.
 * Recruiting closes last, because the class arrives in the autumn.
 *
 * The screen shows all of it at once and puts ONE button at the bottom: start
 * the season. It is never possible to be halfway through an offseason and not
 * know what is left, because what is left is the list you are looking at.
 * ------------------------------------------------------------------------- */

export class OffseasonScreen implements Screen {
  el: HTMLElement;
  private body!: HTMLElement;

  constructor(private app: App, private career: HoopsCareer) {
    this.el = screenEl(
      topbar(app, 'The offseason', `Into year ${career.year}`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private paint(): void {
    const c = this.career;
    const info = LEVELS[c.level];
    const last = c.history[c.history.length - 1];
    const needs = needsFor(c);
    const recruitingOpen = !!c.recruiting && !recruitingDone(c);
    const portalOpen = c.market.length > 0 && c.pitchesLeft > 0;

    this.body.replaceChildren(
      ...(last ? [panel('The season just finished',
        kvRow(
          ['Record', `${last.wins}-${last.losses}`],
          ['Finish', last.champion ? 'CHAMPIONS' : '—'],
          ['Squad', String(teamRatings(c.roster).overall)],
          ['Points', String(c.coach.points)],
        ),
        h('div', { class: 'small', text: last.finish }),
        last.star ? h('div', { class: 'tiny', text: `Best of them: ${last.star}` }) : null)] : []),

      ...(c.lastDepartures.length ? [panelFlush('Leaving the programme',
        ...c.lastDepartures.map((d) => h('div', { class: 'roster-row' },
          h('span', { class: 'roster-row__pos', text: d.pos }),
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: d.name }),
            h('div', { class: 'roster-row__note tiny', text: d.reason })),
          h('span', { class: 'roster-row__ovr num', text: String(d.overall) }))))] : []),

      ...(c.lastDevelopment.length ? [panelFlush('What a year did to them',
        ...c.lastDevelopment.slice(0, 8).map((d) => h('div', { class: 'roster-row' },
          h('span', { class: 'roster-row__pos', text: d.pos }),
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: d.name }),
            h('div', { class: 'roster-row__note tiny', text: d.label })),
          h('span', {
            class: `roster-row__delta num ${d.to >= d.from ? 'is-up' : 'is-down'}`,
            text: `${d.to > d.from ? '+' : ''}${d.to - d.from}`,
          }),
          h('span', { class: 'roster-row__ovr num', text: String(d.to) }))),
        h('div', { class: 'prospect__open' },
          h('button', {
            class: 'btn btn--ghost',
            text: 'The whole report',
            on: { click: () => this.app.push((a) => new SquadScreen(a, c)) },
          })))] : []),

      panel('Where the squad is thin',
        h('div', { class: 'small',
          text: needs.list.map((n) => `${n.pos} ${n.needLabel.toLowerCase()}`).join(' · ') }),
        h('div', { class: 'tiny',
          text: `${c.roster.length} under contract of ${info.rosterSize}. `
            + `${needs.openSpots} place${needs.openSpots === 1 ? '' : 's'} to fill before October.` })),

      ...(c.market.length ? [panel('The portal',
        h('div', { class: 'small',
          text: `${c.market.filter((t) => t.status === 'open').length} players looking for `
            + `somewhere new, ${c.pitchesLeft} approach${c.pitchesLeft === 1 ? '' : 'es'} left.` }),
        bigButton('Work the window', 'Players who can play immediately',
          () => this.app.push((a) => new WindowScreen(a, c)),
          portalOpen ? 'btn--primary' : 'btn--ghost'))] : []),

      ...(c.recruiting ? [panel('Recruiting',
        h('div', { class: 'small',
          text: recruitingOpen
            ? `Week ${c.recruiting.week + 1} of ${c.recruiting.weeks}. `
              + 'The class you sign now is the programme in three years.'
            : 'The cycle is closed. Your class arrives in the autumn.' }),
        bigButton('The board', `${c.recruiting.prospects.length} names`,
          () => this.app.push((a) => new BoardScreen(a, c)),
          recruitingOpen ? 'btn--primary' : 'btn--ghost'))] : []),

      panel(null,
        recruitingOpen
          ? h('div', { class: 'tiny warn',
            text: 'Recruiting is still open. Starting the season now signs whoever has '
              + 'already committed and lets the rest go elsewhere.' })
          : null,
        bigButton('Start the season', `Year ${c.year} · ${LEVELS[c.level].short}`,
          () => this.start())),
    );
  }

  private start(): void {
    const c = this.career;
    if (awaitingDecision(c)) {
      this.app.replace((a) => new JobsScreen(a, c));
      return;
    }
    startNextSeason(c);
    saveHoopsCareer(c);
    this.app.pop();
  }
}
