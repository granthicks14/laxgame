import { h } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panelFlush, teamBadge, emptyPanel } from '../components';
import { loadCareer } from '../../state/saves';
import { effectiveTeam, opponentOf, playoffFieldSize, roundName, standingsSorted, userIsHome, winPct } from '../../league/career';
import type { Career, ScheduledGame } from '../../league/types';
import { CLASSES, teamsInClass } from '../../data/teams';

function requireCareer(app: App, mode: 'season' | 'dynasty', title: string): Career | HTMLElement {
  const c = loadCareer(mode);
  if (c) return c;
  return screenEl(
    topbar(app, title),
    h('div', { class: 'scroll' }, h('div', { class: 'wrapper' }, emptyPanel(
      'Nothing to show yet',
      `There is no ${mode} save on this device, so there is no schedule or table to display.`,
      [{ label: 'Back', primary: true, onClick: () => app.pop() }],
    ))),
  );
}

export class StandingsScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, mode: 'season' | 'dynasty') {
    const res = requireCareer(app, mode, 'Standings');
    if (res instanceof HTMLElement) { this.el = res; return; }
    const career = res;
    const field = playoffFieldSize(teamsInClass(career.classKey).length);
    const rows = standingsSorted(career).map((r, i) => {
      const t = effectiveTeam(career, r.teamId);
      const diff = r.goalsFor - r.goalsAgainst;
      const cls = [r.teamId === career.teamId ? 'is-you' : '', i + 1 === field ? 'is-cut' : ''].filter(Boolean).join(' ');
      return h('tr', { class: cls },
        h('td', { class: 'name' }, h('span', { class: 'row', style: 'gap:8px' },
          h('span', { class: 'num', style: 'color:var(--muted);width:16px', text: String(i + 1) }),
          teamBadge(t, 'sm'),
          h('span', { text: t.short }))),
        h('td', { text: String(r.wins) }),
        h('td', { text: String(r.losses) }),
        h('td', { text: winPct(r).toFixed(3).replace(/^0/, '') }),
        h('td', { text: String(r.goalsFor) }),
        h('td', { text: String(r.goalsAgainst) }),
        h('td', { class: diff > 0 ? 'good' : diff < 0 ? 'bad' : '', text: diff > 0 ? `+${diff}` : String(diff) }),
      );
    });

    this.el = screenEl(
      topbar(app, 'Standings', CLASSES[career.classKey].short),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          panelFlush(null,
            h('table', { class: 'table' },
              h('thead', null, h('tr', null,
                h('th', { text: 'Team' }), h('th', { text: 'W' }), h('th', { text: 'L' }),
                h('th', { text: 'PCT' }), h('th', { text: 'GF' }), h('th', { text: 'GA' }), h('th', { text: 'DIFF' }))),
              h('tbody', null, ...rows))),
          h('div', { class: 'tiny', text: field >= 4
            ? `Top ${field} teams reach the ${CLASSES[career.classKey].short} playoffs — the line under ${field}${field === 1 ? 'st' : 'th'} is the cut.`
            : 'The top two teams meet in the district championship.' }),
        )),
    );
  }
}

export class ScheduleScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, mode: 'season' | 'dynasty') {
    const res = requireCareer(app, mode, 'Schedule');
    if (res instanceof HTMLElement) { this.el = res; return; }
    const career = res;
    const games = career.schedule.filter((g) => g.featured);

    this.el = screenEl(
      topbar(app, 'Schedule', `Year ${career.year}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          ...games.map((g) => this.row(career, g)),
          career.schedule.some((g) => g.playoff)
            ? this.bracket(career)
            : null,
        )),
    );
  }

  private row(career: Career, g: ScheduledGame): HTMLElement {
    const opp = effectiveTeam(career, opponentOf(career, g));
    const isHome = userIsHome(career, g);
    const you = isHome ? g.homeScore : g.awayScore;
    const them = isHome ? g.awayScore : g.homeScore;
    const won = g.played && you > them;
    const cls = g.played ? (won ? 'good' : 'bad') : '';

    return h('div', { class: 'panel' },
      h('div', { class: 'panel__body row', style: 'gap:10px;padding:10px 12px' },
        h('div', { class: 'num', style: 'color:var(--muted);width:34px;font-size:12px', text: g.playoff ? g.playoff : `W${g.week}` }),
        teamBadge(opp, 'sm'),
        h('div', { class: 'stack', style: 'gap:0;flex:1 1 auto;min-width:0' },
          h('div', { style: 'font-size:14px' }, `${isHome ? 'vs' : 'at'} ${opp.short}`),
          h('div', { class: 'tiny' },
            g.playoff ? roundName(g.playoff) : g.rivalry ? 'Rivalry' : `OVR ${opp.overall}`)),
        g.played
          ? h('div', { class: `num ${cls}`, style: 'font-size:15px' }, `${won ? 'W' : 'L'} ${you}-${them}`)
          : h('span', { class: 'pill', text: 'Upcoming' }),
      ));
  }

  private bracket(career: Career): HTMLElement {
    const rounds: ('QF' | 'SF' | 'F')[] = ['QF', 'SF', 'F'];
    const blocks = rounds.map((r) => {
      const games = career.schedule.filter((g) => g.playoff === r);
      if (!games.length) return null;
      return h('div', { class: 'panel' },
        h('div', { class: 'panel__head', text: roundName(r) }),
        h('div', { class: 'panel__body stack', style: 'gap:6px' },
          ...games.map((g) => {
            const home = effectiveTeam(career, g.homeId);
            const away = effectiveTeam(career, g.awayId);
            const homeWon = g.played && g.homeScore > g.awayScore;
            return h('div', { class: 'row', style: 'gap:8px;font-size:13px' },
              teamBadge(away, 'sm'),
              h('span', { style: `flex:1 1 0;${!homeWon && g.played ? 'font-weight:700' : 'color:var(--text-2)'}`, text: away.short }),
              h('span', { class: 'num', text: g.played ? `${g.awayScore}-${g.homeScore}` : 'vs' }),
              h('span', { style: `flex:1 1 0;text-align:right;${homeWon ? 'font-weight:700' : 'color:var(--text-2)'}`, text: home.short }),
              teamBadge(home, 'sm'));
          })));
    }).filter(Boolean) as HTMLElement[];

    return h('div', { class: 'stack' },
      h('div', { class: 'eyebrow', style: 'margin-top:8px', text: 'District playoffs' }),
      ...blocks);
  }
}
