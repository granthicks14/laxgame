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

type View = 'seasons' | 'totals' | 'leaders' | 'wire';

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
          { value: 'leaders', label: 'Leaders' },
          { value: 'wire', label: 'The wire' },
        ], this.view, (v) => { this.view = v; this.paint(); }, true),
        this.body)),
    );
    this.paint();
  }

  private paint(): void {
    if (this.view === 'seasons') this.body.replaceChildren(this.seasons());
    else if (this.view === 'totals') this.body.replaceChildren(this.totals());
    else if (this.view === 'leaders') this.body.replaceChildren(this.leaders());
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

  /**
   * WHO ACTUALLY DID IT.
   *
   * Career totals for everybody who has played for this club under this coach,
   * still on the roster or not. Twenty seasons of statistics that nothing ever
   * shows is twenty seasons of statistics nobody ever cared about.
   */
  private leaders(): HTMLElement {
    const fr = this.fr;
    const names = new Map<string, string>();
    for (const p of fr.roster) names.set(p.id, `${p.pos} ${p.first} ${p.last}`);
    for (const d of fr.lastDepartures) void d;

    const rows = Object.entries(fr.careerStats)
      .map(([id, line]) => ({ id, line, name: names.get(id) ?? null }));
    if (!rows.length) {
      return panel('Career leaders',
        h('div', { class: 'small', text: 'Nobody has played a down yet.' }));
    }

    const board = (
      title: string,
      value: (l: typeof rows[number]['line']) => number,
      format: (l: typeof rows[number]['line']) => string,
    ): HTMLElement | null => {
      const top = rows.filter((r) => value(r.line) > 0)
        .sort((a, b) => value(b.line) - value(a.line))
        .slice(0, 5);
      if (!top.length) return null;
      return h('div', { class: 'stack', style: 'gap:2px' },
        h('div', { class: 'eyebrow', text: title }),
        ...top.map((r, i) => h('div', { class: 'leader' },
          h('span', { class: 'leader__rank num', text: String(i + 1) }),
          h('span', { class: 'leader__name', text: r.name ?? 'A former player' }),
          h('span', { class: 'leader__val num', text: format(r.line) }))));
    };

    return panel('Career leaders',
      h('div', { class: 'tiny', text: 'Everything anybody has done for this club under you.' }),
      board('Passing', (l) => l.passYards, (l) => `${l.passYards} yds, ${l.passTD} TD`),
      board('Rushing', (l) => l.rushYards, (l) => `${l.rushYards} yds, ${l.rushTD} TD`),
      board('Receiving', (l) => l.recYards, (l) => `${l.catches} for ${l.recYards}, ${l.recTD} TD`),
      board('Tackles', (l) => l.tackles, (l) => `${l.tackles}`),
      board('Sacks', (l) => l.sacks, (l) => `${l.sacks}`),
      board('Interceptions', (l) => l.picks, (l) => `${l.picks}`),
      board('Kicking', (l) => l.fgMade, (l) => `${l.fgMade}/${l.fgAttempts}`));
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
