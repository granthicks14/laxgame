import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { panel, screenEl, segmented, topbar } from '../../../components';
import { teamOr } from '../../../../sports/football/nfl';
import { newsIcon } from '../../../../sports/football/franchise/news';
import type { Franchise } from '../../../../sports/football/franchise/types';
import { badge, kv, tile, tileGrid } from './parts';

/* ---------------------------------------------------------------------------
 * THE FRANCHISE, AS A RECORD
 * ---------------------------------------------------------------------------
 * Every season you have coached, what happened in it, and the totals
 * underneath — which is the thing that makes year fourteen feel different from
 * year two. A franchise mode with no memory is a series of unrelated seasons.
 * ------------------------------------------------------------------------- */

type View = 'seasons' | 'totals' | 'wire';

export class HistoryScreen implements Screen {
  el: HTMLElement;
  private fr: Franchise;
  private view: View = 'seasons';
  private body = h('div', { class: 'stack' });

  constructor(app: App, fr: Franchise) {
    this.fr = fr;
    this.el = screenEl(
      topbar(app, 'Franchise history', `${fr.coachName} · ${fr.history.length} seasons`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        segmented<View>([
          { value: 'seasons', label: 'Seasons' },
          { value: 'totals', label: 'The record' },
          { value: 'wire', label: 'The wire' },
        ], this.view, (v) => { this.view = v; this.paint(); }, true),
        this.body)),
    );
    this.paint();
  }

  private paint(): void {
    if (this.view === 'seasons') this.body.replaceChildren(this.seasons());
    else if (this.view === 'totals') this.body.replaceChildren(this.totals());
    else this.body.replaceChildren(this.wire());
  }

  private seasons(): HTMLElement {
    const fr = this.fr;
    if (!fr.history.length) {
      return panel('Seasons', h('div', { class: 'small', text: 'Nothing has finished yet.' }));
    }
    return panel('Seasons',
      ...[...fr.history].reverse().map((s) => h('div', { class: 'fixture' },
        h('span', { class: 'fixture__team num', text: String(s.year) }),
        badge(s.teamId, 'sm'),
        h('span', {
          class: 'fixture__score',
          text: `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}`,
        }),
        h('span', {
          class: `fixture__tag tiny${s.champion ? ' good' : s.madePlayoffs ? '' : ' dim'}`,
          text: s.champion ? 'CHAMPIONS' : s.finish,
        }))),
      h('div', {
        class: 'tiny',
        style: 'margin-top:8px',
        text: fr.history.filter((s) => s.mvp).slice(-3).reverse()
          .map((s) => `${s.year}: ${s.mvp}`).join(' · '),
      }));
  }

  private totals(): HTMLElement {
    const fr = this.fr;
    const w = fr.history.reduce((n, s) => n + s.wins, 0);
    const l = fr.history.reduce((n, s) => n + s.losses, 0);
    const t = fr.history.reduce((n, s) => n + s.ties, 0);
    const best = [...fr.history].sort((a, b) => b.wins - a.wins)[0];
    const pf = fr.history.reduce((n, s) => n + s.pointsFor, 0);
    const pa = fr.history.reduce((n, s) => n + s.pointsAgainst, 0);

    return panel('The record',
      tileGrid(
        tile('Record', `${w}-${l}${t ? `-${t}` : ''}`, fr.coachName),
        tile('Super Bowls', String(fr.championships), ''),
        tile('Conference', String(fr.conferenceTitles), 'titles'),
        tile('Division', String(fr.divisionTitles), 'titles')),
      kv('Playoff appearances', `${fr.playoffApps} of ${fr.history.length}`),
      kv('Points', `${pf} for, ${pa} against`),
      best ? kv('Best season', `${best.year}: ${best.wins}-${best.losses}, ${best.finish}`) : null,
      fr.challenge
        ? kv('Jobs held', fr.challenge.jobs
          .map((j) => `${teamOr(j.teamId).abbr} ${j.from}-${j.to ?? 'now'}`).join(' · '))
        : null);
  }

  private wire(): HTMLElement {
    const fr = this.fr;
    if (!fr.news.length) {
      return panel('The wire', h('div', { class: 'small', text: 'Nothing has happened yet.' }));
    }
    return panel('The wire',
      ...fr.news.map((n) => h('div', { class: 'small' },
        h('span', { class: 'eyebrow', text: newsIcon[n.kind] }),
        ` ${n.text}`,
        h('span', { class: 'tiny dim', text: ` — year ${n.year}${n.week ? `, week ${n.week}` : ''}` }))));
  }
}
