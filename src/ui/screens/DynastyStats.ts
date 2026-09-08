import { h, clear } from '../dom';
import type { App, Screen } from '../App';
import { screenEl, topbar, panel, panelFlush, emptyPanel, segmented, teamBadge } from '../components';
import { loadCareer } from '../../state/saves';
import { effectiveTeam, seasonRecordText, userTeam } from '../../league/career';
import {
  LEADER_LABEL, leaderValue, leaders, leagueStatLines, teamSeasonStats,
  type LeaderCategory, type StatLine,
} from '../../league/leagueStats';
import { POSITION_LABEL } from '../../data/constants';
import type { Career } from '../../league/types';

const CATEGORIES: LeaderCategory[] = ['points', 'goals', 'assists', 'saves', 'groundBalls'];

/**
 * The season in numbers: your team, your players, and who is leading the
 * district. Your squad's line is the one it actually recorded on the field;
 * every other team's is the game's own record of the fixtures it simulated.
 */
export class DynastyStatsScreen implements Screen {
  el: HTMLElement;

  constructor(app: App, mode: 'season' | 'dynasty') {
    const career = loadCareer(mode);
    if (!career) {
      this.el = screenEl(topbar(app, 'Statistics'), h('div', { class: 'scroll' },
        h('div', { class: 'wrapper' }, emptyPanel(
          'Nothing to show yet',
          `There is no ${mode} save on this device, so there are no statistics to report.`,
          [{ label: 'Back', primary: true, onClick: () => app.pop() }],
        ))));
      return;
    }

    const lines = leagueStatLines(career);
    const played = career.schedule.filter((g) => g.played).length;

    this.el = screenEl(
      topbar(app, 'Statistics', `Year ${career.year}`),
      h('div', { class: 'scroll' },
        h('div', { class: 'wrapper stack' },
          played === 0
            ? emptyPanel(
              'The season has not started',
              'Play or simulate a game and the numbers will start filling in here.',
              [{ label: 'Back', primary: true, onClick: () => app.pop() }],
            )
            : null,
          played > 0 ? this.teamPanel(career) : null,
          played > 0 ? this.squadPanel(career, lines) : null,
          played > 0 ? this.leaderPanel(career, lines) : null,
          played > 0
            ? h('div', {
              class: 'tiny',
              text: 'Your own squad’s numbers are recorded play by play. Other programmes’ lines are '
                + 'this game’s record of the fixtures it simulated — consistent every time you look, '
                + 'and not a claim about anybody real.',
            })
            : null,
        )),
    );
  }

  private teamPanel(career: Career): HTMLElement {
    const team = userTeam(career);
    const st = teamSeasonStats(career, career.teamId);
    const games = Math.max(1, st.games);
    const shooting = st.shots > 0 ? `${Math.round((st.goalsFor / st.shots) * 100)}%` : '—';
    const foTaken = career.roster.reduce((n, p) => n + p.season.faceoffTakes, 0);
    const foWon = career.roster.reduce((n, p) => n + p.season.faceoffWins, 0);

    const row = (label: string, value: string) => h('div', { class: 'field-row' },
      h('div', { class: 'field-row__label', text: label }),
      h('div', { class: 'num', text: value }));

    return panel('Team',
      h('div', { class: 'row', style: 'gap:10px' },
        teamBadge(team, 'md'),
        h('div', null,
          h('div', { class: 'display', style: 'font-size:18px', text: team.name }),
          h('div', { class: 'small', text: `${seasonRecordText(career)} · ${st.games} played` }))),
      h('div', { class: 'divider' }),
      row('Win percentage', ((st.wins / Math.max(1, st.wins + st.losses)) * 100).toFixed(0) + '%'),
      row('Goals for', String(st.goalsFor)),
      row('Goals against', String(st.goalsAgainst)),
      row('Goals per game', (st.goalsFor / games).toFixed(1)),
      row('Allowed per game', (st.goalsAgainst / games).toFixed(1)),
      row('Shooting', shooting),
      row('Saves', String(st.saves)),
      row('Faceoffs', foTaken > 0 ? `${foWon}/${foTaken} (${Math.round((foWon / foTaken) * 100)}%)` : '—'),
    );
  }

  private squadPanel(career: Career, lines: StatLine[]): HTMLElement {
    const mine = lines
      .filter((l) => l.teamId === career.teamId)
      .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists) || b.saves - a.saves);

    const rows = mine.map((l) => {
      const shooting = l.shots > 0 ? `${Math.round((l.goals / l.shots) * 100)}%` : '—';
      return h('tr', null,
        h('td', { class: 'name', text: l.name }),
        h('td', { text: POSITION_LABEL[l.pos].slice(0, 1) }),
        h('td', { text: String(l.gamesPlayed) }),
        h('td', { text: String(l.goals) }),
        h('td', { text: String(l.assists) }),
        h('td', { text: String(l.goals + l.assists) }),
        h('td', { text: shooting }),
        h('td', { text: l.pos === 'G' ? String(l.saves) : String(l.groundBalls) }),
      );
    });

    return panelFlush('Your players',
      h('table', { class: 'table' },
        h('thead', null, h('tr', null,
          h('th', { text: 'Player' }), h('th', { text: 'Pos' }), h('th', { text: 'GP' }),
          h('th', { text: 'G' }), h('th', { text: 'A' }), h('th', { text: 'P' }),
          h('th', { text: 'SH%' }), h('th', { text: 'SV/GB' }))),
        h('tbody', null, ...rows)),
    );
  }

  private leaderPanel(career: Career, lines: StatLine[]): HTMLElement {
    let cat: LeaderCategory = 'points';
    const list = h('div', { class: 'stack', style: 'gap:0' });

    const render = () => {
      clear(list);
      const top = leaders(lines, cat, 10);
      if (!top.length) {
        list.appendChild(h('div', { class: 'empty', text: 'Nothing recorded yet.' }));
        return;
      }
      top.forEach((l, i) => {
        const team = effectiveTeam(career, l.teamId);
        list.appendChild(h('div', { class: `leader${l.teamId === career.teamId ? ' is-you' : ''}` },
          h('span', { class: 'leader__rank num', text: String(i + 1) }),
          teamBadge(team, 'sm'),
          h('span', { class: 'leader__name', text: l.name }),
          h('span', { class: 'leader__team', text: team.abbr }),
          h('span', { class: 'leader__val num', text: String(leaderValue(l, cat)) })));
      });
    };

    const tabs = segmented<LeaderCategory>(
      CATEGORIES.map((c) => ({ value: c, label: LEADER_LABEL[c] })),
      cat,
      (v) => { cat = v; render(); },
      true,
    );
    render();
    return panel('District leaders', tabs, list);
  }
}
