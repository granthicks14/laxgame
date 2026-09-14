import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panelFlush, panel, segmented } from '../../../components';
import { LEVELS } from '../../../../sports/basketball/levels';
import { worldTeam } from '../../../../sports/basketball/world';
import { averages } from '../../../../sports/basketball/career/season';
import type { HoopsCareer } from '../../../../sports/basketball/career/types';
import { badge, kvRow, pill } from './bits';

/* ---------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------
 * Season numbers, programme records that outlive a graduation, and the list of
 * seasons the coach has actually coached — which in Challenge Mode spans several
 * clubs, because the record belongs to the man and not the building.
 * ------------------------------------------------------------------------- */

type View = 'season' | 'records' | 'seasons';

export class CareerStatsScreen implements Screen {
  el: HTMLElement;
  private view: View = 'season';
  private body!: HTMLElement;

  constructor(app: App, private career: HoopsCareer) {
    this.el = screenEl(
      topbar(app, 'Statistics',
        `${career.careerWins}-${career.careerLosses} as a coach`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        segmented<View>([
          { value: 'season', label: 'This season' },
          { value: 'records', label: 'Programme' },
          { value: 'seasons', label: 'Seasons' },
        ], this.view, (v) => { this.view = v; this.paint(); }, true),
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private paint(): void {
    this.body.replaceChildren(
      this.view === 'season' ? this.lines(this.career.season, 'No games played yet.')
        : this.view === 'records' ? this.lines(this.career.careerStats, 'Nothing recorded yet.')
          : this.seasons(),
    );
  }

  private lines(
    store: HoopsCareer['season'], empty: string,
  ): HTMLElement {
    const c = this.career;
    const rows = Object.entries(store)
      .map(([id, line]) => ({ id, line, a: averages(line) }))
      .filter((r) => r.a.games > 0)
      .sort((a, b) => b.a.ppg - a.a.ppg);
    if (!rows.length) return panel(null, h('div', { class: 'small', text: empty }));

    // A career line can belong to a player who has long since graduated.
    const nameOf = (id: string): { name: string; pos: string } => {
      const p = c.roster.find((x) => x.id === id);
      return p ? { name: `${p.first} ${p.last}`, pos: p.pos } : { name: 'A former player', pos: '—' };
    };

    return panelFlush('Per game',
      ...rows.map((r) => {
        const who = nameOf(r.id);
        const a = r.a;
        return h('div', { class: 'roster-row' },
          h('span', { class: 'roster-row__pos', text: who.pos }),
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name', text: who.name }),
            h('div', { class: 'roster-row__note tiny',
              text: `${a.games}g · ${a.rpg.toFixed(1)}r ${a.apg.toFixed(1)}a `
                + `${a.spg.toFixed(1)}s ${a.bpg.toFixed(1)}b · ${a.topg.toFixed(1)}to · `
                + `${(a.fgPct * 100).toFixed(0)}/${(a.tpPct * 100).toFixed(0)}/`
                + `${(a.ftPct * 100).toFixed(0)}` })),
          h('span', { class: 'roster-row__ovr num', text: a.ppg.toFixed(1) }));
      }));
  }

  private seasons(): HTMLElement {
    const c = this.career;
    if (!c.history.length) {
      return panel(null, h('div', { class: 'small', text: 'Your first season is not finished.' }));
    }
    return h('div', { class: 'stack' },
      panel(null, kvRow(
        ['Seasons', String(c.history.length)],
        ['Wins', String(c.careerWins)],
        ['Losses', String(c.careerLosses)],
        ['Titles', String(c.championships)],
      )),
      panelFlush('Every season',
        ...[...c.history].reverse().map((s) => {
          const team = worldTeam(s.teamId);
          return h('div', { class: 'roster-row' },
            h('span', { class: 'roster-row__pos', text: String(s.year) }),
            badge(team, 'sm'),
            h('div', { class: 'roster-row__body' },
              h('div', { class: 'roster-row__name', text: `${s.wins}-${s.losses} · ${s.finish}` }),
              h('div', { class: 'roster-row__note tiny',
                text: `${LEVELS[s.level].short}${s.star ? ` · ${s.star}` : ''}` })),
            s.champion ? pill('CHAMPIONS', 'good') : null);
        })),
    );
  }
}
