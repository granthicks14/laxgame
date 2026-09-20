import { h } from '../../../dom';
import type { App, Screen } from '../../../App';
import { screenEl, topbar, panel, segmented } from '../../../components';
import { worldTeam } from '../../../../sports/football/world';
import { LEVELS } from '../../../../sports/football/levels';
import { recordOf, sortStandings } from '../../../../sports/football/career/schedule';
import type { FootballCareer } from '../../../../sports/football/career/types';

/* ---------------------------------------------------------------------------
 * THE TABLE AND THE FIXTURE LIST
 * ---------------------------------------------------------------------------
 * Where a coach finds out whether his season is going anywhere. The postseason
 * line is drawn ON the table rather than described next to it, because "eighth"
 * means nothing until you can see where the cut is.
 * ------------------------------------------------------------------------- */

type Tab = 'table' | 'fixtures';

export class CareerLeagueScreen implements Screen {
  el: HTMLElement;
  private tab: Tab = 'table';
  private body = h('div', { class: 'stack' });

  constructor(app: App, private career: FootballCareer) {
    this.paint();
    this.el = screenEl(
      topbar(app, LEVELS[career.level].name, `Year ${career.year}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          segmented<Tab>(
            [{ value: 'table', label: 'Standings' }, { value: 'fixtures', label: 'Schedule' }],
            this.tab,
            (v) => { this.tab = v; this.paint(); }, true),
          this.body)),
    );
  }

  private paint(): void {
    this.body.replaceChildren(...(this.tab === 'table' ? this.table() : this.fixtures()));
  }

  private table(): HTMLElement[] {
    const c = this.career;
    const rows = sortStandings(c.standings);
    const cut = LEVELS[c.level].playoffTeams;
    return [
      panel('Standings',
        h('table', { class: 'box' },
          h('thead', {}, h('tr', {},
            h('th', { text: '' }), h('th', { text: 'Club' }),
            h('th', { class: 'num', text: 'W-L' }),
            h('th', { class: 'num', text: 'Conf' }),
            h('th', { class: 'num', text: 'PF' }),
            h('th', { class: 'num', text: 'PA' }))),
          h('tbody', {}, ...rows.map((s, i) => {
            const t = worldTeam(s.teamId);
            const mine = s.teamId === c.teamId;
            return h('tr', {
              class: `${mine ? 'is-mine ' : ''}${i === cut - 1 ? 'is-cut' : ''}`,
            },
            h('td', { class: 'num', text: String(i + 1) }),
            h('td', { text: t ? `${t.city} ${t.name}` : s.teamId }),
            h('td', { class: 'num', text: recordOf(s) }),
            h('td', { class: 'num', text: `${s.confWins}-${s.confLosses}` }),
            h('td', { class: 'num', text: String(s.pointsFor) }),
            h('td', { class: 'num', text: String(s.pointsAgainst) }));
          }))),
        h('div', {
          class: 'tiny',
          text: `The top ${cut} play for the ${LEVELS[c.level].title.toLowerCase()}.`,
        })),
    ];
  }

  private fixtures(): HTMLElement[] {
    const c = this.career;
    const weeks = [...new Set(c.schedule.map((f) => f.week))].sort((a, b) => a - b);
    const out: HTMLElement[] = [];
    for (const w of weeks) {
      const games = c.schedule.filter((f) => f.week === w);
      out.push(panel(`Week ${w}`, ...games.map((f) => {
        const home = worldTeam(f.homeId);
        const away = worldTeam(f.awayId);
        return h('div', { class: `fixture${f.featured ? ' is-mine' : ''}` },
          h('span', { class: 'fixture__team', text: away?.abbr ?? '' }),
          h('span', {
            class: 'fixture__score num',
            text: f.played ? `${f.awayScore}-${f.homeScore}` : 'at',
          }),
          h('span', { class: 'fixture__team', text: home?.abbr ?? '' }),
          f.rivalry ? h('span', { class: 'fixture__tag tiny', text: 'RIVALRY' }) : null,
          f.featured && f.story ? h('span', { class: 'fixture__tag tiny', text: f.story.headline }) : null);
      })));
    }
    if (c.postseason.length) {
      out.push(panel(LEVELS[c.level].title, ...c.postseason.map((f) => {
        const home = worldTeam(f.homeId);
        const away = worldTeam(f.awayId);
        return h('div', { class: `fixture${f.featured ? ' is-mine' : ''}` },
          h('span', { class: 'fixture__team', text: away?.abbr ?? '' }),
          h('span', {
            class: 'fixture__score num',
            text: f.played ? `${f.awayScore}-${f.homeScore}` : 'at',
          }),
          h('span', { class: 'fixture__team', text: home?.abbr ?? '' }),
          h('span', { class: 'fixture__tag tiny', text: f.postseason ?? '' }));
      })));
    }
    return out;
  }
}
