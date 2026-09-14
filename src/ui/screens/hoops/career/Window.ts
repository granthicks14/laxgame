import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, panelFlush } from '../../../components';
import { LEVELS } from '../../../../sports/basketball/levels';
import { worldTeam } from '../../../../sports/basketball/world';
import {
  MAX_PITCHES, pitchFactors, pitchTo, wantsLines, wantsSummary, type PortalProgram,
  type TransferTarget,
} from '../../../../sports/basketball/career/portal';
import { perksOf } from '../../../../sports/basketball/career/coach';
import { modsFor } from '../../../../sports/basketball/career/difficulty';
import { standingOf } from '../../../../sports/basketball/career/league';
import { rowFor } from '../../../../sports/basketball/career/schedule';
import { needsFor } from '../../../../sports/basketball/career/season';
import { saveHoopsCareer } from '../../../../sports/basketball/career/save';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { pill } from './bits';

/* ---------------------------------------------------------------------------
 * THE TRANSFER WINDOW
 * ---------------------------------------------------------------------------
 * Players who have already decided to leave somebody, which is a different
 * conversation from recruiting a schoolboy: he can play NOW, he knows what he
 * wants, and he is not going to wait around while you think about it.
 *
 * Three approaches per man and a handful of approaches in the whole window, so
 * the decision is WHO rather than HOW MANY. What each one wants is stated in
 * plain words — Playing time: HIGH, Winning: MEDIUM — because a pitch you cannot
 * read is a pitch you cannot make, and every factor is shown with the weight he
 * puts on it.
 * ------------------------------------------------------------------------- */

export class WindowScreen implements Screen {
  el: HTMLElement;
  private body!: HTMLElement;
  private open = new Set<string>();

  constructor(private app: App, private career: HoopsCareer) {
    this.el = screenEl(
      topbar(app, 'The portal', `${career.pitchesLeft} approach`
        + `${career.pitchesLeft === 1 ? '' : 'es'} left`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private prog(): PortalProgram {
    const c = this.career;
    const row = rowFor(c.standings, c.teamId);
    const games = Math.max(1, row.wins + row.losses);
    return {
      standing: standingOf(c, c.teamId),
      form: row.wins / games,
      perks: perksOf(c.coach),
      needs: needsFor(c),
      level: c.level,
    };
  }

  private approach(t: TransferTarget): void {
    const c = this.career;
    if (c.pitchesLeft <= 0) {
      this.app.toast('You are out of approaches this window.', 'bad');
      return;
    }
    if (t.pitches >= MAX_PITCHES) {
      this.app.toast('You have said everything you have to say to him.', 'bad');
      return;
    }
    c.pitchesLeft--;
    const r = pitchTo(t, this.prog(), c.teamId, perksOf(c.coach), modsFor(c.tier), c.seed);
    saveHoopsCareer(c);
    this.app.toast(r.message, r.signed || r.moved > 0 ? 'info' : 'bad');
    this.paint();
  }

  private paint(): void {
    const c = this.career;
    const prog = this.prog();

    if (!c.market.length) {
      this.body.replaceChildren(panel(null, h('div', { class: 'small',
        text: 'The window is shut. It opens again at the end of the season.' })));
      return;
    }

    this.body.replaceChildren(
      panel(`${c.pitchesLeft} approach${c.pitchesLeft === 1 ? '' : 'es'} left`,
        h('div', { class: 'tiny',
          text: 'Each man will listen to you three times at most, and you do not have '
            + 'enough approaches for everybody. Pick the ones who want what you have.' })),

      ...(c.portalOut.length ? [panelFlush('Leaving you',
        ...c.portalOut.map((d) => h('div', { class: 'roster-row' },
          h('span', { class: 'roster-row__pos', text: d.pos }),
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: d.name }),
            h('div', { class: 'roster-row__note tiny', text: d.text })),
          h('span', { class: 'roster-row__ovr num', text: String(d.overall) }))))] : []),

      panelFlush('In the window', ...c.market.map((t) => this.target(t, prog))),
    );
  }

  private target(t: TransferTarget, prog: PortalProgram): HTMLElement {
    const c = this.career;
    const opened = this.open.has(t.id);
    const mine = t.signedWith === c.teamId;
    const gone = t.status === 'gone' || (t.status === 'committed' && !mine);

    const head = h('button', {
      class: 'prospect__head',
      on: { click: () => { if (opened) this.open.delete(t.id); else this.open.add(t.id); this.paint(); } },
    },
    h('span', { class: 'prospect__stars', text: t.player.pos }),
    h('div', { class: 'prospect__body' },
      h('div', { class: 'prospect__name', text: `${t.player.first} ${t.player.last}` }),
      h('div', { class: 'prospect__note tiny',
        text: `From ${LEVELS[t.from].short} · ${t.rivals} other programme`
          + `${t.rivals === 1 ? '' : 's'} on him` })),
    mine ? pill('SIGNED', 'good') : gone ? pill('GONE', 'bad')
      : pill(`${Math.round(t.interest)}`, t.interest >= 60 ? 'good' : t.interest >= 35 ? 'warn' : 'flat'),
    h('span', { class: 'prospect__ovr num', text: String(t.player.overall) }));

    if (!opened) return h('div', { class: 'prospect' }, head);

    const factors = pitchFactors(t, prog);
    return h('div', { class: 'prospect' }, head,
      h('div', { class: 'prospect__open stack' },
        h('div', { class: 'tiny', text: `${wantsSummary(t)}.` }),
        h('div', { class: 'kv-row' },
          ...wantsLines(t).map((w) => h('div', { class: 'kv' },
            h('div', { class: 'kv__k tiny', text: w.label }),
            h('div', {
              class: `kv__v num ${w.level === 'HIGH' ? 'good' : w.level === 'LOW' ? 'muted' : ''}`,
              text: w.level,
            })))),
        ...factors.map((f) => h('div', { class: 'factor' },
          h('div', { class: 'factor__label', text: f.label }),
          h('div', { class: 'factor__bar' },
            h('div', {
              class: `factor__fill${f.score < 0 ? ' is-neg' : ''}`,
              style: f.score >= 0
                ? `left:50%;width:${Math.min(50, f.score * 50 * f.weight + 1)}%`
                : `right:50%;left:auto;width:${Math.min(50, -f.score * 50 * f.weight + 1)}%`,
            })),
          h('div', { class: 'factor__note', text: f.note }))),
        gone && t.signedWith && t.signedWith !== c.teamId
          ? h('div', { class: 'tiny', text: `He went to ${worldTeam(t.signedWith).abbr}.` })
          : null,
        t.status !== 'open' ? null
          : h('button', {
            class: 'btn btn--primary',
            text: `Approach him (${MAX_PITCHES - t.pitches} left with him)`,
            on: { click: () => this.approach(t) },
          }),
      ));
  }
}
