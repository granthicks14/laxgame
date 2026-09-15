import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, panelFlush, segmented } from '../../../components';
import { LEVELS } from '../../../../sports/basketball/levels';
import { conferencesAt, worldTeam } from '../../../../sports/basketball/world';
import {
  conferenceTable, levelTable, recordText, type TableRow,
} from '../../../../sports/basketball/career/schedule';
import { bracketRows, seedNumber } from '../../../../sports/basketball/career/playoffs';
import { standingOf } from '../../../../sports/basketball/career/league';
import type { HoopsCareer, HoopsFixture } from '../../../../sports/basketball/career/types';
import { badge, pill } from './bits';

/* ---------------------------------------------------------------------------
 * THE TABLE, THE FIXTURES AND THE BRACKET
 * ---------------------------------------------------------------------------
 * Three things a coach reads once a week, behind one tile. The conference table
 * is the default because it is the one that decides anything: the level table
 * says where you stand in the sport, but your conference decides who gets a
 * guaranteed place in the postseason.
 * ------------------------------------------------------------------------- */

type View = 'conference' | 'level' | 'fixtures' | 'bracket';

const ROUND_NAME: Record<string, string> = {
  first: 'First round',
  quarter: 'Quarter-finals',
  semi: 'Semi-finals',
  final: 'The final',
};

export class TablesScreen implements Screen {
  el: HTMLElement;
  private view: View;
  private body!: HTMLElement;

  constructor(app: App, private career: HoopsCareer) {
    this.view = career.postseason.length ? 'bracket' : 'conference';
    this.el = screenEl(
      topbar(app, LEVELS[career.level].name, `Year ${career.year}`),
      h('div', { class: 'scroll' }, h('div', { class: 'wrapper stack' },
        segmented<View>([
          { value: 'conference', label: 'Conference' },
          { value: 'level', label: 'The level' },
          { value: 'fixtures', label: 'Fixtures' },
          ...(career.postseason.length ? [{ value: 'bracket' as View, label: 'Bracket' }] : []),
        ], this.view, (v) => { this.view = v; this.paint(); }, true),
        this.body = h('div', { class: 'stack' }))),
    );
    this.paint();
  }

  private paint(): void {
    this.body.replaceChildren(
      this.view === 'conference' ? this.table(true)
        : this.view === 'level' ? this.table(false)
          : this.view === 'fixtures' ? this.fixtures() : this.bracket(),
    );
  }

  /* -------------------------------------------------------------- the table */

  private row(r: TableRow, i: number): HTMLElement {
    const mine = r.team.id === this.career.teamId;
    return h('div', { class: `roster-row${mine ? ' roster-row--on' : ''}` },
      h('span', { class: 'roster-row__pos', text: String(i + 1) }),
      badge(r.team, 'sm'),
      h('div', { class: 'roster-row__body' },
        h('div', { class: 'roster-row__name', text: `${r.team.city} ${r.team.name}` }),
        h('div', { class: 'roster-row__note tiny',
          text: `${r.confWins}-${r.confLosses} in conference · `
            + `${r.pointDiff >= 0 ? '+' : ''}${r.pointDiff} points` })),
      h('span', { class: 'roster-row__ovr num', text: recordText(r) }));
  }

  private table(conference: boolean): HTMLElement {
    const c = this.career;
    if (!conference) {
      const rows = levelTable(c.standings, c.level);
      return h('div', { class: 'stack' },
        panelFlush('Everybody at this level', ...rows.map((r, i) => this.row(r, i))));
    }
    const confs = conferencesAt(c.level);
    return h('div', { class: 'stack' },
      ...confs.map((conf) => panelFlush(conf.name,
        ...conferenceTable(c.standings, c.level, conf.id).map((r, i) => this.row(r, i)))),
      h('div', { class: 'tiny',
        text: `${LEVELS[c.level].postseason.replace(/^the /, 'The ')} takes the `
          + 'conference winners automatically, and fills the rest of the field on '
          + 'overall record.' }),
    );
  }

  /* ----------------------------------------------------------- the fixtures */

  private fixtures(): HTMLElement {
    const c = this.career;
    const mine = c.schedule.filter((f) => f.featured);
    return panelFlush('Your season',
      ...mine.map((f, i) => {
        const home = f.homeId === c.teamId;
        const other = worldTeam(home ? f.awayId : f.homeId);
        const won = f.played
          && ((home && f.homeScore > f.awayScore) || (!home && f.awayScore > f.homeScore));
        const score = f.played
          ? `${home ? f.homeScore : f.awayScore}-${home ? f.awayScore : f.homeScore}`
          : '';
        /* THE RECAP AS IT WAS RECORDED, not one made up now. It was written from
         * the box score the night the game happened, which is the only box score
         * that describes it. */
        const recap = f.story ?? null;
        return h('div', { class: 'roster-row' },
          h('span', { class: 'roster-row__pos', text: String(i + 1) }),
          badge(other, 'sm'),
          h('div', { class: 'roster-row__body' },
            h('div', { class: 'roster-row__name',
              text: `${home ? 'vs' : 'at'} ${other.city} ${other.name}` }),
            h('div', { class: 'roster-row__note tiny',
              text: recap ? `${recap.headline} — ${recap.line}`
                : `${f.conference ? 'Conference' : 'Non-conference'}`
                  + `${f.rivalry ? ' · rivalry' : ''} · they rate ${standingOf(c, other.id)}` })),
          f.played ? pill(won ? 'W' : 'L', won ? 'good' : 'bad') : null,
          h('span', { class: 'roster-row__ovr num', text: score }));
      }));
  }

  /* ------------------------------------------------------------ the bracket */

  private bracket(): HTMLElement {
    const c = this.career;
    const rows = bracketRows(c);
    if (!rows.length) {
      return panel(null, h('div', { class: 'small', text: 'The bracket is not drawn yet.' }));
    }
    const line = (f: HoopsFixture): HTMLElement => {
      const home = worldTeam(f.homeId);
      const away = worldTeam(f.awayId);
      const mine = f.homeId === c.teamId || f.awayId === c.teamId;
      return h('div', { class: `roster-row${mine ? ' roster-row--on' : ''}` },
        h('span', { class: 'roster-row__pos', text: `${seedNumber(c, f.homeId)}` }),
        h('div', { class: 'roster-row__body' },
          h('div', { class: 'roster-row__name',
            text: `${home.abbr} v ${away.abbr}` }),
          h('div', { class: 'roster-row__note tiny',
            text: `${home.city} ${home.name} · ${away.city} ${away.name}` })),
        h('span', { class: 'roster-row__ovr num',
          text: f.played ? `${f.homeScore}-${f.awayScore}` : '—' }));
    };
    return h('div', { class: 'stack' },
      ...rows.map((r) => panelFlush(ROUND_NAME[r.round] ?? r.round, ...r.games.map(line))),
      c.championId
        ? panel('Champions', h('div', { class: 'small',
          text: `${worldTeam(c.championId).city} ${worldTeam(c.championId).name}` }))
        : null,
    );
  }
}
